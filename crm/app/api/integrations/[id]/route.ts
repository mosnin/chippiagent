/**
 * DELETE /api/integrations/[id]
 *
 * Disconnect an integration. One tap, no confirm dialog — the realtor
 * knows what they meant. Revokes at Composio (best-effort) and flips
 * the row to 'revoked'. The chat agent picks up the change on the next
 * turn because it reads `activeToolkits()` per request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getById, revoke } from '@/lib/integrations/connections';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const row = await getById(id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Confirm the row belongs to the caller's space — guards against a
  // user disconnecting another realtor's integration via id-guess.
  const space = await getSpaceForUser(userId);
  if (!space || row.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await revoke(row);
  return NextResponse.json({ ok: true });
}
