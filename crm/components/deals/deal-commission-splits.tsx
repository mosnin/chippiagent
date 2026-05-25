'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Check, Loader2, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import {
  COMMISSION_PARTIES,
  computeCommission,
  type CommissionParty,
  type CommissionBasis,
  type CommissionSplit,
} from '@/lib/commissions';

interface Props {
  dealId: string;
  dealValue: number | null;
  dealCommissionRate: number | null;
  initial?: CommissionSplit[];
}

/**
 * Commission-splits panel. Shows GCI + net and the individual split rows. A
 * row can be added inline; each row is toggled paid/unpaid with the check
 * button. We don't nag: showing nothing is a valid state (net = gci).
 */
export function DealCommissionSplits({ dealId, dealValue, dealCommissionRate, initial = [] }: Props) {
  const [items, setItems] = useState<CommissionSplit[]>(initial);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ party: CommissionParty; label: string; basis: CommissionBasis; percent: string; flat: string }>({
    party: 'brokerage',
    label: '',
    basis: 'percent',
    percent: '',
    flat: '',
  });

  useEffect(() => {
    if (initial.length > 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/deals/${dealId}/commission-splits`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setItems(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dealId, initial.length]);

  const commission = useMemo(
    () => computeCommission(dealValue, dealCommissionRate, items),
    [dealValue, dealCommissionRate, items],
  );

  async function addRow() {
    if (!draft.label.trim()) { toast.error('Add a label first.'); return; }
    const body: Record<string, unknown> = {
      party: draft.party,
      label: draft.label.trim(),
      basis: draft.basis,
    };
    if (draft.basis === 'percent') body.percentOfGci = Number(draft.percent);
    else body.flatAmount = Number(draft.flat);

    const res = await fetch(`/api/deals/${dealId}/commission-splits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Couldn't add that split.");
      return;
    }
    const created: CommissionSplit = await res.json();
    setItems((prev) => [...prev, created]);
    setAdding(false);
    setDraft({ party: 'brokerage', label: '', basis: 'percent', percent: '', flat: '' });
  }

  async function togglePaid(s: CommissionSplit) {
    const prev = items;
    const now = s.paidAt ? null : new Date().toISOString();
    setItems((list) => list.map((x) => x.id === s.id ? { ...x, paidAt: now } : x));
    const res = await fetch(`/api/deals/${dealId}/commission-splits/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAt: now }),
    });
    if (!res.ok) { setItems(prev); toast.error("Couldn't update that."); }
  }

  async function remove(s: CommissionSplit) {
    const prev = items;
    setItems((list) => list.filter((x) => x.id !== s.id));
    const res = await fetch(`/api/deals/${dealId}/commission-splits/${s.id}`, { method: 'DELETE' });
    if (!res.ok) { setItems(prev); toast.error("Couldn't delete that."); }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <DollarSign size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Commission</h2>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <Summary label="GCI"     value={commission.gci} />
        <Summary label="Splits"  value={commission.outgoing} subValue={commission.outgoingUnpaid > 0 ? `${formatCurrency(commission.outgoingUnpaid)} unpaid` : undefined} />
        <Summary label="Net"     value={commission.net} bold />
      </div>

      {/* Rows */}
      {loading && items.length === 0 ? (
        <div className="px-4 py-5 text-xs text-muted-foreground">One moment.</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-5 text-xs text-muted-foreground text-center">
          No splits yet. Net equals GCI until you add them.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((s) => {
            const amount = s.basis === 'percent'
              ? (commission.gci * (s.percentOfGci ?? 0)) / 100
              : (s.flatAmount ?? 0);
            const paid = !!s.paidAt;
            return (
              <li key={s.id} className="group flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => togglePaid(s)}
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-colors',
                    paid
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : 'border border-border text-muted-foreground hover:border-foreground',
                  )}
                  title={paid ? 'Paid — tap to unmark' : 'Unpaid — tap to mark paid'}
                >
                  {paid && <Check size={11} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {COMMISSION_PARTIES.find((p) => p.value === s.party)?.label ?? s.party}
                    {s.basis === 'percent' ? ` · ${s.percentOfGci}% of GCI` : ` · flat`}
                    {paid ? ' · paid' : ''}
                  </p>
                </div>
                <span className="tabular-nums text-sm font-semibold">{formatCurrency(amount)}</span>
                <button
                  type="button"
                  onClick={() => remove(s)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  aria-label={`Delete ${s.label}`}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add row */}
      <div className="border-t border-border">
        {adding ? (
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={draft.party}
                onChange={(e) => setDraft((d) => ({ ...d, party: e.target.value as CommissionParty }))}
                className="text-xs border border-border rounded px-2 py-1 bg-transparent"
              >
                {COMMISSION_PARTIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Label (e.g. Broker split)"
                className="text-xs border border-border rounded px-2 py-1 bg-transparent"
                maxLength={160}
              />
            </div>
            <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
              <select
                value={draft.basis}
                onChange={(e) => setDraft((d) => ({ ...d, basis: e.target.value as CommissionBasis }))}
                className="text-xs border border-border rounded px-2 py-1 bg-transparent"
              >
                <option value="percent">Percent</option>
                <option value="flat">Flat $</option>
              </select>
              {draft.basis === 'percent' ? (
                <input
                  type="number"
                  min="0" max="100" step="0.1"
                  value={draft.percent}
                  onChange={(e) => setDraft((d) => ({ ...d, percent: e.target.value }))}
                  placeholder="% of GCI"
                  className="text-xs border border-border rounded px-2 py-1 bg-transparent"
                />
              ) : (
                <input
                  type="number" min="0" step="0.01"
                  value={draft.flat}
                  onChange={(e) => setDraft((d) => ({ ...d, flat: e.target.value }))}
                  placeholder="Flat dollar amount"
                  className="text-xs border border-border rounded px-2 py-1 bg-transparent"
                />
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-xs font-semibold rounded-md bg-foreground text-background px-2.5 py-1"
              >
                Add split
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors inline-flex items-center gap-1.5"
          >
            <Plus size={11} /> Add split
          </button>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value, subValue, bold }: { label: string; value: number; subValue?: string; bold?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums mt-0.5', bold ? 'text-lg font-semibold' : 'text-sm font-medium')}>
        {formatCurrency(value)}
      </p>
      {subValue && <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">{subValue}</p>}
    </div>
  );
}
