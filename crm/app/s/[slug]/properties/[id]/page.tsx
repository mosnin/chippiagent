import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/types';
import { PropertyDetailClient } from '@/components/properties/property-detail-client';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: property } = await supabase
    .from('Property')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!property) notFound();

  const [{ data: deals }, { data: tours }] = await Promise.all([
    supabase
      .from('Deal')
      .select('id, title, status, value, closeDate')
      .eq('propertyId', id)
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false }),
    supabase
      .from('Tour')
      .select('id, guestName, startsAt, status')
      .eq('propertyId', id)
      .eq('spaceId', space.id)
      .order('startsAt', { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-4 max-w-[1200px]">
      <Link
        href={`/s/${slug}/deals`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} /> Deals
      </Link>

      <PropertyDetailClient
        slug={slug}
        initial={property as Property}
        linkedDeals={(deals ?? []) as { id: string; title: string; status: string; value: number | null; closeDate: string | null }[]}
        linkedTours={(tours ?? []) as { id: string; guestName: string; startsAt: string; status: string }[]}
      />
    </div>
  );
}
