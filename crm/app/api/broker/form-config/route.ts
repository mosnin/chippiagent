import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, canEditSettings } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { formConfigSchema } from '@/lib/form-config-schema';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_FORM_CONFIG_SIZE = 512_000;
const MAX_TOTAL_QUESTIONS = 200;

/**
 * GET /api/broker/form-config
 * Returns BOTH rental and buyer brokerage form configs.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: brokerage, error } = await supabase
    .from('Brokerage')
    .select('id, brokerageFormConfig, brokerageRentalFormConfig, brokerageBuyerFormConfig')
    .eq('id', ctx.brokerage.id)
    .maybeSingle();

  if (error) {
    console.error('[broker/form-config] fetch failed', error);
    return NextResponse.json({ error: 'Failed to fetch form config' }, { status: 500 });
  }

  // Backwards compatibility: if rentalFormConfig is null but old brokerageFormConfig exists
  let rentalFormConfig = brokerage?.brokerageRentalFormConfig ?? null;
  const buyerFormConfig = brokerage?.brokerageBuyerFormConfig ?? null;

  if (!rentalFormConfig && brokerage?.brokerageFormConfig) {
    rentalFormConfig = brokerage.brokerageFormConfig;
  }

  return NextResponse.json({
    brokerageId: ctx.brokerage.id,
    rentalFormConfig,
    buyerFormConfig,
  });
}

/**
 * PUT /api/broker/form-config
 * Validate and save a brokerage-level form config.
 * Accepts { leadType: 'rental' | 'buyer', formConfig }
 */
export async function PUT(req: NextRequest) {
  const { userId: clerkId } = await auth();

  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canEditSettings(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can update form config' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const leadType = body.leadType as string | undefined;
  if (!leadType || (leadType !== 'rental' && leadType !== 'buyer')) {
    return NextResponse.json({ error: 'leadType must be "rental" or "buyer"' }, { status: 400 });
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

  // Rate limit: 10 updates per hour
  const { allowed } = await checkRateLimit(`broker-form-config:put:${ctx.brokerage.id}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many form updates. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Size & question count limits
  const configSize = JSON.stringify(formConfig).length;
  if (configSize > MAX_FORM_CONFIG_SIZE) {
    return NextResponse.json({ error: `Form config exceeds ${MAX_FORM_CONFIG_SIZE} byte size limit` }, { status: 413 });
  }
  const totalQuestions = formConfig.sections.reduce((sum, s) => sum + s.questions.length, 0);
  if (totalQuestions > MAX_TOTAL_QUESTIONS) {
    return NextResponse.json({ error: `Form exceeds max ${MAX_TOTAL_QUESTIONS} questions` }, { status: 400 });
  }

  const column = leadType === 'rental' ? 'brokerageRentalFormConfig' : 'brokerageBuyerFormConfig';

  const { error: updateErr } = await supabase
    .from('Brokerage')
    .update({ [column]: formConfig })
    .eq('id', ctx.brokerage.id);

  if (updateErr) {
    console.error('[broker/form-config] update failed', updateErr);
    return NextResponse.json({ error: 'Failed to save form config' }, { status: 500 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'Brokerage',
    resourceId: ctx.brokerage.id,
    metadata: {
      field: column,
      leadType,
      sectionCount: formConfig.sections.length,
    },
  });

  return NextResponse.json({
    brokerageId: ctx.brokerage.id,
    [column]: formConfig,
    leadType,
  });
}

/**
 * DELETE /api/broker/form-config
 * Reset one or both brokerage form configs.
 * Accepts { leadType?: 'rental' | 'buyer' }
 */
export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();

  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canEditSettings(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can reset form config' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No body is OK — resets both
  }

  const leadType = body.leadType as string | undefined;

  const updates: Record<string, unknown> = {};
  if (!leadType || leadType === 'rental') {
    updates.brokerageRentalFormConfig = null;
  }
  if (!leadType || leadType === 'buyer') {
    updates.brokerageBuyerFormConfig = null;
  }
  if (!leadType) {
    updates.brokerageFormConfig = null; // Also clear legacy column
  }

  const { error: updateErr } = await supabase
    .from('Brokerage')
    .update(updates)
    .eq('id', ctx.brokerage.id);

  if (updateErr) {
    console.error('[broker/form-config] delete failed', updateErr);
    return NextResponse.json({ error: 'Failed to reset form config' }, { status: 500 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'Brokerage',
    resourceId: ctx.brokerage.id,
    metadata: {
      field: 'brokerageFormConfig',
      action: 'reset',
      leadType: leadType || 'both',
    },
  });

  return NextResponse.json({ success: true });
}
