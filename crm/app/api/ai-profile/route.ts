import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';

const VALID_BUSINESS_FOCUS = [
  'residential',
  'commercial',
  'luxury',
  'rentals',
  'investment',
  'new_construction',
] as const;

const VALID_WORKING_STYLE = [
  'aggressive',
  'methodical',
  'relationship-first',
  'tech-forward',
  'balanced',
] as const;

const VALID_COMMUNICATION_TONE = ['formal', 'casual', 'direct', 'warm'] as const;

interface AIProfileBody {
  spaceId: string;
  displayName?: string;
  businessFocus?: string[];
  yearsExperience?: number;
  workingStyle?: string;
  communicationTone?: string;
  currentGoals?: string;
  quirksAndPreferences?: string;
  agentPersonalizationNote?: string;
}

// ── GET /api/ai-profile?spaceId=... ──────────────────────────────────────────
// Fetch the AI personalization profile for a space.

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('AIUserProfile')
    .select('*')
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (error) {
    console.error('[ai-profile/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch AI profile' }, { status: 500 });
  }

  return NextResponse.json({ profile: data ?? null });
}

// ── PUT /api/ai-profile ───────────────────────────────────────────────────────
// Upsert the AI personalization profile for a space.

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: AIProfileBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { spaceId } = body;
  if (!spaceId || typeof spaceId !== 'string') {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  // ── Validate allowlists ───────────────────────────────────────────────────

  if (body.businessFocus !== undefined) {
    if (!Array.isArray(body.businessFocus)) {
      return NextResponse.json({ error: 'businessFocus must be an array' }, { status: 400 });
    }
    const invalid = body.businessFocus.filter(
      (v) => !VALID_BUSINESS_FOCUS.includes(v as (typeof VALID_BUSINESS_FOCUS)[number]),
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid businessFocus value(s): ${invalid.join(', ')}` },
        { status: 400 },
      );
    }
  }

  if (
    body.workingStyle !== undefined &&
    !VALID_WORKING_STYLE.includes(body.workingStyle as (typeof VALID_WORKING_STYLE)[number])
  ) {
    return NextResponse.json(
      { error: `Invalid workingStyle. Allowed: ${VALID_WORKING_STYLE.join(', ')}` },
      { status: 400 },
    );
  }

  if (
    body.communicationTone !== undefined &&
    !VALID_COMMUNICATION_TONE.includes(
      body.communicationTone as (typeof VALID_COMMUNICATION_TONE)[number],
    )
  ) {
    return NextResponse.json(
      { error: `Invalid communicationTone. Allowed: ${VALID_COMMUNICATION_TONE.join(', ')}` },
      { status: 400 },
    );
  }

  // ── Validate length caps ──────────────────────────────────────────────────

  if (body.currentGoals !== undefined && body.currentGoals.length > 1000) {
    return NextResponse.json(
      { error: 'currentGoals exceeds 1000 character limit' },
      { status: 400 },
    );
  }

  if (body.quirksAndPreferences !== undefined && body.quirksAndPreferences.length > 1000) {
    return NextResponse.json(
      { error: 'quirksAndPreferences exceeds 1000 character limit' },
      { status: 400 },
    );
  }

  if (body.agentPersonalizationNote !== undefined && body.agentPersonalizationNote.length > 2000) {
    return NextResponse.json(
      { error: 'agentPersonalizationNote exceeds 2000 character limit' },
      { status: 400 },
    );
  }

  // ── Build upsert payload (only include defined fields) ────────────────────

  const payload: Record<string, unknown> = { spaceId };

  if (body.displayName !== undefined) payload.displayName = body.displayName;
  if (body.businessFocus !== undefined) payload.businessFocus = body.businessFocus;
  if (body.yearsExperience !== undefined) payload.yearsExperience = body.yearsExperience;
  if (body.workingStyle !== undefined) payload.workingStyle = body.workingStyle;
  if (body.communicationTone !== undefined) payload.communicationTone = body.communicationTone;
  if (body.currentGoals !== undefined) payload.currentGoals = body.currentGoals;
  if (body.quirksAndPreferences !== undefined)
    payload.quirksAndPreferences = body.quirksAndPreferences;
  if (body.agentPersonalizationNote !== undefined)
    payload.agentPersonalizationNote = body.agentPersonalizationNote;

  const { data, error } = await supabase
    .from('AIUserProfile')
    .upsert(payload, { onConflict: 'spaceId' })
    .select();

  if (error) {
    console.error('[ai-profile/PUT] upsert error:', error);
    return NextResponse.json({ error: 'Failed to save AI profile' }, { status: 500 });
  }

  return NextResponse.json({ profile: data[0] });
}
