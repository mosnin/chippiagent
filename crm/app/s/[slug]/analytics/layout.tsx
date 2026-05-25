import type { Metadata } from 'next';
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs';
import { H1, TITLE_FONT, SECTION_RHYTHM } from '@/lib/typography';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default async function AnalyticsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className={`${SECTION_RHYTHM} max-w-[1120px]`}>
      <header>
        <h1 className={H1} style={TITLE_FONT}>
          Analytics
        </h1>
      </header>
      <AnalyticsTabs slug={slug} />
      {children}
    </div>
  );
}
