'use client';

import { useState, useEffect } from 'react';
import { Loader2, GitCompare, X, Star, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CompareContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  budget: number | null;
  leadScore: number | null;
  scoreLabel: string | null;
  scoreSummary: string | null;
  applicationData: Record<string, any> | null;
  applicationStatus: string | null;
  createdAt: string;
}

interface ApplicationCompareProps {
  slug: string;
  selectedIds: string[];
  onClose: () => void;
}

const COMPARE_FIELDS: Array<{ key: string; label: string; format?: (v: any) => string }> = [
  { key: 'leadScore', label: 'Lead Score', format: (v) => v != null ? `${Math.round(v)}/100` : '—' },
  { key: 'scoreLabel', label: 'Tier', format: (v) => v || '—' },
  { key: 'budget', label: 'Budget', format: (v) => v != null ? `$${Number(v).toLocaleString()}/mo` : '—' },
  { key: 'applicationStatus', label: 'Status', format: (v) => v || 'received' },
];

const APP_FIELDS: Array<{ key: string; label: string; format?: (v: any) => string }> = [
  { key: 'monthlyGrossIncome', label: 'Monthly Income', format: (v) => v != null ? `$${Number(v).toLocaleString()}` : '—' },
  { key: 'employmentStatus', label: 'Employment' },
  { key: 'targetMoveInDate', label: 'Move-in Date' },
  { key: 'adultsOnApplication', label: 'Adults' },
  { key: 'childrenOrDependents', label: 'Children' },
  { key: 'leaseTermPreference', label: 'Lease Term' },
  { key: 'currentHousingStatus', label: 'Housing Status' },
  { key: 'currentRentPaid', label: 'Current Rent', format: (v) => v != null ? `$${Number(v).toLocaleString()}/mo` : '—' },
  { key: 'priorEvictions', label: 'Evictions', format: (v) => v === true ? 'Yes' : v === false ? 'No' : '—' },
  { key: 'outstandingBalances', label: 'Outstanding Balances', format: (v) => v === true ? 'Yes' : v === false ? 'No' : '—' },
  { key: 'bankruptcy', label: 'Bankruptcy', format: (v) => v === true ? 'Yes' : v === false ? 'No' : '—' },
  { key: 'hasPets', label: 'Pets', format: (v) => v === true ? 'Yes' : v === false ? 'No' : '—' },
  { key: 'smoking', label: 'Smoking', format: (v) => v === true ? 'Yes' : v === false ? 'No' : '—' },
];

export function ApplicationCompare({ slug, selectedIds, onClose }: ApplicationCompareProps) {
  const [contacts, setContacts] = useState<CompareContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/applications/compare?slug=${slug}&ids=${selectedIds.join(',')}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setContacts(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, selectedIds]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-lg border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <GitCompare size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Compare Applicants ({contacts.length})</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted">
            <X size={14} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground w-40 sticky left-0 bg-card">Field</th>
                {contacts.map((c) => (
                  <th key={c.id} className="text-left px-4 py-3 min-w-[180px]">
                    <div>
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-normal">{c.email || c.phone || '—'}</p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Contact-level fields */}
              {COMPARE_FIELDS.map((field) => (
                <tr key={field.key} className="border-b border-border/50">
                  <td className="px-4 py-2 text-xs text-muted-foreground sticky left-0 bg-card">{field.label}</td>
                  {contacts.map((c) => {
                    const val = (c as any)[field.key];
                    const display = field.format ? field.format(val) : (val ?? '—');
                    const isFlag = field.key === 'scoreLabel';
                    return (
                      <td key={c.id} className="px-4 py-2">
                        <span className={cn(
                          'text-sm',
                          isFlag && val === 'hot' && 'text-red-600 dark:text-red-400 font-semibold',
                          isFlag && val === 'warm' && 'text-amber-600 dark:text-amber-400 font-semibold',
                          isFlag && val === 'cold' && 'text-slate-500 dark:text-slate-400',
                        )}>
                          {display}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Separator */}
              <tr>
                <td colSpan={contacts.length + 1} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                  Application Details
                </td>
              </tr>

              {/* App data fields */}
              {APP_FIELDS.map((field) => (
                <tr key={field.key} className="border-b border-border/50">
                  <td className="px-4 py-2 text-xs text-muted-foreground sticky left-0 bg-card">{field.label}</td>
                  {contacts.map((c) => {
                    const val = c.applicationData?.[field.key];
                    const display = field.format ? field.format(val) : (val ?? '—');
                    const isRisk = ['priorEvictions', 'outstandingBalances', 'bankruptcy'].includes(field.key) && val === true;
                    return (
                      <td key={c.id} className="px-4 py-2">
                        <span className={cn('text-sm', isRisk && 'text-destructive font-semibold')}>
                          {String(display)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Income-to-rent ratio */}
              <tr className="border-b border-border/50 bg-muted/10">
                <td className="px-4 py-2 text-xs text-muted-foreground sticky left-0 bg-card font-medium">Income-to-Rent</td>
                {contacts.map((c) => {
                  const income = c.applicationData?.monthlyGrossIncome;
                  const rent = c.budget || c.applicationData?.monthlyRent;
                  if (income && rent && Number(rent) > 0) {
                    const ratio = Number(income) / Number(rent);
                    return (
                      <td key={c.id} className="px-4 py-2">
                        <span className={cn(
                          'text-sm font-semibold',
                          ratio >= 3 ? 'text-emerald-600 dark:text-emerald-400' : ratio >= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                        )}>
                          {ratio.toFixed(1)}x
                          {ratio >= 3 && <CheckCircle2 size={11} className="inline ml-1" />}
                          {ratio < 2 && <AlertTriangle size={11} className="inline ml-1" />}
                        </span>
                      </td>
                    );
                  }
                  return <td key={c.id} className="px-4 py-2 text-sm text-muted-foreground">—</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
