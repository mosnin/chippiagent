'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  DollarSign,
  Briefcase,
  Users,
  PawPrint,
  AlertTriangle,
  ArrowRight,
  MessageCircle,
  LayoutGrid,
  List,
  UserCheck,
  Flame,
  Thermometer,
  Snowflake,
  HelpCircle,
  CalendarDays,
  CheckCircle2,
  Tag,
  Download,
  Bookmark,
  X,
  CheckSquare,
  Zap,
  Calendar,
  Home,
  BedDouble,
  Bath,
  ShieldCheck,
  Search,
  ArrowUpDown,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ConvertLeadDialog } from './convert-lead-dialog';
import type { Contact, ApplicationData, LeadScoreDetails, SavedView } from '@/lib/types';
import { downloadCSV, downloadLeadsCSV } from '@/lib/csv';
import { timeAgo, formatMoney, getInitials, formatFollowUpDate, toDateInputValue } from '@/lib/formatting';
import { LEAD_TIERS, type TierKey } from '@/lib/constants';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { TableRowSkeleton, CardSkeleton } from '@/components/ui/skeleton';

const TIERS = LEAD_TIERS;

function getTierKey(lead: Contact): TierKey {
  if (lead.scoringStatus !== 'scored' || !lead.scoreLabel) return 'unscored';
  if (lead.scoreLabel === 'hot') return 'hot';
  if (lead.scoreLabel === 'warm') return 'warm';
  if (lead.scoreLabel === 'cold') return 'cold';
  return 'unscored';
}

// ── Score circle ─────────────────────────────────────────────────────────────

function ScoreHero({ lead }: { lead: Contact }) {
  const tierKey = getTierKey(lead);
  const tier = TIERS[tierKey];
  const TierIcon = tier.icon;
  const score = lead.leadScore != null ? Math.round(lead.leadScore) : null;

  return (
    <div className={cn('flex items-center gap-2.5 rounded-md bg-muted/40 pl-3 pr-4 py-2.5 border-l-2', tier.border)}>
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ring-2', tier.ring, tier.scoreBg)}>
        {score != null ? (
          <span className="text-white font-bold text-lg tabular-nums leading-none">{score}</span>
        ) : (
          <TierIcon size={20} className="text-white opacity-80" />
        )}
      </div>
      <div>
        <div className={cn('flex items-center gap-1.5 font-semibold text-sm', tier.text)}>
          <TierIcon size={14} />
          {tier.label} lead
          {lead.scoringStatus === 'pending' && (
            <span className="inline-flex items-center gap-1 text-xs font-normal opacity-70">
              <span className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin" />
              scoring
            </span>
          )}
        </div>
        {lead.scoreSummary ? (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {lead.scoreSummary}
          </p>
        ) : lead.scoringStatus === 'pending' ? (
          <p className="text-xs text-muted-foreground mt-0.5">AI is analyzing this lead — usually takes a few seconds.</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">No score available</p>
        )}
      </div>
    </div>
  );
}

// ── Qualification chip ───────────────────────────────────────────────────────

function QChip({ icon: Icon, label, highlight, href }: { icon: React.ComponentType<{ size: number }>; label: string; highlight?: boolean; href?: string }) {
  const cls = cn(
    'inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5',
    highlight ? 'bg-secondary text-foreground font-medium' : 'bg-muted text-muted-foreground',
  );
  if (href) {
    return (
      <a href={href} className={cn(cls, 'hover:underline underline-offset-2')}>
        <Icon size={11} />
        {label}
      </a>
    );
  }
  return (
    <div className={cls}>
      <Icon size={11} />
      {label}
    </div>
  );
}

// ── Tier filter pill ─────────────────────────────────────────────────────────

type TierFilter = 'all' | TierKey | 'needs-followup';

const TIER_FILTERS: { key: TierFilter; label: string; icon?: React.ComponentType<{ size: number }> }[] = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot', icon: Flame },
  { key: 'warm', label: 'Warm', icon: Thermometer },
  { key: 'cold', label: 'Cold', icon: Snowflake },
  { key: 'unscored', label: 'Unscored' },
  { key: 'needs-followup', label: 'Needs Follow-up', icon: AlertCircle },
];

