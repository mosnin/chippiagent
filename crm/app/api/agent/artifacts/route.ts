import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';

// GET /api/agent/artifacts?spaceId=xxx[&taskId=yyy][&type=zzz]
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:artifacts:list:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) return NextResponse.json({ error: 'spaceId required' }, { status: 400 });

  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const taskId = req.nextUrl.searchParams.get('taskId');
  const type = req.nextUrl.searchParams.get('type');

  let query = supabase
    .from('Artifact')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (taskId) query = query.eq('taskId', taskId);
  if (type) query = query.eq('artifactType', type);

  const { data, error } = await query;
  if (error) {
    console.error('[GET /api/agent/artifacts]', error);
    return NextResponse.json({ error: 'Failed to fetch artifacts' }, { status: 500 });
  }

  return NextResponse.json({ artifacts: data ?? [] });
}

// POST /api/agent/artifacts
// Body: { spaceId, taskId?, type, title, content }
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:artifacts:create:${userId}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  let body: { spaceId?: string; taskId?: string; type?: string; title?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { spaceId, taskId, type, title, content } = body;

  if (!spaceId) return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (content === undefined || content === null) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
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

  // Step 1: insert Artifact without currentVersionId
  const artifactInsert: Record<string, unknown> = {
    spaceId,
    artifactType: type,
    title,
  };
  if (taskId) artifactInsert.taskId = taskId;

  const { data: artifact, error: artifactError } = await supabase
    .from('Artifact')
    .insert(artifactInsert)
    .select()
    .single();

  if (artifactError || !artifact) {
    console.error('[POST /api/agent/artifacts] Insert artifact error:', artifactError);
    return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
  }

  // Step 2: insert ArtifactVersion
  const { data: version, error: versionError } = await supabase
    .from('ArtifactVersion')
    .insert({
      artifactId: artifact.id,
      content,
      versionNumber: 1,
    })
    .select()
    .single();

  if (versionError || !version) {
    console.error('[POST /api/agent/artifacts] Insert version error:', versionError);
    return NextResponse.json({ error: 'Failed to create artifact version' }, { status: 500 });
  }

  // Step 3: update Artifact.currentVersionId
  const { data: updatedArtifact, error: updateError } = await supabase
    .from('Artifact')
    .update({ currentVersionId: version.id })
    .eq('id', artifact.id)
    .select()
    .single();

  if (updateError || !updatedArtifact) {
    console.error('[POST /api/agent/artifacts] Update currentVersionId error:', updateError);
    return NextResponse.json({ error: 'Failed to link artifact version' }, { status: 500 });
  }

  return NextResponse.json(
    { artifact: { ...updatedArtifact, currentVersion: version } },
    { status: 201 },
  );
}
