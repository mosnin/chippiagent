'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Building2, X, Search, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/types';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';
import { formatCurrency } from '@/lib/formatting';

interface Props {
  dealId: string;
  slug: string;
  initial: Property | null;
}

/**
 * Compact property picker for the deal sidebar. Live search against
 * /api/properties, debounced. Properties are created via the deal-create
 * wizard — no inline-create here, no escape-hatch link to a deleted index.
 */
export function DealPropertyPicker({ dealId, slug, initial }: Props) {
  const [linked, setLinked] = useState<Property | null>(initial);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Property[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/properties?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(query)}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, slug]);

  async function link(p: Property | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: p?.id ?? null }),
      });
      if (!res.ok) { toast.error("Couldn't link the property."); return; }
      setLinked(p);
      setOpen(false);
      setQuery('');
      toast.success(p ? 'Property linked.' : 'Property unlinked.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <Building2 size={12} /> Property
      </p>

      {linked ? (
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-md bg-muted flex-shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {linked.photos[0] ? (
              <img src={linked.photos[0]} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Building2 size={14} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <Link
              href={`/s/${slug}/properties/${linked.id}`}
              className="text-sm font-medium hover:underline inline-flex items-center gap-1"
            >
              {formatPropertyAddress(linked)}
              <ExternalLink size={10} />
            </Link>
            <p className="text-[11px] text-muted-foreground truncate">
              {[formatPropertyFacts(linked), linked.listPrice != null ? formatCurrency(linked.listPrice) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => link(null)}
            disabled={saving}
            className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Unlink"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No property linked — link one to share a packet.</p>
      )}

      {/* Picker toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        {linked ? 'Change…' : 'Link a property…'}
      </button>

      {open && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address, city, MLS#"
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-border bg-transparent"
            />
          </div>

          {searching && <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Searching…</p>}

          {results.length === 0 && !searching && (
            <p className="text-[11px] text-muted-foreground">
              {query.trim().length > 0
                ? 'No matches. Properties get added when you create a deal.'
                : 'Type to search. Properties get added when you create a deal.'}
            </p>
          )}

          {results.length > 0 && (
            <ul className="rounded border border-border divide-y divide-border max-h-64 overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => link(p)}
                    disabled={saving}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-muted/50 transition-colors',
                      linked?.id === p.id && 'bg-muted',
                    )}
                  >
                    <Building2 size={11} className="text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{formatPropertyAddress(p)}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{formatPropertyFacts(p) || '—'}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

        </div>
      )}
    </div>
  );
}
