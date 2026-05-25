import { getBrokerMemberContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import AnnouncementsClient from './announcements-client';

export const metadata = { title: 'Announcements — Broker Dashboard' };

export default async function AnnouncementsPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  return <AnnouncementsClient />;
}
