/**
 * GET  /api/routines — the space's routines, oldest first.
 * POST /api/routines — create a routine (instruction + cadence + hour).
 *
 * nextRunAt is never sent by the client — the Routine table's trigger
 * computes it from cadence + hour. The client owns the sentence and the
 * time; the database owns the schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { ROUTINE_CADENCES } from '@/lib/routines';

export const runtime = 'nodejs';

const SELECT =
  'id, instruction, cadence, hour, enabled, lastRunAt, lastRunStatus, nextRunAt, createdAt';

const MAX_ROUTINES = 20;
const MAX_INSTRUCTION = 600;
const MIN_INSTRUCTION = 10;

function isCadence(v: unknown): v is (typeof ROUTINE_CADENCES)[number] {
  return typeof v === 'string' && (ROUTINE_CADENCES as readonly string[]).includes(v);
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('Routine')
    .select(SELECT)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: true });

  if (error) {
    logger.error('[routines] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }

  return NextResponse.json({ routines: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const instruction =
    typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (instruction.length < MIN_INSTRUCTION) {
    return NextResponse.json(
      { error: 'Write a full sentence — what should Chippi do?' },
      { status: 400 },
    );
  }

  const cadence = isCadence(body.cadence) ? body.cadence : 'daily';
  let hour = typeof body.hour === 'number' ? Math.floor(body.hour) : 13;
  if (hour < 0 || hour > 23) hour = 13;

  // Cap routines per space — a wall of standing instructions is its own mess.
  const { count } = await supabase
    .from('Routine')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', space.id);
  if ((count ?? 0) >= MAX_ROUTINES) {
    return NextResponse.json(
      { error: `You've reached the limit of ${MAX_ROUTINES} routines.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('Routine')
    .insert({
      spaceId: space.id,
      instruction: instruction.slice(0, MAX_INSTRUCTION),
      cadence,
      hour,
    })
    .select(SELECT)
    .single();

  if (error) {
    logger.error('[routines] create failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
