/**
 * POST /api/studio/generate — generate an image or video with fal.ai.
 *
 * The realtor-facing entry point: Clerk auth, subscription gate, and rate
 * limiting live here; the generation itself runs in the shared core
 * (lib/studio/generate.ts), which the Chippi agent's internal route reuses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireActiveSubscription } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import { falConfigured } from '@/lib/studio/fal';
import { runStudioGeneration, StudioGenerationError } from '@/lib/studio/generate';

export const runtime = 'nodejs';
// Video models run for a few minutes — give the request room.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subCheck = await requireActiveSubscription(space, userId);
  if (subCheck) return subCheck;

  if (!falConfigured()) {
    return NextResponse.json(
      { error: 'Generation is not configured yet.' },
      { status: 503 },
    );
  }

  const { allowed } = await checkRateLimit(`studio:generate:${userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many generations. Try again in a little while.' },
      { status: 429 },
    );
  }

  let body: { prompt?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await runStudioGeneration({
      spaceId: space.id,
      userId,
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
      modelSlug: typeof body.model === 'string' ? body.model : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof StudioGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: 'Generation failed. Please try again.' },
      { status: 500 },
    );
  }
}
