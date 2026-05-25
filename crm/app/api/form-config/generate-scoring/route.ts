import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { formConfigSchema } from '@/lib/form-config-schema';
import { generateScoringModel } from '@/lib/scoring/generate-scoring-model';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';

/**
 * POST /api/form-config/generate-scoring
 *
 * Generates an AI-powered scoring model for the given form configuration.
 * Rate limited to 5 calls per hour per space.
 *
 * Body: { slug, leadType: 'rental' | 'buyer', formConfig }
 * Returns: { scoringModel }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug as string | undefined;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const leadType = body.leadType as string | undefined;
  if (!leadType || (leadType !== 'rental' && leadType !== 'buyer')) {
    return NextResponse.json(
      { error: 'leadType must be "rental" or "buyer"' },
      { status: 400 },
    );
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Rate limit: 5 scoring model generations per hour per space
  const { allowed } = await checkRateLimit(
    `generate-scoring:${space.id}`,
    5,
    3600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many scoring model generations. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Validate the form config
  const parsed = formConfigSchema.safeParse(body.formConfig);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid form config', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const formConfig = parsed.data;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI scoring is not configured on this server.' },
      { status: 503 },
    );
  }

  try {
    const scoringModel = await generateScoringModel(formConfig);

    // Store the scoring model in SpaceSetting
    const column =
      leadType === 'rental' ? 'rentalScoringModel' : 'buyerScoringModel';

    const { error: updateErr } = await supabase
      .from('SpaceSetting')
      .update({ [column]: scoringModel })
      .eq('spaceId', space.id);

    if (updateErr) {
      console.error('[generate-scoring] Failed to save scoring model', updateErr);
      // Still return the model even if storage fails
    }

    void audit({
      actorClerkId: userId,
      action: 'UPDATE',
      resource: 'SpaceSetting',
      resourceId: space.id,
      spaceId: space.id,
      metadata: {
        field: column,
        leadType,
        questionCount: Object.keys(scoringModel.weights).length,
      },
    });

    return NextResponse.json({ scoringModel });
  } catch (error) {
    console.error('[generate-scoring] Failed to generate scoring model', error);
    return NextResponse.json(
      { error: 'Failed to generate scoring model' },
      { status: 500 },
    );
  }
}
