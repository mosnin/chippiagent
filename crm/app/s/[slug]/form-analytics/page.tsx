import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { FormAnalytics } from '@/components/analytics/form-analytics';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Form Analytics',
};

export default async function FormAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return <FormAnalytics slug={slug} standalone />;
}
