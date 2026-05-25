/**
 * Clerk webhook handler — captures session.created and session.ended events
 * to log user login/logout activity in the AuditLog table.
 *
 * Setup in Clerk Dashboard → Webhooks:
 *   Endpoint URL: https://<your-domain>/api/webhooks/clerk
 *   Events to subscribe: session.created, session.ended
 *   Set CLERK_WEBHOOK_SECRET in environment variables.
 *
 * Security: All incoming requests are verified via Svix signature.
 * Unverified or tampered requests are rejected with 400.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// Svix header names used for webhook signature verification
const SVIX_ID_HEADER = 'svix-id';
const SVIX_TIMESTAMP_HEADER = 'svix-timestamp';
const SVIX_SIGNATURE_HEADER = 'svix-signature';

interface ClerkSessionPayload {
  data: {
    id: string;
    user_id: string;
    client_id?: string;
    last_active_at?: number;
    created_at?: number;
    status?: string;
  };
  type: string;
  object: string;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Extract Svix signature headers
  const svixId = req.headers.get(SVIX_ID_HEADER);
  const svixTimestamp = req.headers.get(SVIX_TIMESTAMP_HEADER);
  const svixSignature = req.headers.get(SVIX_SIGNATURE_HEADER);

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing Svix signature headers' },
      { status: 400 },
    );
  }

  // Verify the webhook signature — rejects replays and tampered payloads
  let payload: ClerkSessionPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkSessionPayload;
  } catch (err) {
    logger.error('[clerk-webhook] signature verification failed', undefined, err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { type, data } = payload;
  const clerkUserId = data.user_id;
  const ip = getClientIp(req);

  try {
    if (type === 'session.created') {
      // Look up internal user ID for context
      const { data: userRow } = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', clerkUserId)
        .maybeSingle();

      await audit({
        actorClerkId: clerkUserId,
        action: 'LOGIN',
        resource: 'Session',
        resourceId: data.id,
        metadata: {
          sessionId: data.id,
          userId: userRow?.id ?? null,
          clientId: data.client_id ?? null,
          loginAt: new Date().toISOString(),
          ip,
        },
      });

      logger.info('[clerk-webhook] login recorded', {
        clerkUserId,
        sessionId: data.id,
      });
    } else if (type === 'session.ended' || type === 'session.removed' || type === 'session.revoked') {
      const { data: userRow } = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', clerkUserId)
        .maybeSingle();

      await audit({
        actorClerkId: clerkUserId,
        action: 'LOGOUT',
        resource: 'Session',
        resourceId: data.id,
        metadata: {
          sessionId: data.id,
          userId: userRow?.id ?? null,
          eventType: type,
          logoutAt: new Date().toISOString(),
          ip,
        },
      });

      logger.info('[clerk-webhook] logout recorded', {
        clerkUserId,
        sessionId: data.id,
        eventType: type,
      });
    } else {
      // Acknowledge but ignore other event types
      logger.debug('[clerk-webhook] unhandled event type', { type });
    }
  } catch (err) {
    // Log error but return 200 so Clerk doesn't retry — the audit utility
    // already handles its own errors gracefully.
    logger.error('[clerk-webhook] processing failed', { type, clerkUserId }, err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
