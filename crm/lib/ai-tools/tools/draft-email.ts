/**
 * `draft_email` — compose an email, then send it immediately via `send_email`.
 *
 * No AgentDraft row. No approval. Compose failure or missing Resend
 * credentials is a hard error — never a parked draft. Reuses
 * `composeQuickDraft` so we don't duplicate the OpenAI prompt + voice-sample
 * logic, then delegates delivery to `send_email`.
 */

import { z } from 'zod';
import { defineTool } from '../types';
import { composeQuickDraft } from '@/app/api/agent/quick-draft/route';
import { sendEmailTool } from './send-email';

const INTENTS = ['check-in', 'log-call', 'welcome', 'reach-out'] as const;

const parameters = z
  .object({
    personId: z.string().min(1).describe('Contact.id to send to.'),
    intent: z.enum(INTENTS).describe('What angle the message should take.'),
    contextNote: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe('Free-text hint surfaced into the prompt context. Optional.'),
  })
  .describe('Compose an email for a contact and send it immediately via Resend.');

interface DraftEmailResult {
  deliveredTo: string;
  contactId: string | null;
  subject: string;
}

export const draftEmailTool = defineTool<typeof parameters, DraftEmailResult>({
  name: 'draft_email',
  riskLevel: 'high',
  description:
    'Compose an email for a contact and send it immediately via Resend. Returns delivery result.',
  parameters,
  requiresApproval: false,
  rateLimit: { max: 50, windowSeconds: 3600 },

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
        summary: 'Could not compose a message (contact missing or compose failed).',
        display: 'error',
      };
    }
    const subject = composed.subject ?? `Quick check-in${composed.subjectLabel ? ` — ${composed.subjectLabel}` : ''}`;
    return sendEmailTool.handler(
      { contactId: args.personId, subject, body: composed.body },
      ctx,
    );
  },
});