// ── Main component ───────────────────────────────────────────────────────────

interface LeadsViewProps {
  leads: Contact[];
  slug: string;
  newLeadIds: Set<string>;
  loading?: boolean;
}

type SortKey = 'newest' | 'oldest' | 'score' | 'score-low' | 'name-az' | 'name-za' | 'followup';
type LeadTypeFilter = 'all' | 'rental' | 'buyer' | 'seller';
type ViewMode = 'card' | 'list';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'score', label: 'Highest score' },
  { value: 'score-low', label: 'Lowest score' },
  { value: 'name-az', label: 'Name A-Z' },
  { value: 'name-za', label: 'Name Z-A' },
  { value: 'followup', label: 'Follow-up date' },
];

function isValidTierFilter(v: string | null): v is TierFilter {
  return v != null && ['all', 'hot', 'warm', 'cold', 'unscored', 'needs-followup'].includes(v);
}
function isValidSort(v: string | null): v is SortKey {
  return v != null && SORT_OPTIONS.some((o) => o.value === v);
}
function isValidLeadType(v: string | null): v is LeadTypeFilter {
  return v != null && ['all', 'rental', 'buyer', 'seller'].includes(v);
}
function isValidView(v: string | null): v is ViewMode {
  return v != null && ['card', 'list'].includes(v);
}

