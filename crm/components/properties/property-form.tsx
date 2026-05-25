'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Property, PropertyListingStatus, PropertyType } from '@/lib/types';
import { PROPERTY_LISTING_STATUS_OPTIONS, PROPERTY_TYPE_OPTIONS } from '@/lib/properties';

type FormValues = Partial<Property>;

interface Props {
  initial?: FormValues;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
  submitting?: boolean;
  submitLabel?: string;
}

/**
 * Shared create/edit form. Keeps the field set small on purpose — a realtor
 * adding a property in the middle of their day shouldn't have to fill 20
 * boxes. Everything except address is optional.
 */
export function PropertyForm({ initial = {}, onCancel, onSubmit, submitting, submitLabel = 'Save' }: Props) {
  const [v, setV] = useState<FormValues>({
    listingStatus: 'active',
    ...initial,
  });

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = (v.address ?? '').trim();
    if (!address) return;
    onSubmit({
      address,
      unitNumber: v.unitNumber?.toString().trim() || null,
      city: v.city?.toString().trim() || null,
      stateRegion: v.stateRegion?.toString().trim() || null,
      postalCode: v.postalCode?.toString().trim() || null,
      mlsNumber: v.mlsNumber?.toString().trim() || null,
      listingUrl: v.listingUrl?.toString().trim() || null,
      propertyType: (v.propertyType ?? null) as PropertyType | null,
      listingStatus: (v.listingStatus ?? 'active') as PropertyListingStatus,
      beds: v.beds != null ? Number(v.beds) : null,
      baths: v.baths != null ? Number(v.baths) : null,
      squareFeet: v.squareFeet != null ? Number(v.squareFeet) : null,
      yearBuilt: v.yearBuilt != null ? Number(v.yearBuilt) : null,
      listPrice: v.listPrice != null ? Number(v.listPrice) : null,
      notes: v.notes?.toString() || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Address row */}
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <Field label="Address" required>
          <input
            type="text"
            required
            value={v.address ?? ''}
            onChange={(e) => set('address', e.target.value)}
            placeholder="123 Main St"
            className="input"
          />
        </Field>
        <Field label="Unit">
          <input
            type="text"
            value={v.unitNumber ?? ''}
            onChange={(e) => set('unitNumber', e.target.value)}
            placeholder="4B"
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="City">
          <input type="text" value={v.city ?? ''} onChange={(e) => set('city', e.target.value)} className="input" />
        </Field>
        <Field label="State">
          <input type="text" value={v.stateRegion ?? ''} onChange={(e) => set('stateRegion', e.target.value)} className="input" />
        </Field>
        <Field label="ZIP">
          <input type="text" value={v.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="MLS #">
          <input type="text" value={v.mlsNumber ?? ''} onChange={(e) => set('mlsNumber', e.target.value)} placeholder="Unique per space" className="input" />
        </Field>
        <Field label="Listing URL">
          <input type="url" value={v.listingUrl ?? ''} onChange={(e) => set('listingUrl', e.target.value)} placeholder="https://…" className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Field label="Type">
          <select
            value={v.propertyType ?? ''}
            onChange={(e) => set('propertyType', (e.target.value || null) as PropertyType | null)}
            className="input"
          >
            <option value="">—</option>
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={v.listingStatus ?? 'active'}
            onChange={(e) => set('listingStatus', e.target.value as PropertyListingStatus)}
            className="input"
          >
            {PROPERTY_LISTING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Beds">
          <input type="number" step="0.5" min="0" value={v.beds ?? ''} onChange={(e) => set('beds', e.target.value === '' ? null : Number(e.target.value))} className="input" />
        </Field>
        <Field label="Baths">
          <input type="number" step="0.5" min="0" value={v.baths ?? ''} onChange={(e) => set('baths', e.target.value === '' ? null : Number(e.target.value))} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Sq ft">
          <input type="number" min="0" value={v.squareFeet ?? ''} onChange={(e) => set('squareFeet', e.target.value === '' ? null : Number(e.target.value))} className="input" />
        </Field>
        <Field label="Year built">
          <input type="number" min="1600" max="2200" value={v.yearBuilt ?? ''} onChange={(e) => set('yearBuilt', e.target.value === '' ? null : Number(e.target.value))} className="input" />
        </Field>
        <Field label="List price">
          <input type="number" min="0" step="1000" value={v.listPrice ?? ''} onChange={(e) => set('listPrice', e.target.value === '' ? null : Number(e.target.value))} className="input" />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={v.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          placeholder="Anything buyers or co-agents should know."
          className="input resize-y"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-md bg-foreground text-background px-3 py-1.5 disabled:opacity-50"
        >
          {submitting && <Loader2 size={12} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>

      {/* Local styles: shared input class so we don't restate the tailwind chain. */}
      <style jsx>{`
        .input {
          width: 100%;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 13px;
          outline: none;
        }
        .input:focus { border-color: var(--foreground); }
      `}</style>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}
