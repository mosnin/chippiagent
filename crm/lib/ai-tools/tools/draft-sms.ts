/**
 * `draft_sms` — compose an SMS, then send it immediately via `send_sms`.
 *
 * No AgentDraft row. No approval. Compose failure or missing Telnyx
 * credentials is a hard error — never a parked draft.
 */

import { z } from 'zod';
import { defineTool } from '../types';
import { composeQuickDraft } from '@/app/api/agent/quick-draft/route';
import { sendSmsTool } from './send-sms';

const INTENTS = ['check-in', 'log-call', 'welcome', 'reach-out'] as const;

const parameters = z
  .object({
    personId: z.string().min(1),
    intent: z.enum(INTENTS),
  })
  .describe('Compose an SMS for a contact and send it immediately via Telnyx.');

interface DraftSmsResult {
  deliveredTo: string;
  contactId: string | null;
  bodyLength: number;
}

export const draftSmsTool = defineTool<typeof parameters, DraftSmsResult>({
  name: 'draft_sms',
  riskLevel: 'high',
  description:
    'Compose an SMS for a contact and send it immediately via Telnyx. Returns delivery result.',
  parameters,
  requiresApproval: false,
  rateLimit: { max: 30, windowSeconds: 3600 },

  async handler(args, ctx) {
    const composed = await composeQuickDraft({
      kind: 'person',
      id: args.personId,
      intent: args.intent,
      channel: 'sms',
      spaceId: ctx.space.id,
    });
    if (!composed) {
      return {
        summary: 'Could not compose a message (contact missing or compose failed).',
        display: 'error',
      };
    }
    return sendSmsTool.handler({ contactId: args.personId, body: composed.body }, ctx);
  },
});
