import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TourManageClient } from './tour-manage-client';
import { PublicPageMinimalShell } from '@/components/public-page-shell';

export default async function TourManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: tour } = await supabase
    .from('Tour')
    .select('id, guestName, guestEmail, propertyAddress, startsAt, endsAt, status, spaceId')
    .eq('manageToken', token)
    .maybeSingle();

  if (!tour) notFound();

  const [{ data: settings }, { data: space }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('businessName, logoUrl')
      .eq('spaceId', tour.spaceId)
      .maybeSingle(),
    supabase
      .from('Space')
      .select('name, slug')
      .eq('id', tour.spaceId)
      .maybeSingle(),
  ]);

  const businessName = settings?.businessName || space?.name || 'the property';

  return (
    <PublicPageMinimalShell
      logoUrl={settings?.logoUrl}
      businessName={businessName}
    >
      <TourManageClient
        tour={{
          id: tour.id,
          guestName: tour.guestName,
          guestEmail: tour.guestEmail,
          propertyAddress: tour.propertyAddress,
          startsAt: tour.startsAt,
          endsAt: tour.endsAt,
          status: tour.status,
        }}
        token={token}
        businessName={businessName}
        bookingSlug={space?.slug || ''}
      />
    </PublicPageMinimalShell>
  );
}
