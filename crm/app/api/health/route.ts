import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

/**
 * Internal health check — admin-only.
 * Returns opaque status values; never exposes env var names, table schemas,
 * raw DB rows, or error messages to unauthenticated callers.
 */
export async function GET() {
  // Require authentication
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Require admin role (set via Clerk publicMetadata: { role: 'admin' })
  const isAdmin = (sessionClaims?.publicMetadata as Record<string, unknown>)?.role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let dbStatus: 'ok' | 'error' = 'error';
  try {
    const { error } = await supabase.from('User').select('id').limit(1);
    if (!error) dbStatus = 'ok';
  } catch {
    // intentionally swallowed — status already 'error'
  }

  return NextResponse.json({ status: 'ok', db: dbStatus });
}
