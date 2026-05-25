/**
 * Inngest serve endpoint. Inngest calls this route to execute functions, one
 * HTTP invocation per step. Node runtime — the steps touch Wasabi (AWS SDK)
 * and Composio.
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { publishScheduledPost } from '@/lib/inngest/functions';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [publishScheduledPost],
});
