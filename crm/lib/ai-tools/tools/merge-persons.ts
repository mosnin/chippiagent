/**
 * `merge_persons` — collapse two Contact rows into one.
 *
 * DESTRUCTIVE. The mergeId Contact row is deleted after its
 * ContactActivity, Tour, and DealContact rows are re-pointed at keepId.
 *
 * Approval-gated with an explicit summariseCall — the realtor sees
 * "Merge Sam Chen → keep Jane Chen (deletes Sam Chen)" before any
 * row moves. Without a Postgres function we can't run this in a real
 * transaction; if a step fails midway we surface the failure plainly
 * rather than pretending success. A future RPC could tighten this.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { deleteContactVector, syncContact } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

const parameters = z
  .object({
    keepId: z.string().min(1).describe('The Contact.id to keep.'),
    mergeId: z.string().min(1).describe('The Contact.id to merge into keepId, then delete.'),
  })
  .refine((v) => v.keepId !== v.mergeId, { message: 'keepId and mergeId must differ.' })
  .describe('Merge two contacts: move all activity/tours/deal links onto keepId, then delete mergeId.');

interface MergePersonsResult {
  keepId: string;
  mergedId: string;
  movedCounts: {
    activities: number;
    tours: number;
    dealLinks: number;
  };
}

export const mergePersonsTool = defineTool<typeof parameters, MergePersonsResult>({
  name: 'merge_persons',
  riskLevel: 'destructive',
  description:
    'Merge two contacts into one and delete the duplicate. Destructive — prompts for explicit approval.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    return `Merge contact ${args.mergeId.slice(0, 8)} → keep ${args.keepId.slice(0, 8)} (deletes ${args.mergeId.slice(0, 8)})`;
  },

  async handler(args, ctx) {
    // Both contacts must exist in this space and not be brokerage rows.
    const [keepRes, mergeRes] = await Promise.all([
      supabase
        .from('Contact')
        .select('id, name')
        .eq('id', args.keepId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle(),
      supabase
        .from('Contact')
        .select('id, name')
        .eq('id', args.mergeId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle(),
    ]);
    if (keepRes.error) {
      return { summary: `Lookup failed: ${keepRes.error.message}`, display: 'error' };
    }
    if (mergeRes.error) {
      return { summary: `Lookup failed: ${mergeRes.error.message}`, display: 'error' };
    }
    if (!keepRes.data) {
      return { summary: `No contact with id "${args.keepId}" to keep.`, display: 'error' };
    }
    if (!mergeRes.data) {
      return { summary: `No contact with id "${args.mergeId}" to merge.`, display: 'error' };
    }

    const keepName = keepRes.data.name as string;
    const mergeName = mergeRes.data.name as string;

    // Count rows for the summary BEFORE moving.
    const [actCountRes, tourCountRes, dcCountRes] = await Promise.all([
      supabase
        .from('ContactActivity')
        .select('id', { count: 'exact', head: true })
        .eq('contactId', args.mergeId)
        .eq('spaceId', ctx.space.id),
      supabase
        .from('Tour')
        .select('id', { count: 'exact', head: true })
        .eq('contactId', args.mergeId)
        .eq('spaceId', ctx.space.id),
      supabase
        .from('DealContact')
        .select('dealId', { count: 'exact', head: true })
        .eq('contactId', args.mergeId),
    ]);
    const activitiesCount = (actCountRes as unknown as { count: number | null }).count ?? 0;
    const toursCount = (tourCountRes as unknown as { count: number | null }).count ?? 0;
    const dealLinksCount = (dcCountRes as unknown as { count: number | null }).count ?? 0;

    // Step 1: ContactActivity → keepId
    const { error: actErr } = await supabase
      .from('ContactActivity')
      .update({ contactId: args.keepId })
      .eq('contactId', args.mergeId)
      .eq('spaceId', ctx.space.id);
    if (actErr) {
      logger.error('[tools.merge_persons] activity move failed', { keep: args.keepId, merge: args.mergeId }, actErr);
      return {
        summary: `Merge aborted before any rows moved: ${actErr.message}.`,
        display: 'error',
      };
    }

    // Step 2: Tour → keepId
    const { error: tourErr } = await supabase
      .from('Tour')
      .update({ contactId: args.keepId })
      .eq('contactId', args.mergeId)
      .eq('spaceId', ctx.space.id);
    if (tourErr) {
      logger.error('[tools.merge_persons] tour move failed (PARTIAL MERGE)', { keep: args.keepId, merge: args.mergeId }, tourErr);
      return {
        summary: `Partial merge — activities moved, tours failed: ${tourErr.message}. Please reconcile manually.`,
        display: 'error',
      };
    }

    // Step 3: DealContact → keepId. Composite primary key (dealId, contactId)
    // means we can't blanket-update; we have to read, dedupe against existing
    // keepId links, and rewrite.
    const { data: dcRows, error: dcReadErr } = await supabase
      .from('DealContact')
      .select('dealId, contactId')
      .eq('contactId', args.mergeId);
    if (dcReadErr) {
      logger.error('[tools.merge_persons] deal-contact read failed (PARTIAL MERGE)', { merge: args.mergeId }, dcReadErr);
      return {
        summary: `Partial merge — activity/tours moved, deal links failed: ${dcReadErr.message}.`,
        display: 'error',
      };
    }
    if (dcRows && dcRows.length > 0) {
      const dealIds = dcRows.map((r: { dealId: string }) => r.dealId);
      // Existing keepId deal links so we don't insert duplicates.
      const { data: existingKeepLinks } = await supabase
        .from('DealContact')
        .select('dealId')
        .eq('contactId', args.keepId)
        .in('dealId', dealIds);
      const existingSet = new Set(((existingKeepLinks ?? []) as { dealId: string }[]).map((r) => r.dealId));
      const toInsert = dealIds
        .filter((d) => !existingSet.has(d))
        .map((dealId) => ({ dealId, contactId: args.keepId }));

      if (toInsert.length > 0) {
        const { error: dcInsertErr } = await supabase.from('DealContact').insert(toInsert);
        if (dcInsertErr) {
          logger.error('[tools.merge_persons] deal-contact insert failed (PARTIAL MERGE)', { keep: args.keepId }, dcInsertErr);
          return {
            summary: `Partial merge — activity/tours moved, deal-link insert failed: ${dcInsertErr.message}.`,
            display: 'error',
          };
        }
      }
      // Delete the old links by mergeId — safe even if some are now duplicates,
      // since we're deleting the contactId=mergeId rows specifically.
      const { error: dcDeleteErr } = await supabase
        .from('DealContact')
        .delete()
        .eq('contactId', args.mergeId);
      if (dcDeleteErr) {
        logger.error('[tools.merge_persons] deal-contact delete failed (PARTIAL MERGE)', { merge: args.mergeId }, dcDeleteErr);
        return {
          summary: `Partial merge — links re-pointed but old rows lingered: ${dcDeleteErr.message}.`,
          display: 'error',
        };
      }
    }

    // Step 4: Audit log on the surviving contact.
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      spaceId: ctx.space.id,
      contactId: args.keepId,
      type: 'note',
      content: `Merged duplicate "${mergeName}" into this record.`,
      metadata: {
        mergedContactId: args.mergeId,
        movedActivities: activitiesCount,
        movedTours: toursCount,
        movedDealLinks: dealLinksCount,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.warn('[tools.merge_persons] audit insert failed', { keep: args.keepId }, activityErr);
    }

    // Step 5: Delete the merged Contact row.
    const { error: deleteErr } = await supabase
      .from('Contact')
      .delete()
      .eq('id', args.mergeId)
      .eq('spaceId', ctx.space.id);
    if (deleteErr) {
      logger.error('[tools.merge_persons] delete failed (PARTIAL MERGE)', { merge: args.mergeId }, deleteErr);
      return {
        summary: `Partial merge — references moved, but couldn't delete the duplicate: ${deleteErr.message}.`,
        display: 'error',
      };
    }

    // Reindex: drop the old vector, refresh the surviving one.
    deleteContactVector(ctx.space.id, args.mergeId).catch((err) =>
      logger.warn('[tools.merge_persons] vector delete failed', { merge: args.mergeId }, err),
    );
    const { data: survivor } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', args.keepId)
      .maybeSingle();
    if (survivor) {
      syncContact(survivor as Contact).catch((err) =>
        logger.warn('[tools.merge_persons] vector sync failed', { keep: args.keepId }, err),
      );
    }

    return {
      summary: `Merged "${mergeName}" into "${keepName}". Moved ${activitiesCount} activit${activitiesCount === 1 ? 'y' : 'ies'}, ${toursCount} tour${toursCount === 1 ? '' : 's'}, ${dealLinksCount} deal link${dealLinksCount === 1 ? '' : 's'}.`,
      data: {
        keepId: args.keepId,
        mergedId: args.mergeId,
        movedCounts: {
          activities: activitiesCount,
          tours: toursCount,
          dealLinks: dealLinksCount,
        },
      },
      display: 'success',
    };
  },
});
