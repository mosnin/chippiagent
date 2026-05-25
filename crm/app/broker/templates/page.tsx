import { getBrokerMemberContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import TemplatesClient from './templates-client';

export const metadata = { title: 'Templates — Broker Dashboard' };

export default async function TemplatesPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  return <TemplatesClient />;
}