export function LeadsView({ leads: initialLeads, slug, newLeadIds, loading = false }: LeadsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<Contact[]>(initialLeads);

  // Read initial state from URL params, fallback to defaults
  const paramTier = searchParams.get('tier');
  const paramType = searchParams.get('type');
  const paramSort = searchParams.get('sort');
  const paramView = searchParams.get('view');
  const paramSearch = searchParams.get('q');

  const [tierFilter, setTierFilterState] = useState<TierFilter>(isValidTierFilter(paramTier) ? paramTier : 'all');
  const [leadTypeFilter, setLeadTypeFilterState] = useState<LeadTypeFilter>(isValidLeadType(paramType) ? paramType : 'all');
  const [sort, setSortState] = useState<SortKey>(isValidSort(paramSort) ? paramSort : 'newest');
  const [view, setViewState] = useState<ViewMode>(isValidView(paramView) ? paramView : 'list');
  const [search, setSearch] = useState(paramSearch ?? '');
  const [convertTarget, setConvertTarget] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Sync state FROM URL params when they change (e.g., sidebar navigation)
  const searchParamsKey = searchParams.toString();
  useEffect(() => {
    const newTier = searchParams.get('tier');
    const newType = searchParams.get('type');
    const newSort = searchParams.get('sort');
    const newView = searchParams.get('view');
    const newSearch = searchParams.get('q');

    setTierFilterState(isValidTierFilter(newTier) ? newTier : 'all');
    setLeadTypeFilterState(isValidLeadType(newType) ? newType : 'all');
    setSortState(isValidSort(newSort) ? newSort : 'newest');
    setViewState(isValidView(newView) ? newView : 'list');
    setSearch(newSearch ?? '');
  }, [searchParamsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync filters to URL params
  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val == null || val === '' || val === 'all' || (key === 'sort' && val === 'newest') || (key === 'view' && val === 'list')) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    const qs = params.toString();
    router.replace(`/s/${slug}/leads${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router, slug]);

  function setTierFilter(v: TierFilter) {
    setTierFilterState(v);
    updateUrlParams({ tier: v });
  }
  function setLeadTypeFilter(v: LeadTypeFilter) {
    setLeadTypeFilterState(v);
    updateUrlParams({ type: v });
  }
  function setSort(v: SortKey) {
    setSortState(v);
    updateUrlParams({ sort: v });
  }
  function setView(v: ViewMode) {
    setViewState(v);
    updateUrlParams({ view: v });
  }

  // Load saved views from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`saved-views-leads-${slug}`);
      if (stored) setSavedViews(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [slug]);

  // Escape clears selection
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedIds(new Set());
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function persistSavedViews(views: SavedView[]) {
    setSavedViews(views);
    localStorage.setItem(`saved-views-leads-${slug}`, JSON.stringify(views));
  }

  function handleSaveView() {
    if (!saveViewName.trim()) return;
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name: saveViewName.trim(),
      page: 'leads',
      filters: { tierFilter, leadTypeFilter, sort },
    };
    persistSavedViews([...savedViews, newView]);
    setSaveViewName('');
    setShowSaveInput(false);
  }

  function applyView(v: SavedView) {
    const f = v.filters as { tierFilter?: TierFilter; leadTypeFilter?: LeadTypeFilter; sort?: SortKey };
    if (f.tierFilter) setTierFilter(f.tierFilter);
    if (f.leadTypeFilter) setLeadTypeFilter(f.leadTypeFilter);
    if (f.sort) setSort(f.sort);
  }

  function deleteView(id: string) {
    persistSavedViews(savedViews.filter((v) => v.id !== id));
  }

  // Counts for filter badges (based on all leads, not filtered)
  const filterCounts = useMemo(() => {
    const now = new Date();
    return {
      all: leads.length,
      hot: leads.filter((l) => getTierKey(l) === 'hot').length,
      warm: leads.filter((l) => getTierKey(l) === 'warm').length,
      cold: leads.filter((l) => getTierKey(l) === 'cold').length,
      unscored: leads.filter((l) => getTierKey(l) === 'unscored').length,
      'needs-followup': leads.filter((l) => l.followUpAt && new Date(l.followUpAt) < now).length,
      rental: leads.filter((l) => l.leadType === 'rental').length,
      buyer: leads.filter((l) => l.leadType === 'buyer').length,
      seller: leads.filter((l) => l.leadType === 'seller').length,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const now = new Date();
    let list = leads;

    // Tier / special filters
    if (tierFilter === 'needs-followup') {
      list = list.filter((l) => l.followUpAt && new Date(l.followUpAt) < now);
    } else if (tierFilter !== 'all') {
      list = list.filter((l) => getTierKey(l) === tierFilter);
    }

    if (leadTypeFilter !== 'all') {
      list = list.filter((l) => l.leadType === leadTypeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q),
      );
    }
    if (sort === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sort === 'score') {
      list = [...list].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    } else if (sort === 'score-low') {
      list = [...list].sort((a, b) => (a.leadScore ?? Infinity) - (b.leadScore ?? Infinity));
    } else if (sort === 'name-az') {
      list = [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    } else if (sort === 'name-za') {
      list = [...list].sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''));
    } else if (sort === 'followup') {
      list = [...list].sort((a, b) => {
        const aTime = a.followUpAt ? new Date(a.followUpAt).getTime() : Infinity;
        const bTime = b.followUpAt ? new Date(b.followUpAt).getTime() : Infinity;
        return aTime - bTime;
      });
    }
    // Default 'newest' is the original server order (createdAt desc)
    return list;
  }, [leads, tierFilter, leadTypeFilter, sort, search]);

  function handleConverted(leadId: string) {
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
  }

  const patchLead = useCallback(async (id: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error("Couldn't update that lead. Try again.");
        return;
      }
      const updated = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
      if ('followUpAt' in patch) {
        toast.success(patch.followUpAt ? 'Follow-up set.' : 'Follow-up cleared.');
      } else if ('lastContactedAt' in patch) {
        toast.success(patch.lastContactedAt ? 'Marked as contacted.' : 'Contacted status removed.');
      }
    } catch {
      toast.error("Couldn't update that lead. Try again.");
    }
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const confirmed = await confirm({
      title: `Delete ${ids.length} lead${ids.length !== 1 ? 's' : ''}?`,
      description: "These will be gone. I can't bring them back.",
    });
    if (!confirmed) return;
    try {
      const results = await Promise.allSettled(ids.map((id) => fetch(`/api/contacts/${id}`, { method: 'DELETE' })));
      const successIds = ids.filter(
        (_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<Response>).value.ok,
      );
      const failed = ids.length - successIds.length;
      if (failed > 0) {
        toast.error(`Couldn't delete ${failed} of ${ids.length} leads. Try those again.`);
      } else {
        toast.success(`Deleted ${ids.length} lead${ids.length !== 1 ? 's' : ''}.`);
      }
      setLeads((prev) => prev.filter((l) => !successIds.includes(l.id)));
    } catch {
      toast.error("Couldn't delete those leads. Try again.");
    }
    setSelectedIds(new Set());
  }

  function handleExportSelected() {
    const toExport = filtered.filter((l) => selectedIds.has(l.id));
    exportLeadsCSV(toExport);
  }

  function handleExportAll() {
    exportLeadsCSV(filtered);
  }

  function exportLeadsCSV(items: Contact[]) {
    toast.success('Exported.');
    // Use dynamic-aware CSV export that handles formConfigSnapshot
    downloadLeadsCSV('leads.csv', items);
  }

  const leadViews = savedViews.filter((v) => v.page === 'leads');

  return (
    <div className="space-y-4">
      {/* Saved view chips */}
      {leadViews.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Saved:</span>
          {leadViews.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 text-xs font-medium bg-muted rounded-full pl-2.5 pr-1 py-1">
              <button type="button" onClick={() => applyView(v)} className="hover:text-foreground transition-colors">
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(v.id)}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Search bar ── */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tier filter pills */}
        <div className="flex gap-1 flex-wrap">
          {TIER_FILTERS.map(({ key, label, icon: Icon }) => {
            const count = filterCounts[key] ?? 0;
            // Hide "Needs Follow-up" if none exist
            if (key === 'needs-followup' && count === 0) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTierFilter(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  tierFilter === key
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
                )}
              >
                {Icon && <Icon size={11} />}
                {label}
                <span className={cn(
                  'ml-0.5 tabular-nums',
                  tierFilter === key ? 'opacity-80' : 'opacity-60',
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lead type filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground select-none">Type:</span>
          <div className="flex gap-1">
            {(['all', 'rental', 'buyer', 'seller'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setLeadTypeFilter(key)}
                className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  leadTypeFilter === key
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
                )}
              >
                {key === 'all' ? 'All' : key === 'rental' ? 'Rental' : key === 'buyer' ? 'Buyer' : 'Seller'}
                {key !== 'all' && (
                  <span className={cn('ml-1 tabular-nums', leadTypeFilter === key ? 'opacity-80' : 'opacity-60')}>
                    {filterCounts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 ml-auto flex-wrap">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none rounded-md border border-border bg-card pl-7 pr-8 py-1.5 text-xs font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Save view */}
          {showSaveInput ? (
            <div className="flex gap-1">
              <input
                ref={saveInputRef}
                type="text"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="View name…"
                className="text-xs rounded-md border border-input bg-card px-2 py-1 w-28 focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveView();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveView}
                className="text-xs px-2 py-1 rounded-md border border-border bg-card hover:bg-muted transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSaveInput(false)}
                className="text-xs px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Bookmark size={11} />
              Save view
            </button>
          )}

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download size={11} />
            Export
          </button>

          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => setView('card')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'card' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading skeletons ── */}
      {loading && (
        <div className="space-y-0 rounded-lg border border-border/70 overflow-hidden">
          {view === 'card' ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={4} />
            ))
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 bg-card py-12 text-center px-6">
          <div className="w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center mx-auto mb-4">
            <Search size={20} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">
            {search ? 'Nothing matches.' : tierFilter === 'needs-followup' ? "You're caught up." : tierFilter !== 'all' ? `Nothing in ${tierFilter}.` : 'No leads yet.'}
          </p>
          <p className="text-sm text-muted-foreground">
            {search
              ? `Nothing matches "${search}". Try a different word.`
              : tierFilter === 'needs-followup'
              ? "Every follow-up is in good shape."
              : tierFilter !== 'all'
              ? 'Try a different filter.'
              : "Share your intake link and they'll show up here."}
          </p>
          {(search || tierFilter !== 'all' || leadTypeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearch(''); setTierFilter('all'); setLeadTypeFilter('all'); }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
            >
              <X size={11} />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── Card view ── */}
      {!loading && view === 'card' && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const isNew = newLeadIds.has(lead.id);
            const app = lead.applicationData as ApplicationData | null;
            const details = lead.scoreDetails as LeadScoreDetails | null;
            const rawBudget = app?.monthlyRent ?? lead.budget;
            const budgetDisplay = typeof rawBudget === 'string' ? rawBudget : rawBudget != null ? `${formatMoney(rawBudget)}/mo` : null;
            const incomeDisplay = typeof app?.monthlyGrossIncome === 'string' ? app.monthlyGrossIncome : app?.monthlyGrossIncome != null ? `${formatMoney(app.monthlyGrossIncome)} income` : null;
            const intentLabel = app?.leaseTermPreference;
            const intentBadge = intentLabel === 'Yes, ready now' ? { text: 'Ready now', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' }
              : intentLabel === 'Maybe' ? { text: 'Maybe', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' }
              : intentLabel === 'Just exploring' ? { text: 'Exploring', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300' }
              : null;
            const tierKey = getTierKey(lead);
            const tier = TIERS[tierKey];
            const riskFlags = (details?.riskFlags ?? []).filter((f) => f !== 'none');
            const isSelected = selectedIds.has(lead.id);

            return (
              <div
                key={lead.id}
                className={cn(
                  'group rounded-lg border bg-card overflow-hidden transition-colors duration-150',
                  isSelected ? 'border-primary/40 bg-primary/5' :
                  tierKey === 'hot' ? 'border-red-200/80 dark:border-red-800/50' :
                  tierKey === 'warm' ? 'border-amber-200/80 dark:border-amber-800/50' :
                  'border-border/70',
                )}
              >
                {/* Header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-border cursor-pointer flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ opacity: isSelected ? 1 : undefined }}
                    />
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                      {getInitials(lead.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/s/${slug}/leads/${lead.id}`}
                          className="font-semibold text-[15px] leading-tight hover:text-foreground transition-colors"
                        >
                          {lead.name}
                        </Link>
                        {/* Lead type badge */}
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-md px-1.5 py-0.5 border border-border text-muted-foreground flex-shrink-0">
                          <Home size={9} />
                          {lead.leadType === 'buyer' ? 'Buyer' : lead.leadType === 'seller' ? 'Seller' : 'Rental'}
                        </span>
                        {isNew && (
                          <span className="inline-flex text-[10px] font-bold bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 rounded-md px-2 py-0.5 flex-shrink-0">
                            NEW
                          </span>
                        )}
                        {intentBadge && (
                          <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold rounded-md px-2 py-0.5 flex-shrink-0', intentBadge.cls)}>
                            <Zap size={9} />
                            {intentBadge.text}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <Clock size={11} />
                        {timeAgo(new Date(lead.createdAt))}
                        {lead.sourceLabel && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Tag size={10} />
                              {lead.sourceLabel === 'intake-form' ? 'Intake form' : lead.sourceLabel === 'tour-booking' ? 'Tour booking' : lead.sourceLabel}
                            </span>
                          </>
                        )}
                        {lead.lastContactedAt && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={10} />
                              Contacted {timeAgo(new Date(lead.lastContactedAt))}
                            </span>
                          </>
                        )}
                        {lead.followUpAt && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className={cn(
                              'inline-flex items-center gap-1',
                              new Date(lead.followUpAt) < new Date()
                                ? 'text-destructive font-medium'
                                : 'text-amber-600 dark:text-amber-400',
                            )}>
                              <AlertCircle size={10} />
                              {new Date(lead.followUpAt) < new Date()
                                ? `Follow-up overdue`
                                : `Follow-up ${formatFollowUpDate(lead.followUpAt)}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Convert button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConvertTarget(lead)}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-border rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <UserCheck size={12} />
                      <span className="hidden sm:inline">Convert</span>
                    </button>
                    <Link
                      href={`/s/${slug}/leads/${lead.id}`}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      Open
                    </Link>
                  </div>
                </div>

                {/* Score hero */}
                <div className="px-4 pb-3">
                  <ScoreHero lead={lead} />
                </div>

                {/* Key qualification data */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {lead.leadType !== 'rental' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-md px-1.5 py-0.5 border border-border text-muted-foreground">
                      <Home size={9} />
                      {lead.leadType === 'buyer' ? 'Buyer' : 'Seller'}
                    </span>
                  )}
                  {lead.phone && <QChip icon={Phone} label={lead.phone} href={`tel:${lead.phone}`} />}
                  {lead.email && <QChip icon={Mail} label={lead.email} href={`mailto:${lead.email}`} />}
                  {(lead.leadType === 'buyer' || lead.leadType === 'seller') ? (
                    <>
                      {/* Buyer/seller-specific fields */}
                      {budgetDisplay && <QChip icon={DollarSign} label={`Budget: ${budgetDisplay}`} highlight />}
                      {app?.preApprovalStatus && (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-semibold rounded-md px-2 py-0.5',
                          app.preApprovalStatus === 'yes' || app.preApprovalStatus === 'Pre-Approved' || app.preApprovalStatus === 'Yes'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : app.preApprovalStatus === 'not-yet' || app.preApprovalStatus === 'Not Yet' || app.preApprovalStatus === 'In Progress'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
                        )}>
                          <ShieldCheck size={9} />
                          {app.preApprovalStatus === 'yes' ? 'Pre-Approved' : app.preApprovalStatus === 'no' ? 'No Pre-Approval' : app.preApprovalStatus === 'not-yet' ? 'Not Yet' : app.preApprovalStatus}
                        </span>
                      )}
                      {app?.preApprovalAmount && <QChip icon={DollarSign} label={`Approved: ${app.preApprovalAmount}`} />}
                      {app?.propertyType && <QChip icon={Home} label={app.propertyType} />}
                      {app?.bedrooms && <QChip icon={BedDouble} label={`${app.bedrooms} bed`} />}
                      {app?.bathrooms && <QChip icon={Bath} label={`${app.bathrooms} bath`} />}
                      {app?.employmentStatus && <QChip icon={Briefcase} label={app.employmentStatus} />}
                      {incomeDisplay && <QChip icon={DollarSign} label={incomeDisplay} />}
                    </>
                  ) : (
                    <>
                      {/* Rental-specific fields */}
                      {budgetDisplay && <QChip icon={DollarSign} label={budgetDisplay} highlight />}
                      {app?.employmentStatus && <QChip icon={Briefcase} label={app.employmentStatus} />}
                      {incomeDisplay && <QChip icon={DollarSign} label={incomeDisplay} />}
                      {app?.targetMoveInDate && <QChip icon={Calendar} label={app.targetMoveInDate} />}
                      {(app?.numberOfOccupants != null) && (
                        <QChip icon={Users} label={`${app.numberOfOccupants} occupant${app.numberOfOccupants !== 1 ? 's' : ''}`} />
                      )}
                      {(app?.numberOfOccupants == null && app?.adultsOnApplication != null) && (
                        <QChip icon={Users} label={`${app.adultsOnApplication} adult${app.adultsOnApplication !== 1 ? 's' : ''}${(app.childrenOrDependents ?? 0) > 0 ? ` · ${app.childrenOrDependents} child${app.childrenOrDependents !== 1 ? 'ren' : ''}` : ''}`} />
                      )}
                      {app?.hasPets && <QChip icon={PawPrint} label={app.petDetails ?? 'Has pets'} />}
                    </>
                  )}
                  {(app?.propertyAddress || lead.preferences) && <QChip icon={MapPin} label={app?.propertyAddress ?? lead.preferences ?? ''} />}
                </div>

                {/* Explanation tags */}
                {details?.explanationTags && details.explanationTags.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {details.explanationTags.slice(0, 5).map((tag) => (
                      <span key={tag} className={cn('inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5', tier.pill)}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Risk flags */}
                {riskFlags.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {riskFlags.slice(0, 3).map((flag) => (
                      <span key={flag} className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 bg-destructive/10 text-destructive">
                        <AlertTriangle size={9} />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Recommended action + follow-up row */}
                <div className="px-4 pb-4 border-t border-border/60 pt-3 flex items-center justify-between gap-3 flex-wrap">
                  {details?.recommendedNextAction ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0 flex-1">
                      <ArrowRight size={11} className="flex-shrink-0" />
                      <span className="truncate">{details.recommendedNextAction}</span>
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Follow-up date */}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer group/fu">
                      <CalendarDays size={11} className="text-muted-foreground" />
                      {lead.followUpAt ? (
                        <span className={cn(
                          'font-medium',
                          new Date(lead.followUpAt) < new Date() ? 'text-destructive' : 'text-foreground',
                        )}>
                          {formatFollowUpDate(lead.followUpAt)}
                        </span>
                      ) : (
                        <span className="group-hover/fu:text-foreground transition-colors">Follow-up</span>
                      )}
                      <input
                        type="date"
                        className="sr-only"
                        value={toDateInputValue(lead.followUpAt)}
                        onChange={(e) => patchLead(lead.id, { followUpAt: e.target.value || null })}
                      />
                    </label>
                    {/* Mark/unmark contacted */}
                    <button
                      type="button"
                      onClick={() => patchLead(lead.id, { lastContactedAt: lead.lastContactedAt ? null : new Date().toISOString() })}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 transition-colors',
                        lead.lastContactedAt
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                          : 'text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80',
                      )}
                      title={lead.lastContactedAt ? 'Undo contacted status' : 'Mark as contacted now'}
                    >
                      <CheckCircle2 size={11} />
                      {lead.lastContactedAt ? 'Contacted' : 'Mark contacted'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {!loading && view === 'list' && filtered.length > 0 && (
        <div className="rounded-lg border border-border/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Follow-up</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filtered.map((lead) => {
                  const isNew = newLeadIds.has(lead.id);
                  const app = lead.applicationData as ApplicationData | null;
                  const rawBudget = app?.monthlyRent ?? lead.budget;
                  const budgetDisplay = typeof rawBudget === 'string' ? rawBudget : rawBudget != null ? `${formatMoney(rawBudget)}/mo` : null;
                  const tierKey = getTierKey(lead);
                  const tier = TIERS[tierKey];
                  const score = lead.leadScore != null ? Math.round(lead.leadScore) : null;
                  const isSelected = selectedIds.has(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        'group hover:bg-muted/30 transition-colors',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-border cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/s/${slug}/leads/${lead.id}`} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(lead.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium hover:text-foreground transition-colors">{lead.name}</span>
                              <span className="text-[10px] font-medium rounded-md px-1.5 py-0.5 border border-border text-muted-foreground">
                                {lead.leadType === 'buyer' ? 'Buyer' : lead.leadType === 'seller' ? 'Seller' : 'Rental'}
                              </span>
                              {isNew && (
                                <span className="text-[10px] font-bold bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 rounded-md px-1.5 py-0.5">NEW</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1', tier.pill)}>
                          {score != null ? `${score} ·` : ''} {tier.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="space-y-0.5">
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]">
                              <Mail size={10} className="flex-shrink-0" />
                              {lead.email}
                            </a>
                          )}
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Phone size={10} className="flex-shrink-0" />
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {budgetDisplay ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {timeAgo(new Date(lead.createdAt))}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <CalendarDays size={10} className="text-muted-foreground" />
                          <span className={cn(
                            lead.followUpAt
                              ? new Date(lead.followUpAt) < new Date() ? 'text-destructive font-medium' : 'text-foreground font-medium'
                              : 'text-muted-foreground',
                          )}>
                            {lead.followUpAt ? formatFollowUpDate(lead.followUpAt) : '—'}
                          </span>
                          <input
                            type="date"
                            className="sr-only"
                            value={toDateInputValue(lead.followUpAt)}
                            onChange={(e) => patchLead(lead.id, { followUpAt: e.target.value || null })}
                          />
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConvertTarget(lead)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium"
                          >
                            <UserCheck size={12} />
                            Convert
                          </button>
                          <Link href={`/s/${slug}/leads/${lead.id}`} className="text-xs text-muted-foreground hover:text-foreground font-medium">
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto w-fit z-30 flex items-center gap-2 rounded-lg border border-border bg-card shadow-lg px-4 py-3">
          <CheckSquare size={14} className="text-foreground" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <button
            type="button"
            onClick={handleExportSelected}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Download size={12} />
            Export
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Convert dialog */}
      {convertTarget && (
        <ConvertLeadDialog
          open={!!convertTarget}
          onOpenChange={(o) => !o && setConvertTarget(null)}
          leadName={convertTarget.name}
          leadId={convertTarget.id}
          currentTags={convertTarget.tags}
          onConverted={handleConverted}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}
