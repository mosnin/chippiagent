/**
 * PATCH  /api/routines/[id] — edit instruction / cadence / hour / enabled.
 * DELETE /api/routines/[id] — remove a routine.
 * POST   /api/routines/[id] — run it now, once, immediately.
 *
 * Every query is scoped by spaceId as well as id, so a routine that isn't
 * the caller's simply doesn't match — ownership check and 404 in one.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { fireRoutineRun, ROUTINE_CADENCES } from '@/lib/routines';

export const runtime = 'nodejs';

const SELECT =
  'id, instruction, cadence, hour, enabled, lastRunAt, lastRunStatus, nextRunAt, createdAt';

const MAX_INSTRUCTION = 600;
const MIN_INSTRUCTION = 10;

function isCadence(v: unknown): v is (typeof ROUTINE_CADENCES)[number] {
  return typeof v === 'string' && (ROUTINE_CADENCES as readonly string[]).includes(v);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof body.instruction === 'string') {
    const trimmed = body.instruction.trim();
    if (trimmed.length < MIN_INSTRUCTION) {
      return NextResponse.json(
        { error: 'Write a full sentence — what should Chippi do?' },
        { status: 400 },
      );
    }
    patch.instruction = trimmed.slice(0, MAX_INSTRUCTION);
  }
  if (isCadence(body.cadence)) patch.cadence = body.cadence;
  if (typeof body.hour === 'number') {
    const hour = Math.floor(body.hour);
    if (hour >= 0 && hour <= 23) patch.hour = hour;
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  // updatedAt + nextRunAt are recomputed by the table trigger.
  const { data, error } = await supabase
    .from('Routine')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select(SELECT)
    .maybeSingle();

  if (error) {
    logger.error('[routines] update failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('Routine')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (error) {
    logger.error('[routines] delete failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: routine } = await supabase
    .from('Routine')
    .select('id, instruction')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!routine) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Optimistically stamp the run so the UI updates instantly. after() corrects
  // the status to 'error' if the dispatch never landed. The Modal endpoint
  // doesn't return until the run finishes, so we don't block the response on it.
  await supabase
    .from('Routine')
    .update({ lastRunAt: new Date().toISOString(), lastRunStatus: 'ok' })
    .eq('id', id)
    .eq('spaceId', space.id);

  after(async () => {
    const status = await fireRoutineRun(space.id, routine.instruction);
    if (status === 'error') {
      await supabase
        .from('Routine')
        .update({ lastRunStatus: 'error' })
        .eq('id', id)
        .eq('spaceId', space.id);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
