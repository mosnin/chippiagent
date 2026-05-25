import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

/**
 * PUT /api/form-config/save-scoring
 *
 * Persists a manually-adjusted scoring model to SpaceSetting.
 *
 * Body: { slug, leadType: 'rental' | 'buyer', scoringModel: ScoringModel }
 * Returns: { success: true }
 */
export async function PUT(req: NextRequest) {
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

  // Rate limit: 20 saves per hour per user
  const { allowed } = await checkRateLimit(
    `save-scoring:${userId}`,
    20,
    3600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many scoring saves. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  const scoringModel = body.scoringModel as ScoringModel | undefined;
  if (!scoringModel || !scoringModel.weights || typeof scoringModel.weights !== 'object') {
    return NextResponse.json(
      { error: 'Invalid scoring model' },
      { status: 400 },
    );
  }

  // Validate weights sum to ~100 (allow small rounding margin)
  const totalWeight = Object.values(scoringModel.weights).reduce(
    (sum, w) => sum + (w.weight || 0),
    0,
  );
  if (totalWeight < 95 || totalWeight > 105) {
    return NextResponse.json(
      { error: `Weights must sum to approximately 100 (got ${totalWeight})` },
      { status: 400 },
    );
  }

  const column =
    leadType === 'rental' ? 'rentalScoringModel' : 'buyerScoringModel';

  const { error: updateErr } = await supabase
    .from('SpaceSetting')
    .update({ [column]: scoringModel })
    .eq('spaceId', space.id);

  if (updateErr) {
    console.error('[save-scoring] Failed to save scoring model', updateErr);
    return NextResponse.json(
      { error: 'Failed to save scoring model' },
      { status: 500 },
    );
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
      source: 'manual',
    },
  });

  return NextResponse.json({ success: true });
}
