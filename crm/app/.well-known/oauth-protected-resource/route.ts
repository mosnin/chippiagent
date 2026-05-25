import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
  : 'https://my.usechippi.com';

/**
 * GET /.well-known/oauth-protected-resource
 * RFC 9470 — tells MCP clients where to get tokens for this resource.
 */
export async function GET() {
  return NextResponse.json({
    resource: `${BASE_URL}/api/mcp`,
    authorization_servers: [`${BASE_URL}`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read'],
  });
}
