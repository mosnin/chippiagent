import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import ImportExportClient from './import-export-client';

export const metadata = { title: 'Import / Export — Broker Dashboard' };

export default async function ImportExportPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Get total lead count across all member spaces
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);

  const memberUserIds = (memberships ?? []).map((m: { userId: string }) => m.userId);

  let totalLeads = 0;
  if (memberUserIds.length > 0) {
    const { data: spaces } = await supabase
      .from('Space')
      .select('id')
      .in('ownerId', memberUserIds);

    const spaceIds = (spaces ?? []).map((s: { id: string }) => s.id);
    if (spaceIds.length > 0) {
      const { count } = await supabase
        .from('Contact')
        .select('id', { count: 'exact', head: true })
        .in('spaceId', spaceIds);

      totalLeads = count ?? 0;
    }
  }

  return <ImportExportClient totalLeads={totalLeads} />;
}
