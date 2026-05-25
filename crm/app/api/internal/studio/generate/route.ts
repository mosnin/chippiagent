/**
 * POST /api/internal/studio/generate — internal generation endpoint for the
 * Chippi agent (Modal/Python). Authed by AGENT_INTERNAL_SECRET, not Clerk.
 *
 * The agent run carries spaceId only, so this route resolves the space
 * owner's Clerk userId for the File / StudioGeneration rows, then runs the
 * shared generation core — generation, storage, and metering stay in one place.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { falConfigured } from '@/lib/studio/fal';
import { runStudioGeneration, StudioGenerationError } from '@/lib/studio/generate';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!falConfigured()) {
    return NextResponse.json({ error: 'Generation is not configured.' }, { status: 503 });
  }

  let body: { spaceId?: unknown; prompt?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId is required' }, { status: 400 });
  }

  // Per-space hourly call cap — the bearer secret authenticates Modal, but a
  // compromised secret or a runaway agent loop must not be able to fan out
  // unlimited fal generations. seedance-video is $0.50/call.
  const rl = await checkRateLimit(`studio:internal:generate:${spaceId}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many Studio generations for this workspace. Try again in an hour.' },
      { status: 429 },
    );
  }

  // The agent context carries spaceId only — resolve the space owner's Clerk
  // userId, since File rows are stamped with a Clerk userId.
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('ownerId')
    .eq('id', spaceId)
    .maybeSingle();
  if (!spaceRow?.ownerId) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }
  const { data: ownerRow } = await supabase
    .from('User')
    .select('clerkId')
    .eq('id', spaceRow.ownerId as string)
    .maybeSingle();
  const userId = (ownerRow?.clerkId as string | undefined) ?? '';
  if (!userId) {
    return NextResponse.json({ error: 'Space owner not found' }, { status: 404 });
  }

  try {
    const result = await runStudioGeneration({
      spaceId,
      userId,
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
      modelSlug: typeof body.model === 'string' ? body.model : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof StudioGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 });
  }
}
