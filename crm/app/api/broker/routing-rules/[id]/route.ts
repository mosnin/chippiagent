import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  RULE_COLUMNS,
  nameField,
  priorityField,
  leadTypeField,
  budgetField,
  matchTagField,
  destinationUserIdField,
  destinationPoolMethodField,
  destinationPoolTagField,
  type DealRoutingRuleRow,
} from '@/lib/routing-rule-schema';

type Params = { params: Promise<{ id: string }> };

// For PATCH every field is optional. When the caller changes EITHER of
// the two destination fields we still enforce XOR, but "neither
// mentioned at all" is allowed (caller is just flipping enabled or
// editing a budget bound). The refine runs on the parsed object so it
// can distinguish "omitted" from "explicitly null".
const patchSchema = z
  .object({
    name: nameField.optional(),
    priority: priorityField.optional(),
    enabled: z.boolean().optional(),
    leadType: leadTypeField.optional(),
    minBudget: budgetField.optional(),
    maxBudget: budgetField.optional(),
    matchTag: matchTagField.optional(),
    destinationUserId: destinationUserIdField.optional(),
    destinationPoolMethod: destinationPoolMethodField.optional(),
    destinationPoolTag: destinationPoolTagField.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      typeof data.minBudget === 'number' &&
      typeof data.maxBudget === 'number' &&
      data.maxBudget < data.minBudget
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxBudget'],
        message: 'maxBudget must be greater than or equal to minBudget',
      });
    }

    const hasUserId =
      Object.prototype.hasOwnProperty.call(data, 'destinationUserId') &&
      data.destinationUserId !== undefined;
    const hasPool =
      Object.prototype.hasOwnProperty.call(data, 'destinationPoolMethod') &&
      data.destinationPoolMethod !== undefined;

    // When either destination field is mentioned, both must be — callers
    // that want to flip the destination type must send both explicitly
    // so the server validator stays purely local (no row load needed).
    if (hasUserId !== hasPool) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationUserId'],
        message:
          'When changing the destination, include BOTH destinationUserId and destinationPoolMethod (set the unused one to null) so the XOR invariant is explicit.',
      });
      return;
    }

    if (hasUserId && hasPool) {
      const userIdSet = !!data.destinationUserId;
      const poolSet = !!data.destinationPoolMethod;
      if (userIdSet === poolSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinationUserId'],
          message:
            'Pick exactly one destination: either a specific agent (destinationUserId) or a pool method (destinationPoolMethod).',
        });
      }
      if (userIdSet && data.destinationPoolTag) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinationPoolTag'],
          message: 'destinationPoolTag is only valid when destinationPoolMethod is set.',
        });
      }
    }
  });

// ── PATCH ─────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/broker/routing-rules/[id]
 *
 * Partial update restricted to broker_owner / broker_admin. The route
 * re-verifies the row belongs to the caller's brokerage before writing,
 * so a stale UI can't reach into another tenant. Always bumps
 * `updatedAt = now()` on a real write.
 */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { userId: clerkId } = await auth();

  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ctx.membership.role !== 'broker_owner' && ctx.membership.role !== 'broker_admin') {
    return NextResponse.json(
      { error: 'Only the owner or admins can edit routing rules' },
      { status: 403 },
    );
  }

  const { id: ruleId } = await params;

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

  const { data: existing, error: loadErr } = await supabase
    .from('DealRoutingRule')
    .select(RULE_COLUMNS)
    .eq('id', ruleId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle<DealRoutingRuleRow>();

  if (loadErr) {
    logger.error(
      '[broker/routing-rules/PATCH] load failed',
      { ruleId, brokerageId: ctx.brokerage.id },
      loadErr,
    );
    return NextResponse.json({ error: 'Failed to load rule' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  // Build the update payload from fields the caller actually supplied.
  const patch: Partial<DealRoutingRuleRow> & { updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };

  const copyable = [
    'name',
    'priority',
    'enabled',
    'leadType',
    'minBudget',
    'maxBudget',
    'matchTag',
    'destinationUserId',
    'destinationPoolMethod',
    'destinationPoolTag',
  ] as const;
  type CopyableField = (typeof copyable)[number];

  let changed = false;
  for (const key of copyable) {
    if (!(key in (parsed.data as Record<string, unknown>))) continue;
    const value = (parsed.data as Record<CopyableField, unknown>)[key];
    if (value === undefined) continue;
    const existingValue = (existing as unknown as Record<string, unknown>)[key];
    if (value === existingValue) continue;
    (patch as Record<string, unknown>)[key] = value;
    changed = true;
  }

  if (!changed) {
    return NextResponse.json(
      { error: 'No change — every supplied field matches the current value.' },
      { status: 400 },
    );
  }

  // If destinationUserId is being changed to a non-null value, verify the
  // new target is still a member of THIS brokerage.
  if (
    'destinationUserId' in (parsed.data as Record<string, unknown>) &&
    typeof (parsed.data as { destinationUserId?: unknown }).destinationUserId === 'string'
  ) {
    const newUserId = (parsed.data as { destinationUserId: string }).destinationUserId;
    const { data: membership, error: memErr } = await supabase
      .from('BrokerageMembership')
      .select('userId')
      .eq('brokerageId', ctx.brokerage.id)
      .eq('userId', newUserId)
      .maybeSingle();
    if (memErr) {
      logger.error(
        '[broker/routing-rules/PATCH] destination membership check failed',
        { ruleId, brokerageId: ctx.brokerage.id, newUserId },
        memErr,
      );
      return NextResponse.json({ error: 'Failed to verify destination agent' }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json(
        { error: 'destinationUserId is not a member of this brokerage' },
        { status: 400 },
      );
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('DealRoutingRule')
    .update(patch)
    .eq('id', ruleId)
    .eq('brokerageId', ctx.brokerage.id)
    .select(RULE_COLUMNS)
    .maybeSingle<DealRoutingRuleRow>();

  if (updateErr) {
    logger.error(
      '[broker/routing-rules/PATCH] update failed',
      { ruleId, brokerageId: ctx.brokerage.id },
      updateErr,
    );
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'DealRoutingRule',
    resourceId: ruleId,
    req,
    metadata: {
      brokerageId: ctx.brokerage.id,
      changedFields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
    },
  });

  return NextResponse.json(updated);
}

// ── DELETE ────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/broker/routing-rules/[id]
 *
 * Removes a rule. Restricted to broker_owner / broker_admin.
 */
export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { userId: clerkId } = await auth();

  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ctx.membership.role !== 'broker_owner' && ctx.membership.role !== 'broker_admin') {
    return NextResponse.json(
      { error: 'Only the owner or admins can delete routing rules' },
      { status: 403 },
    );
  }

  const { id: ruleId } = await params;

  const { data: deleted, error: deleteErr } = await supabase
    .from('DealRoutingRule')
    .delete()
    .eq('id', ruleId)
    .eq('brokerageId', ctx.brokerage.id)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (deleteErr) {
    logger.error(
      '[broker/routing-rules/DELETE] delete failed',
      { ruleId, brokerageId: ctx.brokerage.id },
      deleteErr,
    );
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'DELETE',
    resource: 'DealRoutingRule',
    resourceId: ruleId,
    req,
    metadata: { brokerageId: ctx.brokerage.id },
  });

  return new NextResponse(null, { status: 204 });
}
