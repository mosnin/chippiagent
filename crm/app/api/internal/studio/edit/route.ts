/**
 * POST /api/internal/studio/edit — internal edit endpoint for the Chippi
 * agent (Modal/Python). Authed by AGENT_INTERNAL_SECRET, not Clerk. Edits an
 * existing File the agent references by id (e.g. an image it just generated).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { falConfigured } from '@/lib/studio/fal';
import { runStudioEdit } from '@/lib/studio/edit';
import { StudioGenerationError } from '@/lib/studio/generate';

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
    return NextResponse.json({ error: 'Editing is not configured.' }, { status: 503 });
  }

  let body: { spaceId?: unknown; fileId?: unknown; tool?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const fileId = typeof body.fileId === 'string' ? body.fileId : '';
  const toolSlug = typeof body.tool === 'string' ? body.tool : '';
  if (!spaceId || !fileId || !toolSlug) {
    return NextResponse.json(
      { error: 'spaceId, fileId and tool are required' },
      { status: 400 },
    );
  }

  // Per-space hourly call cap. The bearer secret authenticates Modal, not the
  // upstream agent run — a runaway loop must not blow the wallet.
  const rl = await checkRateLimit(`studio:internal:edit:${spaceId}`, 30, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many Studio edits for this workspace. Try again in an hour.' },
      { status: 429 },
    );
  }

  // Resolve the space owner's Clerk userId for the File / generation rows.
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
    const result = await runStudioEdit({
      spaceId,
      userId,
      sourceFileId: fileId,
      toolSlug,
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof StudioGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'The edit failed.' }, { status: 500 });
  }
}
