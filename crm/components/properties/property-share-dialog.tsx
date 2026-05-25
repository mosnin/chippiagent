'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check, Loader2, Share2, Trash2, RefreshCw, X } from 'lucide-react';
import type { PropertyPacket } from '@/lib/types';
import type { DealDocument } from '@/lib/deals/documents';
import { documentKindLabel } from '@/lib/deals/documents';

interface Props {
  propertyId: string;
  /** Deal ids linked to this property — used to list their documents. */
  linkedDealIds: string[];
  origin: string;
  onClose: () => void;
}

/**
 * Dialog for creating / managing listing-packet share links for a property.
 * Fetches existing packets + candidate documents (from deals linked to this
 * property), lets the realtor curate which documents go in, and hands back
 * the shareable URL on create.
 */
export function PropertyShareDialog({ propertyId, linkedDealIds, origin, onClose }: Props) {
  const [packets, setPackets] = useState<PropertyPacket[]>([]);
  const [candidateDocs, setCandidateDocs] = useState<DealDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [packetsRes, ...docResults] = await Promise.all([
          fetch(`/api/properties/${propertyId}/packets`),
          ...linkedDealIds.map((id) => fetch(`/api/deals/${id}/documents`)),
        ]);

        if (!cancelled && packetsRes.ok) {
          setPackets(await packetsRes.json());
        }

        const docs: DealDocument[] = [];
        for (const res of docResults) {
          if (res.ok) docs.push(...(await res.json()));
        }
        if (!cancelled) setCandidateDocs(docs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [propertyId, linkedDealIds]);

  function toggleDoc(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim()) { toast.error('Give it a name first.'); return; }
    setCreating(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/packets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), includeDocumentIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't create that link.");
        return;
      }
      const packet: PropertyPacket = await res.json();
      setPackets((prev) => [packet, ...prev]);
      setName('');
      setSelected(new Set());
      toast.success('Link created. Copy it to share.');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(p: PropertyPacket) {
    if (!confirm("Revoke this link? Anyone with the URL loses access right away.")) return;
    const res = await fetch(`/api/properties/${propertyId}/packets/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoked: true }),
    });
    if (!res.ok) { toast.error("Couldn't revoke that link."); return; }
    setPackets((prev) => prev.map((x) => x.id === p.id ? { ...x, revokedAt: new Date().toISOString() } : x));
  }

  async function copyLink(p: PropertyPacket) {
    const url = `${origin}/packet/${p.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((v) => (v === p.id ? null : v)), 1500);
    } catch {
      toast.error("Couldn't copy. Grab it from the field manually.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[8vh] px-4" onClick={onClose}>
      <div className="w-full max-w-[720px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Share2 size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Share this property</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
          {/* Create */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New link</h3>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tour packet for Jane"
              className="w-full text-sm bg-transparent border border-border rounded px-2.5 py-1.5"
              maxLength={200}
            />

            {candidateDocs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Include documents from linked deals:
                </p>
                <ul className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto">
                  {candidateDocs.map((d) => (
                    <li key={d.id}>
                      <label className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggleDoc(d.id)}
                          className="cursor-pointer"
                        />
                        <span className="flex-1 truncate font-medium">{d.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {documentKindLabel(d.kind)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={create}
              disabled={creating || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              {creating && <Loader2 size={12} className="animate-spin" />}
              Create link
            </button>
            <p className="text-[10px] text-muted-foreground">Expires in 7 days by default.</p>
          </section>

          {/* Existing */}
          <section className="space-y-2 pt-5 border-t border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {packets.length === 0 ? 'No links yet' : 'Existing links'}
            </h3>
            {loading && <p className="text-xs text-muted-foreground">One moment.</p>}
            <ul className="space-y-2">
              {packets.map((p) => {
                const url = `${origin}/packet/${p.token}`;
                const revoked = !!p.revokedAt;
                const expired = p.expiresAt ? new Date(p.expiresAt) < new Date() : false;
                const dead = revoked || expired;
                return (
                  <li key={p.id} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate flex-1">{p.name}</p>
                      {dead && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {revoked ? 'Revoked' : 'Expired'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 text-[11px] font-mono bg-muted rounded px-2 py-1 truncate">{url}</code>
                      <button
                        type="button"
                        onClick={() => copyLink(p)}
                        disabled={dead}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 disabled:opacity-50"
                      >
                        {copiedId === p.id ? <Check size={11} /> : <Copy size={11} />}
                        {copiedId === p.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {p.viewCount} view{p.viewCount === 1 ? '' : 's'}
                        {p.lastViewedAt && ` · last ${new Date(p.lastViewedAt).toLocaleDateString()}`}
                      </span>
                      {!dead && (
                        <button
                          type="button"
                          onClick={() => revoke(p)}
                          className="inline-flex items-center gap-1 hover:text-destructive transition-colors"
                        >
                          <Trash2 size={10} /> Revoke
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
