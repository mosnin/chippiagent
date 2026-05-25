import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { requireSpaceOwner } from '@/lib/api-auth';

// ── Validation schemas ──────────────────────────────────────────────────────

const EVENT_TYPES = [
  'form_start',
  'step_view',
  'step_complete',
  'form_submit',
  'form_abandon',
] as const;

const eventSchema = z.object({
  spaceId: z.string().min(1).max(255),
  sessionId: z.string().min(1).max(255),
  formConfigVersion: z.number().int().optional(),
  eventType: z.enum(EVENT_TYPES),
  stepIndex: z.number().int().min(0).max(100).optional(),
  stepTitle: z.string().max(500).optional(),
  durationMs: z.number().int().min(0).max(3_600_000).optional(), // max 1 hour
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

/**
 * Sanitize metadata object: limit depth, strip HTML from string values, cap size.
 */
function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = Object.keys(meta).slice(0, 20); // Max 20 keys
  for (const key of keys) {
    const val = meta[key];
    if (typeof val === 'string') {
      result[key] = val.replace(/<[^>]*>/g, '').slice(0, 500);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      result[key] = val;
    }
    // Drop non-primitive values (arrays, objects, functions) to prevent abuse
  }
  return result;
}

// ── POST — Public endpoint to receive analytics events ──────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Support both single event and batch
  let events: z.infer<typeof eventSchema>[];

  if (Array.isArray((body as any)?.events)) {
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event data' },
        { status: 400 },
      );
    }
    events = parsed.data.events;
  } else {
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event data' },
        { status: 400 },
      );
    }
    events = [parsed.data];
  }

  // Rate limit by IP to prevent abuse from rotating session IDs
  const ip = getClientIp(req);
  const { allowed: ipAllowed } = await checkRateLimit(
    `form-analytics:rl:ip:${ip}`,
    200,
    3600,
  );
  if (!ipAllowed) {
    return NextResponse.json(
      { error: 'Too many events. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Also rate limit per session to prevent single-session flooding
  // Truncate sessionId for rate limit key to prevent key-length manipulation
  const sessionId = events[0].sessionId.slice(0, 64);
  const { allowed } = await checkRateLimit(
    `form-analytics:rl:${sessionId}`,
    60,
    3600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many events. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Validate that the spaceId actually exists (prevent analytics pollution for arbitrary IDs)
  // Always return 202 Accepted to prevent space ID enumeration
  const spaceId = events[0].spaceId;
  try {
    const { data: space } = await supabase
      .from('Space')
      .select('id')
      .eq('id', spaceId)
      .maybeSingle();
    if (!space) {
      console.warn('[form-analytics] event received for invalid spaceId', { spaceId });
      return NextResponse.json({ accepted: true }, { status: 202 });
    }
  } catch {
    console.warn('[form-analytics] space validation failed', { spaceId });
    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  // Ensure all events in batch target the same space (prevent cross-space pollution)
  if (events.some(e => e.spaceId !== spaceId)) {
    return NextResponse.json({ error: 'All events in a batch must target the same space' }, { status: 400 });
  }

  // Strip any potentially sensitive metadata keys and sanitize stepTitle
  const sanitizedEvents = events.map((e) => ({
    spaceId: e.spaceId,
    sessionId: e.sessionId,
    formConfigVersion: e.formConfigVersion ?? null,
    eventType: e.eventType,
    stepIndex: e.stepIndex ?? null,
    stepTitle: e.stepTitle ? e.stepTitle.replace(/<[^>]*>/g, '').slice(0, 200) : null,
    durationMs: e.durationMs ?? null,
    metadata: e.metadata ? sanitizeMetadata(e.metadata) : null,
  }));

  try {
    const { error } = await supabase
      .from('FormAnalyticsEvent')
      .insert(sanitizedEvents);

    if (error) {
      console.error('[form-analytics] insert failed', error);
      return NextResponse.json({ error: 'Failed to store events' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: sanitizedEvents.length });
  } catch (err) {
    console.error('[form-analytics] unexpected error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── GET — Auth'd endpoint for space owners to fetch analytics ───────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);
  const formVersion = searchParams.get('formVersion')
    ? parseInt(searchParams.get('formVersion')!, 10)
    : undefined;

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug parameter' }, { status: 400 });
  }

  // Auth: require space owner
  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;

  const { space } = authResult;

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    // Build query
    let query = supabase
      .from('FormAnalyticsEvent')
      .select('id, sessionId, formConfigVersion, eventType, stepIndex, stepTitle, durationMs, metadata, createdAt')
      .eq('spaceId', space.id)
      .gte('createdAt', cutoff)
      .order('createdAt', { ascending: true })
      .limit(10000);

    if (formVersion !== undefined) {
      query = query.eq('formConfigVersion', formVersion);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('[form-analytics] query failed', error);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    type EventRow = {
      id: string;
      sessionId: string;
      formConfigVersion: number | null;
      eventType: string;
      stepIndex: number | null;
      stepTitle: string | null;
      durationMs: number | null;
      metadata: Record<string, unknown> | null;
      createdAt: string;
    };

    const allEvents = (events ?? []) as EventRow[];

    // ── Compute analytics from raw events ────────────────────────────────

    // Unique sessions
    const sessions = new Set(allEvents.map((e) => e.sessionId));

    // Count by event type
    const starts = allEvents.filter((e) => e.eventType === 'form_start').length;
    const submits = allEvents.filter((e) => e.eventType === 'form_submit').length;
    const abandons = allEvents.filter((e) => e.eventType === 'form_abandon').length;

    // Unique sessions that started vs submitted
    const startSessions = new Set(
      allEvents.filter((e) => e.eventType === 'form_start').map((e) => e.sessionId),
    );
    const submitSessions = new Set(
      allEvents.filter((e) => e.eventType === 'form_submit').map((e) => e.sessionId),
    );

    const completionRate =
      startSessions.size > 0
        ? Math.round((submitSessions.size / startSessions.size) * 100)
        : 0;

    // Step funnel: unique sessions that reached each step (via step_view or step_complete)
    const stepEvents = allEvents.filter(
      (e) => e.eventType === 'step_view' || e.eventType === 'step_complete',
    );

    // Gather step data
    const stepMap = new Map<
      number,
      { title: string; sessions: Set<string>; durations: number[] }
    >();

    for (const e of stepEvents) {
      if (e.stepIndex == null) continue;
      if (!stepMap.has(e.stepIndex)) {
        stepMap.set(e.stepIndex, {
          title: e.stepTitle ?? `Step ${e.stepIndex + 1}`,
          sessions: new Set(),
          durations: [],
        });
      }
      const step = stepMap.get(e.stepIndex)!;
      step.sessions.add(e.sessionId);
      if (e.stepTitle) step.title = e.stepTitle;
    }

    // Add duration data from step_complete events
    const stepCompleteEvents = allEvents.filter((e) => e.eventType === 'step_complete');
    for (const e of stepCompleteEvents) {
      if (e.stepIndex == null || e.durationMs == null) continue;
      if (!stepMap.has(e.stepIndex)) continue;
      stepMap.get(e.stepIndex)!.durations.push(e.durationMs);
    }

    // Build ordered funnel data
    const sortedSteps = [...stepMap.entries()].sort((a, b) => a[0] - b[0]);

    const funnelData = sortedSteps.map(([stepIndex, data]) => ({
      stepIndex,
      stepTitle: data.title,
      uniqueSessions: data.sessions.size,
      avgDurationMs:
        data.durations.length > 0
          ? Math.round(
              data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
            )
          : null,
    }));

    // Drop-off rates between steps
    const dropOffData = funnelData.map((step, i) => {
      const prevCount =
        i === 0 ? startSessions.size : funnelData[i - 1].uniqueSessions;
      const dropOff =
        prevCount > 0
          ? Math.max(0, Math.min(100, Math.round(((prevCount - step.uniqueSessions) / prevCount) * 100)))
          : 0;
      return {
        stepIndex: step.stepIndex,
        stepTitle: step.stepTitle,
        dropOffPercent: dropOff,
      };
    });

    // ── Recent leads (last 10 form submissions that created contacts) ────
    let recentLeads: {
      id: string;
      name: string | null;
      email: string | null;
      createdAt: string;
      scoreLabel: string | null;
      leadScore: number | null;
    }[] = [];

    try {
      const { data: leads } = await supabase
        .from('Contact')
        .select('id, name, email, createdAt, scoreLabel, leadScore, tags')
        .eq('spaceId', space.id)
        .contains('tags', ['application-link'])
        .gte('createdAt', cutoff)
        .order('createdAt', { ascending: false })
        .limit(10);

      recentLeads = (leads ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        createdAt: l.createdAt,
        scoreLabel: l.scoreLabel,
        leadScore: l.leadScore,
      }));
    } catch {
      // Non-critical — return empty array
    }

    return NextResponse.json({
      days,
      totalSessions: sessions.size,
      totalStarts: startSessions.size,
      totalSubmits: submitSessions.size,
      totalAbandons: abandons,
      completionRate,
      funnel: funnelData,
      dropOff: dropOffData,
      recentLeads,
    });
  } catch (err) {
    console.error('[form-analytics] unexpected error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
