/**
 * `request_deal_review` — log a deal review for the broker.
 *
 * Not a gate. Does not prompt for approval and does not leave a wait
 * on the deal. Inserts a DealReviewRequest already resolved so Chippi
 * continues pipeline work. Reviews still exist as an audit log.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import {
  REVIEW_LOG_NOTE,
  autoResolveOpenReviews,
} from '@/app/api/broker/reviews/auto-resolve';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to log a review against.'),
    reason: z
      .string()
      .trim()
      .min(10)
      .max(1000)
      .describe('Why the broker should look at this deal. Surfaces verbatim.'),
  })
  .describe('Log a deal review without pausing work.');

interface RequestDealReviewResult {
  dealId: string;
  reviewId: string;
  status: 'approved';
}

export const requestDealReviewTool = defineTool<typeof parameters, RequestDealReviewResult>({
  name: 'request_deal_review',
  riskLevel: 'safe',
  description:
    "Brokerage-only. Log a deal review for the broker. Does not wait for sign-off and does not pause Chippi.",
  parameters,
  requiresApproval: false,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    const slug =
      typeof args?.dealId === 'string' && args.dealId.length > 0
        ? args.dealId.slice(0, 8)
        : 'deal';
    return `Log a review of deal ${slug}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}".`, display: 'error' };
    }

    const { data: space, error: spaceErr } = await supabase
      .from('Space')
      .select('id, ownerId, brokerageId')
      .eq('id', ctx.space.id)
      .maybeSingle();
    if (spaceErr) {
      return { summary: `Workspace lookup failed: ${spaceErr.message}`, display: 'error' };
    }
    const brokerageId = (space as { brokerageId: string | null } | null)?.brokerageId ?? null;
    if (!brokerageId) {
      return {
        summary: 'Review requests need a brokerage — this is a solo workspace.',
        display: 'error',
      };
    }

    const ownerId = (space as { ownerId: string }).ownerId;
    const nowIso = new Date().toISOString();

    // Drain any leftover open row so the partial unique index cannot hold.
    try {
      await autoResolveOpenReviews({ dealId: args.dealId, resolvedByUserId: ownerId });
    } catch (err) {
      logger.error(
        '[tools.request_deal_review] auto-resolve failed',
        { dealId: args.dealId },
        err,
      );
    }

    const reviewId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from('DealReviewRequest').insert({
      id: reviewId,
      dealId: args.dealId,
      requestingUserId: ownerId,
      brokerageId,
      status: 'approved',
      reason: args.reason.trim(),
      createdAt: nowIso,
      resolvedAt: nowIso,
      resolvedByUserId: ownerId,
      resolvedNote: REVIEW_LOG_NOTE,
    });
    if (insertErr) {
      logger.error(
        '[tools.request_deal_review] insert failed',
        { dealId: args.dealId },
        insertErr,
      );
      return { summary: `Couldn't log the review: ${insertErr.message}`, display: 'error' };
    }

    return {
      summary: `Logged a review of the ${deal.title} deal. Chippi continues.`,
      data: { dealId: args.dealId, reviewId, status: 'approved' },
      display: 'success',
    };
  },
});
