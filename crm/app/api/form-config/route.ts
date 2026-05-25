import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { formConfigSchema } from '@/lib/form-config-schema';
import { checkRateLimit } from '@/lib/rate-limit';
import { generateScoringModel } from '@/lib/scoring/generate-scoring-model';

const MAX_FORM_CONFIG_SIZE = 512_000; // 500KB
const MAX_TOTAL_QUESTIONS = 200;

/**
 * GET /api/form-config?slug={slug}
 * Returns BOTH rental and buyer form configs from SpaceSetting.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data: settings, error } = await supabase
    .from('SpaceSetting')
    .select('rentalFormConfig, buyerFormConfig, formConfig, formConfigSource, rentalScoringModel, buyerScoringModel')
    .eq('spaceId', space.id)
    .maybeSingle();
  if (error) {
    console.error('[form-config] GET query failed', error);
    return NextResponse.json({ error: 'Failed to fetch form config' }, { status: 500 });
  }

  // Backwards compatibility: if rentalFormConfig is null but old formConfig exists, use it
  let rentalFormConfig = settings?.rentalFormConfig ?? null;
  const buyerFormConfig = settings?.buyerFormConfig ?? null;
  const formConfigSource: 'custom' | 'brokerage' | 'legacy' =
    settings?.formConfigSource ?? 'legacy';

  if (!rentalFormConfig && settings?.formConfig) {
    rentalFormConfig = settings.formConfig;
  }

  return NextResponse.json({
    rentalFormConfig,
    buyerFormConfig,
    formConfigSource,
    rentalScoringModel: settings?.rentalScoringModel ?? null,
    buyerScoringModel: settings?.buyerScoringModel ?? null,
  });
}

/**
 * PUT /api/form-config
 * Validate and save a custom form config for the space.
 * Accepts { slug, leadType: 'rental' | 'buyer', formConfig }
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
    return NextResponse.json({ error: 'leadType must be "rental" or "buyer"' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Rate limit: 10 updates per hour per user
  const { allowed } = await checkRateLimit(`form-config:put:${userId}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many form updates. Please try again later.' },
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

  // Size & question count limits
  const configSize = JSON.stringify(formConfig).length;
  if (configSize > MAX_FORM_CONFIG_SIZE) {
    return NextResponse.json({ error: `Form config exceeds ${MAX_FORM_CONFIG_SIZE} byte size limit` }, { status: 413 });
  }
  const totalQuestions = formConfig.sections.reduce((sum, s) => sum + s.questions.length, 0);
  if (totalQuestions > MAX_TOTAL_QUESTIONS) {
    return NextResponse.json({ error: `Form exceeds max ${MAX_TOTAL_QUESTIONS} questions` }, { status: 400 });
  }

  // Determine which column to write to
  const column = leadType === 'rental' ? 'rentalFormConfig' : 'buyerFormConfig';

  // Upsert into SpaceSetting
  const { data: existing } = await supabase
    .from('SpaceSetting')
    .select('id')
    .eq('spaceId', space.id)
    .maybeSingle();

  if (existing) {
    const { error: updateErr } = await supabase
      .from('SpaceSetting')
      .update({ [column]: formConfig, formConfigSource: 'custom' })
      .eq('spaceId', space.id);
    if (updateErr) {
      console.error('[form-config] update failed', updateErr);
      return NextResponse.json({ error: 'Failed to save form config' }, { status: 500 });
    }
  } else {
    const { error: insertErr } = await supabase
      .from('SpaceSetting')
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        [column]: formConfig,
        formConfigSource: 'custom',
      });
    if (insertErr) {
      console.error('[form-config] insert failed', insertErr);
      return NextResponse.json({ error: 'Failed to save form config' }, { status: 500 });
    }
  }

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'SpaceSetting',
    resourceId: space.id,
    spaceId: space.id,
    metadata: { field: column, formConfigSource: 'custom', leadType, sectionCount: formConfig.sections.length },
  });

  // Fire-and-forget: generate scoring model in background after saving form config
  const scoringColumn = leadType === 'rental' ? 'rentalScoringModel' : 'buyerScoringModel';
  void generateScoringModel(formConfig)
    .then((scoringModel) => {
      return supabase
        .from('SpaceSetting')
        .update({ [scoringColumn]: scoringModel })
        .eq('spaceId', space.id);
    })
    .then(({ error: scoringErr }) => {
      if (scoringErr) {
        console.error('[form-config] Failed to save auto-generated scoring model', scoringErr);
      } else {
        console.info('[form-config] Auto-generated scoring model saved', { spaceId: space.id, leadType });
      }
    })
    .catch((err) => {
      console.warn('[form-config] Scoring model generation failed (non-blocking)', err);
    });

  return NextResponse.json({ [column]: formConfig, formConfigSource: 'custom' as const, leadType });
}

/**
 * DELETE /api/form-config
 * Reset form config(s) by clearing the appropriate column(s).
 * Accepts { slug, leadType?: 'rental' | 'buyer' }
 * If leadType is omitted, resets BOTH.
 */
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug as string | undefined;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const leadType = body.leadType as string | undefined;

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Determine what to clear
  const updates: Record<string, unknown> = {};
  if (!leadType || leadType === 'rental') {
    updates.rentalFormConfig = null;
  }
  if (!leadType || leadType === 'buyer') {
    updates.buyerFormConfig = null;
  }

  // If both are being cleared, also reset source to legacy
  if (!leadType) {
    updates.formConfigSource = 'legacy';
    updates.formConfig = null; // Also clear legacy column
  }

  // When clearing a single lead type, check if the OTHER config still exists.
  // If not, both configs are now null and we should reset source to legacy.
  let resolvedSource: 'custom' | 'legacy' = leadType ? 'custom' : 'legacy';
  if (leadType) {
    const { data: currentSettings } = await supabase
      .from('SpaceSetting')
      .select('rentalFormConfig, buyerFormConfig')
      .eq('spaceId', space.id)
      .maybeSingle();

    const otherColumn = leadType === 'rental' ? 'buyerFormConfig' : 'rentalFormConfig';
    const otherConfigExists = currentSettings?.[otherColumn] != null;

    if (!otherConfigExists) {
      // Both configs will be null after this update — reset to legacy
      updates.formConfigSource = 'legacy';
      resolvedSource = 'legacy';
    }
  }

  const { error: updateErr } = await supabase
    .from('SpaceSetting')
    .update(updates)
    .eq('spaceId', space.id);

  if (updateErr) {
    console.error('[form-config] delete failed', updateErr);
    return NextResponse.json({ error: 'Failed to reset form config' }, { status: 500 });
  }

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'SpaceSetting',
    resourceId: space.id,
    spaceId: space.id,
    metadata: { field: 'formConfig', formConfigSource: resolvedSource, action: 'reset', leadType: leadType || 'both' },
  });

  return NextResponse.json({ success: true, formConfigSource: resolvedSource });
}
