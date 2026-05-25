import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

/**
 * POST /api/mcp/oauth/authorize
 * Called by the authorize page after user approves.
 * Generates an authorization code and returns the redirect URL.
 *
 * The code is stored temporarily in the McpAuthCode table with the
 * PKCE code_challenge so we can verify it during token exchange.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const body = await req.json();
  const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope } = body;

  if (!client_id || !redirect_uri || !code_challenge) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  // Validate redirect_uri — must be a Claude callback
  try {
    const url = new URL(redirect_uri);
    const allowedHosts = ['claude.ai', 'www.claude.ai'];
    if (process.env.NODE_ENV === 'development') {
      allowedHosts.push('localhost');
    }
    if (!allowedHosts.some(h => url.hostname === h)) {
      return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
  }

  // Verify the client_id belongs to this user's space
  const { data: mcpKey } = await supabase
    .from('McpApiKey')
    .select('spaceId')
    .eq('clientId', client_id)
    .maybeSingle();

  if (!mcpKey || mcpKey.spaceId !== space.id) {
    return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
  }

  // Generate authorization code (short-lived, single-use)
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

  // Generate a server-side nonce bound to the client-provided state parameter.
  // During token exchange we verify this nonce to ensure the authorization
  // response was not forged or replayed with a different state value.
  const stateNonce = crypto.randomBytes(32).toString('hex');
  const stateHash = state
    ? crypto.createHash('sha256').update(`${stateNonce}:${state}`).digest('hex')
    : null;

  // Store code with PKCE challenge for verification during token exchange
  const { error } = await supabase.from('McpAuthCode').insert({
    code,
    clientId: client_id,
    spaceId: space.id,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method || 'S256',
    redirectUri: redirect_uri,
    stateNonce,
    stateHash,
    expiresAt,
  });

  if (error) {
    console.error('[oauth/authorize] code insert failed:', error);
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
  }

  // Build redirect URL back to Claude
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  return NextResponse.json({ redirect_url: redirectUrl.toString() });
}
