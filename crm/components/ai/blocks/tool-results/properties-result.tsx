'use client';

import { useParams } from 'next/navigation';
import { PropertyCard } from './property-card';

interface PropertySummary {
  id: string;
  address: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  listingStatus?: string;
}

interface PropertiesResultData {
  properties: PropertySummary[];
}

export function PropertiesResult({ data }: { data: PropertiesResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  if (!data.properties?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {data.properties.map((p, i) => (
        <PropertyCard key={p.id} property={p} slug={slug ?? ''} animDelay={i * 0.05} />
      ))}
    </div>
  );
}
