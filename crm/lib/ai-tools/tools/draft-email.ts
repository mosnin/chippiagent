/**
 * `draft_email` — compose-only. "What would you say."
 *
 * Read-only by design: NO AgentDraft row, NO send, NO persistence. Reuses
 * the exported `composeQuickDraft` from the existing /api/agent/quick-draft
 * route so we don't duplicate the OpenAI prompt + voice-sample logic.
 *
 * Approval: NO. The realtor isn't sending anything; they're seeing a draft.
 */

import { z } from 'zod';
import { defineTool } from '../types';
import { composeQuickDraft } from '@/app/api/agent/quick-draft/route';

const INTENTS = ['check-in', 'log-call', 'welcome', 'reach-out'] as const;

const parameters = z
  .object({
    personId: z.string().min(1).describe('Contact.id to draft for.'),
    intent: z.enum(INTENTS).describe('What angle the draft should take.'),
    contextNote: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe('Free-text hint surfaced into the prompt context. Optional.'),
  })
  .describe('Compose an email draft for a contact. Returns subject + body. No send.');

interface DraftEmailResult {
  subject: string;
  body: string;
}

export const draftEmailTool = defineTool<typeof parameters, DraftEmailResult>({
  name: 'draft_email',
  riskLevel: 'safe',
  description:
    'Compose an email draft for a contact (no send, no persistence). Returns subject and body.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const composed = await composeQuickDraft({
      kind: 'person',
      id: args.personId,
      intent: args.intent,
      channel: 'email',
      spaceId: ctx.space.id,
    });
    if (!composed) {
      return {
        summary: 'Could not compose a draft (contact missing or compose failed).',
        display: 'error',
      };
    }
    const subject = composed.subject ?? `Quick check-in${composed.subjectLabel ? ` — ${composed.subjectLabel}` : ''}`;
    return {
      summary: `Draft email — "${subject}"`,
      data: { subject, body: composed.body },
      display: 'plain',
    };
  },
});
