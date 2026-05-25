/**
 * POST /api/integrations/connect/[toolkit]
 *
 * Initiate an OAuth connection for the calling realtor + the given
 * toolkit (e.g. `gmail`, `slack`, `notion`). Returns the URL the
 * realtor's browser should redirect to so Composio can run the auth
 * flow. After the realtor approves, Composio sends them back to our
 * /api/integrations/callback route with the connected-account id.
 *
 * IMPORTANT: We persist the IntegrationConnection row HERE — at
 * initiate-time — using the `request.id` Composio returns. The OAuth
 * round-trip is cross-site and unreliable: cookies can drop, redirects
 * can land on the homepage instead of /settings, sessions can expire.
 * If the row only existed in the callback path, any of those failures
 * silently dropped the connection. Inserting at initiate-time means
 * the row is in the DB the moment the user leaves for the provider,
 * regardless of whether the callback ever fires. The callback's job
 * shrinks to "update the label / log the result"; if it gets dropped
 * entirely, the realtor still sees the row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { COMING_SOON_TOOLKITS, findIntegration } from '@/lib/integrations/catalog';
import { initiateConnection } from '@/lib/integrations/composio';
import { findActive, insertConnection, revoke } from '@/lib/integrations/connections';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ toolkit: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { toolkit } = await params;
  const app = findIntegration(toolkit);
  if (!app) {
    return NextResponse.json(
      { error: `Unknown integration: ${toolkit}` },
      { status: 404 },
    );
  }

  // Some catalog entries (Follow-up Boss, Compass, BoomTown, kvCORE, Real
  // Geeks) are real-estate apps Composio doesn't have a toolkit for yet.
  // The UI renders them with a disabled "Coming soon" pill, so reaching
  // this path means a stale client. Refuse cleanly and name the app.
  if (COMING_SOON_TOOLKITS.has(toolkit)) {
    return NextResponse.json(
      { error: `${app.name} support is in progress. We will let you know when it lands.` },
      { status: 501 },
    );
  }

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // If there's already an active connection for this combo, revoke it
  // first — reconnect is the realtor explicitly choosing a fresh auth.
  const existing = await findActive({ spaceId: space.id, userId, toolkit });
  if (existing) {
    await revoke(existing);
  }

  const callbackUrl = composioCallbackUrl();

  try {
    const request = await initiateConnection({
      entityId: userId,
      toolkit,
      callbackUrl,
    });

    // Persist the row NOW, before the realtor leaves for OAuth. The
    // callback used to own this insert; that meant any cross-site cookie
    // drop, redirect-to-homepage glitch, or Vercel preview-domain quirk
    // silently lost the row. Composio's `request.id` IS the
    // connectedAccountId we'll get back in the callback (same value), so
    // this insert is forward-compatible — the callback updates the label
    // and surfaces success to the user, but the row exists either way.
    //
    // Failure mode: if the realtor bails on the OAuth screen, we have a
    // row pointing at an unfinished Composio connection. The chat agent's
    // first attempt to use it will trip the auth-error reconcile path and
    // flip the row to 'expired' (amber dot + Reconnect). Acceptable.
    const inserted = await insertConnection({
      spaceId: space.id,
      userId,
      toolkit,
      composioConnectionId: request.id,
    });
    if (!inserted) {
      logger.error('[integrations.connect] persist-at-connect failed', {
        userId,
        toolkit,
        composioConnectionId: request.id,
      });
      return NextResponse.json(
        { error: `Could not save the ${app.name} connection. Try again.` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      redirectUrl: request.redirectUrl,
      connectionId: request.id,
      toolkit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      '[integrations.connect] initiate failed',
      { userId, toolkit, err: message },
    );
    // Surface OUR known-actionable error sentences (e.g. "No Auth Config
    // exists for …") to the realtor verbatim — they tell the realtor what
    // to do. Raw vendor 5xx/4xx noise stays hidden behind the generic line
    // so we don't leak Composio internals.
    const isActionable = message.startsWith('No Auth Config');
    const surfaced = isActionable
      ? message
      : `Could not start ${app.name} connect. Try again in a moment.`;
    return NextResponse.json({ error: surfaced }, { status: 502 });
  }
}

/**
 * The URL Composio sends the realtor to after OAuth completes.
 *
 * Returns undefined when neither `NEXT_PUBLIC_APP_URL` nor `APP_URL` is set —
 * Composio falls back to its own default in that case, which means the
 * realtor completes OAuth at the provider but never lands back in the app.
 * Logs loud on the server so this misconfiguration is detectable in
 * production logs without the realtor having to report a confused
 * post-OAuth experience.
 */
function composioCallbackUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!base) {
    logger.error(
      '[integrations.connect] NEXT_PUBLIC_APP_URL is not set — Composio will redirect to its default URL after OAuth, not back to this app. Set NEXT_PUBLIC_APP_URL on Vercel and redeploy.',
    );
    return undefined;
  }
  return `${base.replace(/\/$/, '')}/integrations/callback`;
}
