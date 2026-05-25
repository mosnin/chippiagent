import type { PropertyType, PropertyListingStatus } from '@/lib/types';

export const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'single_family', label: 'Single family' },
  { value: 'condo',         label: 'Condo' },
  { value: 'townhouse',     label: 'Townhouse' },
  { value: 'multi_family',  label: 'Multi-family' },
  { value: 'land',          label: 'Land' },
  { value: 'commercial',    label: 'Commercial' },
  { value: 'other',         label: 'Other' },
];

export const PROPERTY_LISTING_STATUS_OPTIONS: { value: PropertyListingStatus; label: string }[] = [
  { value: 'active',     label: 'Active' },
  { value: 'pending',    label: 'Pending' },
  { value: 'sold',       label: 'Sold' },
  { value: 'off_market', label: 'Off market' },
  { value: 'owned',      label: 'Owned' },
];

const TYPE_SET = new Set(PROPERTY_TYPE_OPTIONS.map((o) => o.value));
const STATUS_SET = new Set(PROPERTY_LISTING_STATUS_OPTIONS.map((o) => o.value));

export function isValidPropertyType(v: unknown): v is PropertyType {
  return typeof v === 'string' && TYPE_SET.has(v as PropertyType);
}

export function isValidListingStatus(v: unknown): v is PropertyListingStatus {
  return typeof v === 'string' && STATUS_SET.has(v as PropertyListingStatus);
}

/** A single-line display string: "123 Main St #4B, Oakland". */
export function formatPropertyAddress(p: {
  address: string;
  unitNumber: string | null;
  city: string | null;
  stateRegion: string | null;
}): string {
  const unit = p.unitNumber ? ` #${p.unitNumber}` : '';
  const cityState = [p.city, p.stateRegion].filter(Boolean).join(', ');
  return cityState ? `${p.address}${unit}, ${cityState}` : `${p.address}${unit}`;
}

/** Short chips like "3bd · 2ba · 1,450 sqft". */
export function formatPropertyFacts(p: {
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
}): string {
  const parts: string[] = [];
  if (p.beds != null) parts.push(`${p.beds}bd`);
  if (p.baths != null) parts.push(`${p.baths}ba`);
  if (p.squareFeet != null) parts.push(`${p.squareFeet.toLocaleString()} sqft`);
  return parts.join(' · ');
}
