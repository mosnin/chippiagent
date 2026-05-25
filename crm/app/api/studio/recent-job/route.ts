/**
 * GET /api/studio/recent-job — the most recent in-flight or just-finished
 * Studio job for the realtor's space.
 *
 * Studio generation is synchronous (the route holds the connection open until
 * fal returns), so a refresh / nav / tab-close mid-job used to lose the result
 * — the realtor paid $0.50 for a seedance-video and saw a black hole. The
 * StudioGeneration row is the source of truth; the Create / Edit panels poll
 * this endpoint on mount to pick the job back up.
 *
 * Query params:
 *   source='create' — only generations with no sourceFileId (fresh prompts).
 *   source='edit'   — only generations with a sourceFileId (transforms).
 *   anything else   — no filter (latest job of any kind).
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';

export const runtime = 'nodejs';

// A job older than this that is still 'running' is presumed orphaned (the
// lambda died mid-call before recording completion). Treat as no job so the
// spinner can never wedge a panel forever.
const RUNNING_MAX_AGE_S = 600;

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const space = await getSpaceForUser(auth.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const source = url.searchParams.get('source');

  const baseQuery = supabase
    .from('StudioGeneration')
    .select('id, status, kind, fileId, errorMessage, sourceFileId, createdAt')
    .eq('spaceId', space.id);
  const filtered =
    source === 'create'
      ? baseQuery.is('sourceFileId', null)
      : source === 'edit'
        ? baseQuery.not('sourceFileId', 'is', null)
        : baseQuery;

  const { data, error } = await filtered
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ job: null });

  const ageS = (Date.now() - new Date(data.createdAt as string).getTime()) / 1000;
  const status = data.status as string;
  const kind: 'image' | 'video' = (data.kind as string) === 'video' ? 'video' : 'image';

  if (status === 'running') {
    if (ageS > RUNNING_MAX_AGE_S) {
      // Presumed orphaned; don't trap the panel in a permanent spinner.
      return NextResponse.json({ job: null });
    }
    return NextResponse.json({
      job: { id: data.id, status: 'running', kind },
    });
  }

  if (status === 'completed' && data.fileId) {
    const { data: file } = await supabase
      .from('File')
      .select('storageKey')
      .eq('id', data.fileId as string)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (file?.storageKey) {
      const downloadUrl = await getSignedDownloadUrl(file.storageKey as string, 3600);
      return NextResponse.json({
        job: {
          id: data.id,
          status: 'completed',
          kind,
          fileId: data.fileId,
          url: downloadUrl,
        },
      });
    }
  }

  if (status === 'failed') {
    return NextResponse.json({
      job: {
        id: data.id,
        status: 'failed',
        kind,
        errorMessage: (data.errorMessage as string | null) ?? undefined,
      },
    });
  }

  return NextResponse.json({ job: null });
}
