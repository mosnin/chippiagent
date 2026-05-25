'use client';

import { useParams } from 'next/navigation';
import { TourCard, type TourSummary } from './tour-card';

interface ToursResultData {
  tours: TourSummary[];
}

/**
 * Inline rendering of `schedule_tour` (and any future tour-listing) tool
 * results. Each tour renders as an expandable inline card with a mini
 * schedule / timeline view on expand.
 */
export function ToursResult({ data }: { data: ToursResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;

  if (!data.tours?.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {data.tours.map((t, i) => (
        <TourCard key={t.tourId} tour={t} slug={slug ?? ''} animDelay={i * 0.05} />
      ))}
    </div>
  );
}
