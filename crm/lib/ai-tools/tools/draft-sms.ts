/**
 * `draft_sms` — compose-only SMS. Same shape as draft_email, channel='sms'.
 *
 * Read-only. NO AgentDraft, NO send. The route's compose helper accepts
 * a channel; SMS skips the voice samples (note voice, not email voice).
 *
 * The route's `channelForIntent` maps log-call → note. We don't want a
 * note here — this tool is for SMS — so we always pass channel='sms'
 * directly.
 */

import { z } from 'zod';
import { defineTool } from '../types';
import { composeQuickDraft } from '@/app/api/agent/quick-draft/route';

const INTENTS = ['check-in', 'log-call', 'welcome', 'reach-out'] as const;

const parameters = z
  .object({
    personId: z.string().min(1),
    intent: z.enum(INTENTS),
  })
  .describe('Compose an SMS draft for a contact. Returns body. No send.');

interface DraftSmsResult {
  body: string;
}

export const draftSmsTool = defineTool<typeof parameters, DraftSmsResult>({
  name: 'draft_sms',
  riskLevel: 'safe',
  description: 'Compose an SMS draft for a contact (no send, no persistence). Returns body only.',
  parameters,
  requiresApproval: false,

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
        summary: 'Could not compose a draft (contact missing or compose failed).',
        display: 'error',
      };
    }
    return {
      summary: `Draft SMS — ${composed.body.slice(0, 60)}${composed.body.length > 60 ? '…' : ''}`,
      data: { body: composed.body },
      display: 'plain',
    };
  },
});
