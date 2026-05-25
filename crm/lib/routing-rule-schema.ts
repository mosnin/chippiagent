/**
 * Shared Zod field primitives + row type for DealRoutingRule API routes.
 *
 * Factored out of the POST route so the PATCH route can reuse the same
 * field validators without cross-importing from another Next.js route
 * module (Next expects route.ts files to export only HTTP handlers).
 */

import { z } from 'zod';

export type DealRoutingRuleRow = {
  id: string;
  brokerageId: string;
  name: string;
  priority: number;
  enabled: boolean;
  leadType: string | null;
  minBudget: number | null;
  maxBudget: number | null;
  matchTag: string | null;
  destinationUserId: string | null;
  destinationPoolMethod: 'round_robin' | 'score_based' | null;
  destinationPoolTag: string | null;
  createdAt: string;
  updatedAt: string;
};

export const RULE_COLUMNS =
  'id, brokerageId, name, priority, enabled, leadType, minBudget, maxBudget, matchTag, destinationUserId, destinationPoolMethod, destinationPoolTag, createdAt, updatedAt';

// Field-level validators — kept granular so both POST (all required with
// defaults) and PATCH (all optional) can share.
export const nameField = z.string().trim().min(1, 'Name is required').max(100, 'Max 100 characters');
export const priorityField = z
  .number()
  .int('Priority must be an integer')
  .min(0, 'Priority must be >= 0')
  .max(10000, 'Priority must be <= 10000');
export const leadTypeField = z.union([z.string().trim().min(1).max(40), z.null()]);
export const budgetField = z.union([z.number().nonnegative('Budget cannot be negative'), z.null()]);
export const matchTagField = z.union([z.string().trim().min(1).max(60), z.null()]);
export const destinationUserIdField = z.union([z.string().trim().min(1), z.null()]);
export const destinationPoolMethodField = z.union([
  z.enum(['round_robin', 'score_based']),
  z.null(),
]);
export const destinationPoolTagField = z.union([z.string().trim().min(1).max(60), z.null()]);

/**
 * Cross-field invariants shared by POST + PATCH:
 *   - If both minBudget and maxBudget are set, max must be >= min.
 *   - EXACTLY one of destinationUserId / destinationPoolMethod must be set
 *     (XOR). The same XOR is enforced at the DB level by the
 *     deal_routing_rule_destination_xor CHECK constraint.
 *   - destinationPoolTag is only valid when destinationPoolMethod is set.
 */
export function applyRuleInvariants(
  data: unknown,
  ctx: z.RefinementCtx,
): void {
  const d = data as {
    minBudget?: number | null;
    maxBudget?: number | null;
    destinationUserId?: string | null;
    destinationPoolMethod?: 'round_robin' | 'score_based' | null;
    destinationPoolTag?: string | null;
  };

  if (
    typeof d.minBudget === 'number' &&
    typeof d.maxBudget === 'number' &&
    d.maxBudget < d.minBudget
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxBudget'],
      message: 'maxBudget must be greater than or equal to minBudget',
    });
  }

  const userIdSet = !!d.destinationUserId;
  const poolSet = !!d.destinationPoolMethod;
  if (userIdSet === poolSet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destinationUserId'],
      message:
        'Pick exactly one destination: either a specific agent (destinationUserId) or a pool method (destinationPoolMethod).',
    });
  }
  if (userIdSet && d.destinationPoolTag) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destinationPoolTag'],
      message: 'destinationPoolTag is only valid when destinationPoolMethod is set.',
    });
  }
}
