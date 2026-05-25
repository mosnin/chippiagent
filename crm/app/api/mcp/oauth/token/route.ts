import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import crypto from 'crypto';
import { SignJWT } from 'jose';

function getJwtSecret(): Uint8Array {
  const secret = process.env.MCP_JWT_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('MCP_JWT_SECRET not configured');
  return new TextEncoder().encode(secret);
}

/**
 * POST /api/mcp/oauth/token
 * Handles:
 * 1. authorization_code (with PKCE) — Claude's MCP connector
 * 2. client_credentials — direct API usage
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`mcp:oauth:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  // Parse body — support form-urlencoded (standard) and JSON
  let params: Record<string, string> = {};
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      const urlParams = new URLSearchParams(text);
      urlParams.forEach((v, k) => { params[k] = v; });
    } else {
      const body = await req.text();
      // Try JSON first, fall back to form-urlencoded
      try {
        params = JSON.parse(body);
      } catch {
        const urlParams = new URLSearchParams(body);
        urlParams.forEach((v, k) => { params[k] = v; });
      }
    }
  } catch (err) {
    console.error('[mcp/token] body parse error:', err);
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  // Extract from Basic auth header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const colonIdx = decoded.indexOf(':');
      if (colonIdx > 0) {
        if (!params.client_id) params.client_id = decoded.slice(0, colonIdx);
        if (!params.client_secret) params.client_secret = decoded.slice(colonIdx + 1);
      }
    } catch { /* ignore */ }
  }

  const grantType = params.grant_type;
  console.log('[mcp/token] request:', { grantType, hasCode: !!params.code, hasVerifier: !!params.code_verifier, hasClientId: !!params.client_id, hasClientSecret: !!params.client_secret });

  // ── Authorization Code Grant (Claude PKCE flow) ──
  if (grantType === 'authorization_code') {
    const { code, code_verifier, redirect_uri } = params;

    if (!code) {
      console.error('[mcp/token] missing code');
      return NextResponse.json({ error: 'invalid_request', error_description: 'code is required' }, { status: 400 });
    }
    if (!code_verifier) {
      console.error('[mcp/token] missing code_verifier');
      return NextResponse.json({ error: 'invalid_request', error_description: 'code_verifier is required' }, { status: 400 });
    }

    // Look up auth code
    const { data: authCode, error: codeErr } = await supabase
      .from('McpAuthCode')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (codeErr) {
      console.error('[mcp/token] DB error looking up code:', codeErr.message, codeErr.code);
      // Table might not exist
      if (codeErr.code === '42P01' || codeErr.message?.includes('does not exist')) {
        return NextResponse.json({ error: 'server_error', error_description: 'Auth code table not configured. Run the migration.' }, { status: 500 });
      }
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    if (!authCode) {
      console.error('[mcp/token] code not found:', code.slice(0, 8) + '...');
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }, { status: 400 });
    }

    console.log('[mcp/token] authorization code found, validating');

    // Check expiry
    if (new Date(authCode.expiresAt) < new Date()) {
      console.error('[mcp/token] code expired');
      await supabase.from('McpAuthCode').delete().eq('code', code);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Authorization code expired' }, { status: 400 });
    }

    // Verify PKCE
    const expectedChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    console.log('[mcp/token] PKCE:', { expected: expectedChallenge.slice(0, 12), stored: authCode.codeChallenge?.slice(0, 12), match: expectedChallenge === authCode.codeChallenge });

    if (expectedChallenge !== authCode.codeChallenge) {
      console.error('[mcp/token] PKCE mismatch');
      await supabase.from('McpAuthCode').delete().eq('code', code);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, { status: 400 });
    }

    // Verify redirect_uri if provided
    if (redirect_uri && redirect_uri !== authCode.redirectUri) {
      console.error('[mcp/token] redirect_uri mismatch:', { expected: authCode.redirectUri, got: redirect_uri });
      await supabase.from('McpAuthCode').delete().eq('code', code);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400 });
    }

    // Verify state nonce — ensures the authorization response was not forged
    // or replayed with a tampered state value.
    if (authCode.stateHash) {
      const state = params.state;
      if (!state) {
        console.error('[mcp/token] state required but missing');
        await supabase.from('McpAuthCode').delete().eq('code', code);
        return NextResponse.json({ error: 'invalid_grant', error_description: 'state parameter required' }, { status: 400 });
      }
      const expectedStateHash = crypto
        .createHash('sha256')
        .update(`${authCode.stateNonce}:${state}`)
        .digest('hex');
      if (expectedStateHash !== authCode.stateHash) {
        console.error('[mcp/token] state nonce verification failed');
        await supabase.from('McpAuthCode').delete().eq('code', code);
        return NextResponse.json({ error: 'invalid_grant', error_description: 'state verification failed' }, { status: 400 });
      }
    }

    // Delete code (single-use)
    await supabase.from('McpAuthCode').delete().eq('code', code);

    // Update last used
    if (authCode.clientId) {
      supabase.from('McpApiKey').update({ lastUsedAt: new Date().toISOString() }).eq('clientId', authCode.clientId).then(() => {});
    }

    // Issue JWT
    const expiresIn = 3600; // 1 hour
    let jwtSecret: Uint8Array;
    try {
      jwtSecret = getJwtSecret();
    } catch {
      return NextResponse.json({ error: 'MCP not configured' }, { status: 500 });
    }

    const token = await new SignJWT({ spaceId: authCode.spaceId, sub: authCode.clientId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(jwtSecret);

    console.log('[mcp/token] SUCCESS — issued JWT via authorization_code grant');

    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: expiresIn,
    });
  }

  // ── Client Credentials Grant ──
  if (grantType === 'client_credentials' || !grantType) {
    const { client_id, client_secret } = params;

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'client_id and client_secret required' }, { status: 400 });
    }

    const secretHash = crypto.createHash('sha256').update(client_secret).digest('hex');
    const { data: key } = await supabase
      .from('McpApiKey')
      .select('spaceId, clientSecretHash')
      .eq('clientId', client_id)
      .maybeSingle();

    if (!key || key.clientSecretHash !== secretHash) {
      return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
    }

    supabase.from('McpApiKey').update({ lastUsedAt: new Date().toISOString() }).eq('clientId', client_id).then(() => {});

    let jwtSecret: Uint8Array;
    try {
      jwtSecret = getJwtSecret();
    } catch {
      return NextResponse.json({ error: 'MCP not configured' }, { status: 500 });
    }

    const expiresIn = 3600; // 1 hour
    const token = await new SignJWT({ spaceId: key.spaceId, sub: client_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(jwtSecret);

    return NextResponse.json({ access_token: token, token_type: 'bearer', expires_in: expiresIn });
  }

  console.error('[mcp/token] unsupported grant_type:', grantType);
  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://claude.ai",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
