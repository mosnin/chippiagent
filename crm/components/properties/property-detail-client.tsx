'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2, ExternalLink, Building2, Briefcase, CalendarDays, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/types';
import { formatCurrency } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts, PROPERTY_LISTING_STATUS_OPTIONS } from '@/lib/properties';
import { PropertyForm } from './property-form';
import { PropertyShareDialog } from './property-share-dialog';

interface Props {
  slug: string;
  initial: Property;
  linkedDeals: { id: string; title: string; status: string; value: number | null; closeDate: string | null }[];
  linkedTours: { id: string; guestName: string; startsAt: string; status: string }[];
}

export function PropertyDetailClient({ slug, initial, linkedDeals, linkedTours }: Props) {
  const router = useRouter();
  const [property, setProperty] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function save(values: Partial<Property>) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't save that. Try again.");
        return;
      }
      const updated: Property = await res.json();
      setProperty(updated);
      setEditing(false);
      toast.success('Saved.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this property? Linked deals and tours stay intact.')) return;
    const res = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error("Couldn't delete that property."); return; }
    toast.success('Deleted.');
    router.push(`/s/${slug}/properties/commissions`);
  }

  const statusLabel = PROPERTY_LISTING_STATUS_OPTIONS.find((o) => o.value === property.listingStatus)?.label
    ?? property.listingStatus;
  const cover = property.photos[0];
  const addr = formatPropertyAddress(property);
  const facts = formatPropertyFacts(property);

  if (editing) {
    return (
      <div className="rounded-lg border border-border/70 bg-card p-5">
        <h1 className="text-lg font-semibold mb-4">Edit property</h1>
        <PropertyForm
          initial={property}
          onCancel={() => setEditing(false)}
          onSubmit={save}
          submitting={submitting}
          submitLabel="Save changes"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4">
      {/* Left: hero + facts */}
      <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
        <div className="aspect-[4/3] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Building2 size={32} />
            </div>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">{addr}</h1>
            {facts && <p className="text-xs text-muted-foreground mt-0.5">{facts}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
              {statusLabel}
            </span>
            {property.propertyType && (
              <span className="text-muted-foreground">· {property.propertyType.replace('_', ' ')}</span>
            )}
          </div>

          {property.listPrice != null && (
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(property.listPrice)}</p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
            {property.yearBuilt != null && <Fact label="Year built" value={String(property.yearBuilt)} />}
            {property.lotSizeSqft != null && <Fact label="Lot" value={`${property.lotSizeSqft.toLocaleString()} sqft`} />}
            {property.mlsNumber && <Fact label="MLS" value={property.mlsNumber} />}
          </dl>

          {property.listingUrl && (
            <a href={property.listingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
              View listing <ExternalLink size={11} />
            </a>
          )}

          {property.notes && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap pt-3 border-t border-border">
              {property.notes}
            </p>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={11} /> Delete
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSharing(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold rounded-md border border-border bg-card hover:bg-muted px-2.5 py-1"
              >
                <Share2 size={11} /> Share
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold rounded-md bg-foreground text-background px-2.5 py-1"
              >
                <Pencil size={11} /> Edit
              </button>
            </div>
          </div>

          {sharing && (
            <PropertyShareDialog
              propertyId={property.id}
              linkedDealIds={linkedDeals.map((d) => d.id)}
              origin={origin}
              onClose={() => setSharing(false)}
            />
          )}
        </div>
      </div>

      {/* Right: linked deals + tours */}
      <div className="space-y-4">
        <LinkedSection
          title="Linked deals"
          icon={Briefcase}
          empty="No deals linked to this property yet."
          items={linkedDeals.map((d) => ({
            key: d.id,
            href: `/s/${slug}/deals/${d.id}`,
            primary: d.title,
            secondary: [
              d.status !== 'active' ? d.status : null,
              d.value != null ? formatCurrency(d.value) : null,
              d.closeDate ? `Closes ${new Date(d.closeDate).toLocaleDateString()}` : null,
            ].filter(Boolean).join(' · '),
          }))}
        />
        <LinkedSection
          title="Tours"
          icon={CalendarDays}
          empty="No tours have been scheduled here yet."
          items={linkedTours.map((t) => {
            const d = new Date(t.startsAt);
            return {
              key: t.id,
              href: `/s/${slug}/calendar`,
              primary: t.guestName,
              secondary: `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
            };
          })}
        />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}

function LinkedSection({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: typeof Briefcase;
  items: { key: string; href: string; primary: string; secondary: string }[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-muted-foreground text-center">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors')}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.primary}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{item.secondary}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
