import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { syncContact, syncDeal } from '@/lib/vectorize';
import type { Contact, Deal, DealStage } from '@/lib/types';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await req.json();
  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Verify the authenticated user owns this space
  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [contactsResult, dealsResult] = await Promise.all([
    supabase.from('Contact').select('*').eq('spaceId', space.id),
    supabase.from('Deal').select('*, DealStage(name, color, position)').eq('spaceId', space.id),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (dealsResult.error) throw dealsResult.error;

  const contacts = contactsResult.data as Contact[];
  const dealRows = dealsResult.data as (Deal & { DealStage: { name: string; color: string; position: number } | null })[];

  const deals = dealRows.map((row) => ({
    ...row,
    stageName: row.DealStage?.name,
    stageColor: row.DealStage?.color,
    stagePosition: row.DealStage?.position,
    stage: {
      id: row.stageId,
      spaceId: row.spaceId,
      name: row.DealStage?.name,
      color: row.DealStage?.color,
      position: row.DealStage?.position,
    } as DealStage,
  }));

  await Promise.all([
    ...contacts.map((c: Contact) => syncContact(c).catch(console.error)),
    ...deals.map((d: Deal & { stage: DealStage }) => syncDeal(d).catch(console.error))
  ]);

  return NextResponse.json({
    synced: { contacts: contacts.length, deals: deals.length }
  });
}
