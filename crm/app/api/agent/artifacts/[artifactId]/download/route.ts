import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

// MIME type + file extension for each artifact type
function getMimeAndExt(artifactType: string): { mime: string; ext: string } {
  switch (artifactType) {
    case 'draft_email':
    case 'draft_sms':
    case 'raw_output':
    case 'contact_update':
    case 'deal_update':
    case 'tour_booking':
    case 'goal_plan':
      return { mime: 'text/plain', ext: 'txt' };
    case 'report':
      return { mime: 'text/markdown', ext: 'md' };
    default:
      return { mime: 'application/octet-stream', ext: 'bin' };
  }
}

// GET /api/agent/artifacts/[artifactId]/download?version=N
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { artifactId } = await params;
  const versionParam = req.nextUrl.searchParams.get('version');

  // 1. Fetch artifact
  const { data: artifact, error: artifactError } = await supabase
    .from('Artifact')
    .select('id, title, artifactType, spaceId, currentVersionId')
    .eq('id', artifactId)
    .maybeSingle();

  if (artifactError) {
    console.error('[GET /api/agent/artifacts/[artifactId]/download] artifact fetch:', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  // Return 404 regardless of whether artifact doesn't exist or belongs to another tenant —
  // avoids confirming artifact existence to cross-tenant callers.
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 2. Ownership check — cross-tenant returns 404, not 403, to avoid leaking existence
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== artifact.spaceId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 3. Fetch the target ArtifactVersion
  let versionQuery = supabase
    .from('ArtifactVersion')
    .select('id, versionNumber, content')
    .eq('artifactId', artifactId);

  if (versionParam !== null) {
    const versionNumber = parseInt(versionParam, 10);
    if (isNaN(versionNumber) || versionNumber < 1) {
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    }
    versionQuery = versionQuery.eq('versionNumber', versionNumber);
  } else if (artifact.currentVersionId) {
    versionQuery = versionQuery.eq('id', artifact.currentVersionId);
  } else {
    // No currentVersionId set — fall back to highest version
    versionQuery = versionQuery.order('versionNumber', { ascending: false }).limit(1);
  }

  const { data: version, error: versionError } = await versionQuery.maybeSingle();

  if (versionError) {
    console.error('[GET /api/agent/artifacts/[artifactId]/download] version fetch:', versionError);
    return NextResponse.json({ error: 'Failed to fetch artifact version' }, { status: 500 });
  }
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  // 4. Build response with correct MIME type and Content-Disposition
  const { mime, ext } = getMimeAndExt(artifact.artifactType ?? '');
  const safeTitle = (artifact.title ?? 'artifact').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const filename = `${safeTitle}-v${version.versionNumber}.${ext}`;

  return new Response(version.content, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
