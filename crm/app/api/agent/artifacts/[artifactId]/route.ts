import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';

// GET /api/agent/artifacts/[artifactId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:artifacts:get:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { artifactId } = await params;

  // Fetch artifact first to derive spaceId for auth
  const { data: artifact, error: artifactError } = await supabase
    .from('Artifact')
    .select('*')
    .eq('id', artifactId)
    .maybeSingle();

  if (artifactError) {
    console.error('[GET /api/agent/artifacts/[artifactId]]', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify space ownership
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== artifact.spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all versions ordered by versionNumber ASC
  const { data: versions, error: versionsError } = await supabase
    .from('ArtifactVersion')
    .select('*')
    .eq('artifactId', artifactId)
    .order('versionNumber', { ascending: true });

  if (versionsError) {
    console.error('[GET /api/agent/artifacts/[artifactId]] versions error:', versionsError);
    return NextResponse.json({ error: 'Failed to fetch artifact versions' }, { status: 500 });
  }

  return NextResponse.json({ artifact: { ...artifact, versions: versions ?? [] } });
}

// PATCH /api/agent/artifacts/[artifactId]
// Body: { content: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:artifacts:version:${userId}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { artifactId } = await params;

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { content } = body;
  if (content === undefined || content === null) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  // Fetch artifact to verify existence and derive spaceId
  const { data: artifact, error: artifactError } = await supabase
    .from('Artifact')
    .select('*')
    .eq('id', artifactId)
    .maybeSingle();

  if (artifactError) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]]', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify space ownership
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== artifact.spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get max versionNumber for this artifact
  const { data: maxRow, error: maxError } = await supabase
    .from('ArtifactVersion')
    .select('versionNumber')
    .eq('artifactId', artifactId)
    .order('versionNumber', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]] maxVersion error:', maxError);
    return NextResponse.json({ error: 'Failed to determine version number' }, { status: 500 });
  }

  const nextVersionNumber = (maxRow?.versionNumber ?? 0) + 1;

  // Insert new ArtifactVersion
  const { data: newVersion, error: versionError } = await supabase
    .from('ArtifactVersion')
    .insert({
      artifactId,
      content,
      versionNumber: nextVersionNumber,
    })
    .select()
    .single();

  if (versionError || !newVersion) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]] insert version error:', versionError);
    return NextResponse.json({ error: 'Failed to create new version' }, { status: 500 });
  }

  // Update Artifact.currentVersionId and updatedAt
  const { data: updatedArtifact, error: updateError } = await supabase
    .from('Artifact')
    .update({ currentVersionId: newVersion.id, updatedAt: new Date().toISOString() })
    .eq('id', artifactId)
    .select()
    .single();

  if (updateError || !updatedArtifact) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]] update artifact error:', updateError);
    return NextResponse.json({ error: 'Failed to update artifact' }, { status: 500 });
  }

  return NextResponse.json({ artifact: { ...updatedArtifact, newVersion } });
}
