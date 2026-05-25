import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

type TemplateCategory = 'follow-up' | 'intro' | 'closing' | 'tour-invite';
type TemplateChannel = 'sms' | 'email' | 'note';

type BrokerageTemplateRow = {
  id: string;
  brokerageId: string;
  name: string;
  category: TemplateCategory;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  version: number;
  publishedAt: string | null;
  publishedVersion: number | null;
  publishedCount: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

const TEMPLATE_COLUMNS =
  'id, brokerageId, name, category, channel, subject, body, version, publishedAt, publishedVersion, publishedCount, createdByUserId, createdAt, updatedAt';

// Every field optional — PATCH is a partial update. subject is explicitly
// nullable so callers can clear a previously-set subject by sending null.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    category: z.enum(['follow-up', 'intro', 'closing', 'tour-invite']).optional(),
    channel: z.enum(['sms', 'email', 'note']).optional(),
    subject: z.union([z.string().max(200), z.null()]).optional(),
    body: z.string().min(1).max(5000).optional(),
  })
  .strict();

// ── PATCH ─────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/broker/templates/[id]
 *
 * Partial update. If ANY of {name, category, channel, subject, body} is
 * being changed (i.e. supplied in the payload), bump `version` by 1 in the
 * same write so agents know a new publish-able revision exists. Always
 * stamp `updatedAt = now()` on a successful write.
 */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { userId: clerkId } = await auth();

  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ctx.membership.role !== 'broker_owner' && ctx.membership.role !== 'broker_admin') {
    return NextResponse.json(
      { error: 'Only the owner or admins can edit templates' },
      { status: 403 },
    );
  }

  const { id: templateId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Confirm the template is in the caller's brokerage before touching it.
  // A missing row is a 404 regardless of whether it exists for another
  // brokerage — we don't want to leak cross-brokerage existence.
  const { data: existing, error: loadErr } = await supabase
    .from('BrokerageTemplate')
    .select(TEMPLATE_COLUMNS)
    .eq('id', templateId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle<BrokerageTemplateRow>();

  if (loadErr) {
    logger.error(
      '[broker/templates/PATCH] load failed',
      { templateId, brokerageId: ctx.brokerage.id },
      loadErr,
    );
    return NextResponse.json({ error: 'Failed to load template' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Build the update payload only with fields the caller actually supplied
  // AND whose value differs from the row's current value. Version bumps on
  // any real content change; a no-op PATCH (empty body OR all fields equal
  // to current) is rejected rather than silently succeeding — audit caught
  // that "empty body" was returning 200 + an updatedAt bump, and that
  // "field = current value" was still bumping the version.
  const patch: Partial<BrokerageTemplateRow> & { updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };

  const contentFields = ['name', 'category', 'channel', 'subject', 'body'] as const;
  type ContentField = (typeof contentFields)[number];
  let contentChanged = false;
  for (const key of contentFields) {
    if (!(key in parsed.data)) continue;
    const value = (parsed.data as Record<ContentField, unknown>)[key];
    if (value === undefined) continue;
    // Normalise falsy subject values to null so the comparison is apples-
    // to-apples against the DB (which stores NULL, not '').
    const nextValue = value ?? null;
    const currentValue =
      (existing as unknown as Record<string, unknown>)[key] ?? null;
    if (nextValue === currentValue) continue; // no-op field
    (patch as Record<string, unknown>)[key] = nextValue;
    contentChanged = true;
  }

  // If the channel is changing to non-email, clear subject unless the caller
  // explicitly supplied one. This keeps the "email-only subject" invariant
  // consistent with POST.
  if (
    parsed.data.channel !== undefined &&
    parsed.data.channel !== 'email' &&
    !('subject' in parsed.data) &&
    existing.subject !== null
  ) {
    (patch as Record<string, unknown>).subject = null;
    contentChanged = true;
  }

  if (!contentChanged) {
    return NextResponse.json(
      {
        error:
          'No change — the patch body is empty or every field matches the current value.',
      },
      { status: 400 },
    );
  }

  patch.version = existing.version + 1;

  const { data: updated, error: updateErr } = await supabase
    .from('BrokerageTemplate')
    .update(patch)
    .eq('id', templateId)
    .eq('brokerageId', ctx.brokerage.id)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle<BrokerageTemplateRow>();

  if (updateErr) {
    logger.error(
      '[broker/templates/PATCH] update failed',
      { templateId, brokerageId: ctx.brokerage.id },
      updateErr,
    );
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'BrokerageTemplate',
    resourceId: templateId,
    req,
    metadata: {
      brokerageId: ctx.brokerage.id,
      previousVersion: existing.version,
      newVersion: updated.version,
      contentChanged,
      changedFields: contentFields.filter((k) => k in parsed.data),
    },
  });

  return NextResponse.json(updated);
}

// ── DELETE ────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/broker/templates/[id]
 *
 * Removes the BrokerageTemplate row. Agent-local copies (MessageTemplate rows
 * with sourceTemplateId = this.id) survive because the FK is ON DELETE SET
 * NULL — their sourceTemplateId simply becomes NULL, degrading them from
 * "published copy" to plain agent-authored templates. That's the intended UX.
 */
export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { userId: clerkId } = await auth();

  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ctx.membership.role !== 'broker_owner' && ctx.membership.role !== 'broker_admin') {
    return NextResponse.json(
      { error: 'Only the owner or admins can delete templates' },
      { status: 403 },
    );
  }

  const { id: templateId } = await params;

  const { data: deleted, error: deleteErr } = await supabase
    .from('BrokerageTemplate')
    .delete()
    .eq('id', templateId)
    .eq('brokerageId', ctx.brokerage.id)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (deleteErr) {
    logger.error(
      '[broker/templates/DELETE] delete failed',
      { templateId, brokerageId: ctx.brokerage.id },
      deleteErr,
    );
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'DELETE',
    resource: 'BrokerageTemplate',
    resourceId: templateId,
    req,
    metadata: { brokerageId: ctx.brokerage.id },
  });

  return new NextResponse(null, { status: 204 });
}
