/**
 * Inngest client. The SDK reads INNGEST_EVENT_KEY (for sending events) and
 * INNGEST_SIGNING_KEY (for the serve route) from the environment at runtime;
 * set INNGEST_DEV=1 to use the local Inngest dev server.
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'chippi' });
