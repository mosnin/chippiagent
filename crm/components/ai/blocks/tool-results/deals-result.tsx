'use client';

import { useParams } from 'next/navigation';
import { DealCard } from './deal-card';

interface DealSummary {
  id: string;
  title: string;
  address?: string | null;
  value?: number | null;
  status?: string;
  priority?: string;
  stageId?: string;
  closeDate?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
}

interface DealsResultData {
  deals: DealSummary[];
}

export function DealsResult({ data }: { data: DealsResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;

  if (!data.deals?.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {data.deals.map((d, i) => (
        <DealCard key={d.id} deal={d} slug={slug ?? ''} animDelay={i * 0.05} />
      ))}
    </div>
  );
}
