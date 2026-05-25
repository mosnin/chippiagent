'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactForm } from './contact-form';
import { LeadScoreBar } from '@/components/agent/lead-score-bar';
import { ContactAgentContext } from '@/components/agent/contact-agent-context';
import {
  Search,
  Trash2,
  Pencil,
  Phone,
  Mail,
  Wallet,
  MapPin,
  LayoutGrid,
  List,
  ArrowRight,
  Download,
  Upload,
  Bookmark,
  X,
  CheckSquare,
  GitCompare,
  CalendarDays,
  MoreHorizontal,
  Users,
  Inbox,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { BODY_MUTED, TITLE_FONT, QUIET_LINK, PRIMARY_PILL } from '@/lib/typography';

import { buildIntakeUrl } from '@/lib/intake';
import Link from 'next/link';
import { ApplicationCompare } from './application-compare';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';
import type { SavedView } from '@/lib/types';
import { formatCurrency as _formatCurrency, getInitials } from '@/lib/formatting';
import { CONTACT_STAGES } from '@/lib/constants';
import { CsvImportModal } from './csv-import-modal';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { motion } from 'framer-motion';

type Client = {
  id: string;
  name: string;
  type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  phone: string | null;
  email: string | null;
  budget: number | null;
  preferences: string | null;
  properties: string[];
  createdAt: string;
  address: string | null;
  notes: string | null;
  tags: string[];
  followUpAt: string | null;
  leadType: 'rental' | 'buyer';
  leadScore: number | null;
};

const STAGES = CONTACT_STAGES;

function formatCurrency(value: number | null) {
  if (value == null) return null;
  return _formatCurrency(value);
}

interface ContactTableProps {
  slug: string;
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard rejection */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy intake link'}
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors duration-150 active:scale-[0.98]',
        copied
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
      )}
    >
      {copied ? <Check size={12} strokeWidth={2.25} /> : <Copy size={12} strokeWidth={1.75} />}
    </button>
  );
}

export function ContactTable({ slug }: ContactTableProps) {
  const [contacts, setContacts] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'all' | 'new' | 'rental' | 'buyer'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-az' | 'name-za' | 'agent-priority'>('agent-priority');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'list'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Load saved views from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`saved-views-contacts-${slug}`);
      if (stored) setSavedViews(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [slug]);

  function persistSavedViews(views: SavedView[]) {
    setSavedViews(views);
    localStorage.setItem(`saved-views-contacts-${slug}`, JSON.stringify(views));
  }

  function handleSaveView() {
    if (!saveViewName.trim()) return;
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name: saveViewName.trim(),
      page: 'contacts',
      filters: { typeFilter },
    };
    persistSavedViews([...savedViews, newView]);
    setSaveViewName('');
    setShowSaveInput(false);
  }

  function applyView(view: SavedView) {
    const f = view.filters as { typeFilter?: string };
    if (f.typeFilter) setTypeFilter(f.typeFilter);
  }

  function deleteView(id: string) {
    persistSavedViews(savedViews.filter((v) => v.id !== id));
  }

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ slug, search, type: typeFilter });
      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) setContacts(await res.json());
    } catch (err) {
      console.error('[contact-table] fetchContacts failed:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, search, typeFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Clear selection when contacts change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [contacts]);

  // Escape to clear selection
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedIds(new Set());
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleAdd(data: any) {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, slug }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to add contact');
    }
    fetchContacts();
  }

  async function handleEdit(data: any) {
    if (!editContact) return;
    const res = await fetch(`/api/contacts/${editContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to update contact');
    }
    setEditContact(null);
    fetchContacts();
  }

  async function handleDelete(id: string) {
    const contact = contacts.find((c) => c.id === id);
    const confirmed = await confirm({
      title: 'Delete this client?',
      description: contact ? `"${contact.name}" will be gone. I can't bring them back.` : "This client will be gone. I can't bring them back.",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Contact deleted.');
      } else {
        toast.error("Couldn't delete that contact. Try again.");
      }
    } catch {
      toast.error("Couldn't delete that contact. Try again.");
    }
    fetchContacts();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleContacts.map((c) => c.id)));
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const confirmed = await confirm({
      title: `Delete ${ids.length} client${ids.length !== 1 ? 's' : ''}?`,
      description: "These will be gone. I can't bring them back.",
    });
    if (!confirmed) return;
    try {
      const results = await Promise.allSettled(ids.map((id) => fetch(`/api/contacts/${id}`, { method: 'DELETE' })));
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length === 0) {
        toast.success(`Deleted ${ids.length} contacts.`);
      } else if (failures.length === ids.length) {
        toast.error("Couldn't delete those contacts. Try again.");
      } else {
        toast.success(`Deleted ${ids.length - failures.length} contacts.`);
        toast.error(`${failures.length} got stuck. Try those again.`);
      }
    } catch {
      toast.error("Couldn't delete those contacts. Try again.");
    } finally {
      setSelectedIds(new Set());
      fetchContacts();
    }
  }

  async function handleBulkChangeType(newType: Client['type']) {
    const ids = [...selectedIds];
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/contacts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: newType }),
          }),
        ),
      );
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length > 0) {
        toast.error(`${failures.length} contact${failures.length !== 1 ? 's' : ''} got stuck. Try those again.`);
      }
    } catch {
      toast.error("Couldn't update those contacts. Try again.");
    } finally {
      setSelectedIds(new Set());
      fetchContacts();
    }
  }

  function handleExportSelected() {
    const toExport = visibleContacts.filter((c) => selectedIds.has(c.id));
    exportContactsCSV(toExport);
  }

  function handleExportAll() {
    exportContactsCSV(visibleContacts);
  }

  function exportContactsCSV(items: Client[]) {
    downloadCSV('contacts.csv', items.map((c) => ({
      Name: c.name,
      Stage: c.type,
      Phone: c.phone ?? '',
      Email: c.email ?? '',
      'Budget ($/mo)': c.budget ?? '',
      Address: c.address ?? '',
      Preferences: c.preferences ?? '',
      Notes: c.notes ?? '',
      Tags: c.tags.join('; '),
      'Follow-up': c.followUpAt ? new Date(c.followUpAt).toLocaleDateString('en-US') : '',
      'Added': new Date(c.createdAt).toLocaleDateString('en-US'),
    })));
  }

  // Stage totals for pipeline bar
  const stageCounts = {
    QUALIFICATION: contacts.filter((c) => c.type === 'QUALIFICATION').length,
    TOUR: contacts.filter((c) => c.type === 'TOUR').length,
    APPLICATION: contacts.filter((c) => c.type === 'APPLICATION').length,
  };

  // Unique user-defined tags (exclude system tags)
  const SYSTEM_TAGS = new Set(['application-link', 'new-lead']);
  const allTags = Array.from(
    new Set(contacts.flatMap((c) => c.tags.filter((t) => !SYSTEM_TAGS.has(t))))
  ).sort();

  // Apply tag + leadType filters and sorting client-side
  const visibleContacts = (() => {
    let list = contacts
      .filter((c) => {
        if (leadTypeFilter === 'all') return true;
        if (leadTypeFilter === 'new') return c.tags.includes('new-lead');
        return c.leadType === leadTypeFilter;
      })
      .filter((c) => !tagFilter || c.tags.includes(tagFilter));
    if (sortBy === 'agent-priority') {
      list = [...list].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    } else if (sortBy === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'newest') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'name-az') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-za') {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    }
    return list;
  })();

  const contactViews = savedViews.filter((v) => v.page === 'contacts');

  const leadTypeChips: { key: 'all' | 'new' | 'rental' | 'buyer'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: contacts.length },
    { key: 'new', label: 'New', count: contacts.filter((c) => c.tags.includes('new-lead')).length },
    { key: 'rental', label: 'Rental', count: contacts.filter((c) => c.leadType === 'rental').length },
    { key: 'buyer', label: 'Buyer', count: contacts.filter((c) => c.leadType === 'buyer').length },
  ];

  const sortLabels: Record<typeof sortBy, string> = {
    'agent-priority': 'Smart',
    newest: 'Recently added',
    oldest: 'Oldest first',
    'name-az': 'Name A–Z',
    'name-za': 'Name Z–A',
  };

  const stageLabels: Record<string, string> = {
    ALL: 'All stages',
    QUALIFICATION: 'Qualifying',
    TOUR: 'Tour',
    APPLICATION: 'Applied',
  };

  const fullIntakeUrl = buildIntakeUrl(slug);
  const intakeUrlWithoutProtocol = fullIntakeUrl.replace(/^https?:\/\//, '');

  return (
    <div className="space-y-4">
      {/* Page header — H1 + primary CTA cluster. The voice lives on /chippi
          home; this surface is utility chrome — search, filters, list. */}
      <header className="mb-6 space-y-2">
        <div className="flex items-end justify-between gap-4">
          <h1
            className="text-3xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            People
          </h1>
          <div className="flex flex-col items-end gap-1">
            {/* The conversation is the front door. Saying it out loud is
                faster than any form, so it gets the primary pill. */}
            <Link
              href={`/s/${slug}/chippi?prefill=${encodeURIComponent("I'm adding a new person — ")}`}
              className={PRIMARY_PILL}
            >
              Tell Chippi →
            </Link>
            {/* The form still exists for those who want it; offered quietly. */}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className={QUIET_LINK}
            >
              or fill out the form
            </button>
          </div>
        </div>
      </header>

      {/* Filter chip row + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Lead type chips (with New folded in) */}
        <div className="flex items-center gap-1">
          {leadTypeChips.map((chip) => {
            const active = leadTypeFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setLeadTypeFilter(chip.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 h-8 sm:h-7 text-xs font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                )}
              >
                {chip.label}
                <span className={cn('tabular-nums text-[11px]', active ? 'opacity-70' : 'opacity-60')}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Toolbar — pushes right */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 sm:flex-initial min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              className="pl-9 h-9 w-full sm:w-56 bg-background border-border/70"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <span className="text-muted-foreground">Sort:</span>
                {sortLabels[sortBy]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(Object.keys(sortLabels) as (keyof typeof sortLabels)[]).map((key) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => setSortBy(key)}
                  className={cn(sortBy === key && 'font-semibold')}
                >
                  {sortLabels[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Stage filter — keep as dedicated dropdown (commonly used) */}
          {(view === 'list' || search) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <span className="text-muted-foreground">Stage:</span>
                  {stageLabels[typeFilter] ?? 'All stages'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {(['ALL', 'QUALIFICATION', 'TOUR', 'APPLICATION'] as const).map((key) => (
                  <DropdownMenuItem
                    key={key}
                    onSelect={() => setTypeFilter(key)}
                    className={cn(typeFilter === key && 'font-semibold')}
                  >
                    {stageLabels[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* View toggle */}
          <div className="flex rounded-md border border-border/70 overflow-hidden bg-background flex-shrink-0">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="List view"
              className={cn(
                'h-9 w-9 flex items-center justify-center transition-colors',
                view === 'list'
                  ? 'bg-foreground/[0.045] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
              )}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('card')}
              aria-label="Grid view"
              className={cn(
                'h-9 w-9 flex items-center justify-center transition-colors',
                view === 'card'
                  ? 'bg-foreground/[0.045] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
              )}
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {/* Overflow */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More options"
                className="h-9 w-9 flex items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setShowSaveInput(true)}>
                <Bookmark size={12} />
                Save view
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <Upload size={12} />
                Import
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleExportAll()}
                disabled={contacts.length === 0}
              >
                <Download size={12} />
                Export
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Save view inline input */}
      {showSaveInput && (
        <div className="flex items-center gap-1.5">
          <input
            ref={saveInputRef}
            type="text"
            value={saveViewName}
            onChange={(e) => setSaveViewName(e.target.value)}
            placeholder="Name this view…"
            className="text-xs rounded-md border border-border/70 bg-background px-2.5 h-8 w-44 focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveView();
              if (e.key === 'Escape') setShowSaveInput(false);
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveView}
            className="h-8 px-3 rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setShowSaveInput(false)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Saved view chips — paper-flat */}
      {contactViews.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Saved:</span>
          {contactViews.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-full pl-2.5 pr-1 h-6 border border-border/70 bg-background"
            >
              <button
                type="button"
                onClick={() => applyView(v)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(v.id)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tag filter strip — paper-flat */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter('')}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 h-8 sm:h-6 bg-foreground text-background"
            >
              <X size={10} />
              Clear tag
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={cn(
                'inline-flex items-center text-xs font-medium rounded-full px-2.5 h-8 sm:h-6 transition-colors',
                tagFilter === tag
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground border border-border/70 bg-background',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Stage breakdown — pipeline reading line */}
      {!loading && contacts.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-4 py-3">
          {STAGES.map((stage, i) => {
            const count = stageCounts[stage.key];
            return (
              <div key={stage.key} className="flex items-center gap-3">
                {i > 0 && (
                  <ArrowRight size={13} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                  <span
                    className="text-lg tabular-nums text-foreground leading-none"
                    style={{ fontFamily: 'var(--font-title)' }}
                  >
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="ml-auto text-xs text-muted-foreground">
            {tagFilter ? `${visibleContacts.length} of ` : ''}
            <span
              className="text-base tabular-nums text-foreground"
              style={{ fontFamily: 'var(--font-title)' }}
            >
              {contacts.length}
            </span>{' '}
            total
          </div>
        </div>
      )}

      {/* Loading skeleton — matches final full-width row layout */}
      {loading && (
        <div className="rounded-lg border border-border overflow-hidden bg-card divide-y divide-border">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 h-[56px]">
              <Skeleton className="h-4 w-4 rounded-sm flex-shrink-0" />
              <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
              <Skeleton className="h-3.5 w-32 sm:w-40 flex-shrink-0" />
              <Skeleton className="h-5 w-16 rounded-full hidden sm:block flex-shrink-0" />
              <Skeleton className="h-3 flex-1 max-w-[220px] hidden sm:block" />
              <Skeleton className="h-3 w-16 hidden md:block flex-shrink-0" />
              <Skeleton className="h-3 w-28 hidden lg:block flex-shrink-0" />
              <Skeleton className="ml-auto h-3 w-12 hidden xl:block flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state — context-aware */}
      {!loading && visibleContacts.length === 0 && (() => {
        const hasStageFilter = typeFilter !== 'ALL';
        const hasLeadTypeFilter = leadTypeFilter !== 'all';
        const hasTagFilter = !!tagFilter;
        const hasAnyFilter = hasStageFilter || hasLeadTypeFilter || hasTagFilter;
        const isSearchOrFilterCase = !!search || hasTagFilter;
        const isFreshWorkspace = !search && !hasAnyFilter && contacts.length === 0;
        const clearAllFilters = () => {
          setTypeFilter('ALL');
          setLeadTypeFilter('all');
          setTagFilter('');
        };

        if (isFreshWorkspace) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-5">
                <Users size={22} className="text-muted-foreground/60" strokeWidth={1.5} />
              </div>
              <h2
                className="text-3xl tracking-tight text-foreground mb-2"
                style={TITLE_FONT}
              >
                Welcome. Let&apos;s get your first lead.
              </h2>
              <p className={cn(BODY_MUTED, 'max-w-md mb-6')}>
                Share this link with anyone interested. New leads land here automatically.
              </p>
              <div className="w-full max-w-md flex items-center gap-2 rounded-lg border border-border/70 bg-foreground/[0.04] p-3">
                <code className="flex-1 truncate text-left font-mono text-sm text-foreground">
                  {intakeUrlWithoutProtocol}
                </code>
                <CopyButton url={fullIntakeUrl} />
                <Link
                  href={`/apply/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Preview intake page"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <ExternalLink size={12} strokeWidth={1.75} />
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className={cn(QUIET_LINK, 'mt-5 underline-offset-2 hover:underline')}
              >
                Or add someone manually
              </button>
            </div>
          );
        }

        if (isSearchOrFilterCase) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
                <Search size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
              </div>
              <p className="text-xl tracking-tight font-semibold text-foreground mb-1">
                No matches.
              </p>
              <p className="text-sm text-muted-foreground">
                Try a shorter query or clear filters.
              </p>
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>
          );
        }

        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
              <Inbox size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
            </div>
            <p className="text-xl tracking-tight font-semibold text-foreground mb-1">
              Nothing in this view.
            </p>
            <p className="text-sm text-muted-foreground">
              Adjust the current filters to see more.
            </p>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Card view — stage-grouped ── */}
      {!loading && visibleContacts.length > 0 && view === 'card' && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STAGES.map((stage) => {
            const stageContacts = visibleContacts.filter((c) => c.type === stage.key);
            if (stageContacts.length === 0 && !search && !tagFilter) return (
              <div key={stage.key} className={cn('rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[120px] text-center gap-2', stage.border)}>
                <span className={cn('w-2 h-2 rounded-full', stage.dotColor)} />
                <p className="text-xs font-semibold text-muted-foreground">{stage.label}</p>
                <p className="text-[11px] text-muted-foreground/60">{stage.description}</p>
              </div>
            );
            if (stageContacts.length === 0) return null;
            return (
              <div key={stage.key} className="flex flex-col gap-2">
                {/* Stage column header */}
                <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', stage.headerBg)}>
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', stage.dotColor)} />
                  <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                  <span className={cn('ml-auto text-[11px] font-semibold rounded-md px-1.5 py-0.5', stage.className)}>
                    {stageContacts.length}
                  </span>
                </div>

                {/* Cards in this stage */}
                {stageContacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    slug={slug}
                    onEdit={() => setEditContact(contact)}
                    onDelete={() => handleDelete(contact.id)}
                    stageClassName={stage.className}
                    selected={selectedIds.has(contact.id)}
                    onToggleSelect={() => toggleSelect(contact.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {!loading && visibleContacts.length > 0 && view === 'list' && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === visibleContacts.length && visibleContacts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Stage</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Budget</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Preferences</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Follow-up</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {visibleContacts.map((contact, idx) => {
                  const stage = STAGES.find((s) => s.key === contact.type)!;
                  const isSelected = selectedIds.has(contact.id);
                  // Cap stagger to first 10 rows — past that, no entrance.
                  const delay = idx < 10 ? idx * 0.04 : 0;
                  return (
                    <motion.tr
                      key={contact.id}
                      initial={idx < 10 ? { opacity: 0, y: 4 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay }}
                      className={cn(
                        'group hover:bg-muted/30 hover:scale-[1.005] transition-[colors,transform] duration-150',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(contact.id)}
                          className="rounded border-border cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(contact.name)}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/s/${slug}/contacts/${contact.id}`} className="font-medium hover:text-foreground transition-colors block">
                              {contact.name}
                            </Link>
                            <LeadScoreBar score={contact.leadScore ?? null} />
                            <ContactAgentContext contactId={contact.id} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5', stage.className)}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="space-y-0.5">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]">
                              <Mail size={10} className="flex-shrink-0" />
                              {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Phone size={10} className="flex-shrink-0" />
                              {contact.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {contact.budget != null ? `${formatCurrency(contact.budget)}/mo` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {contact.preferences ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {contact.followUpAt ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5',
                            new Date(contact.followUpAt) < new Date()
                              ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                          )}>
                            <CalendarDays size={10} />
                            {new Date(contact.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button type="button" onClick={() => setEditContact(contact)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => handleDelete(contact.id)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto w-fit z-30 flex items-center flex-wrap gap-2 rounded-lg border border-border bg-card shadow-lg px-3 sm:px-4 py-2 sm:py-3 max-w-[calc(100vw-2rem)]">
          <CheckSquare size={14} className="text-foreground" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Select onValueChange={(v) => handleBulkChangeType(v as Client['type'])}>
            <SelectTrigger className="h-8 text-xs w-36 bg-muted border-0">
              <SelectValue placeholder="Move to stage…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="QUALIFICATION">Qualifying</SelectItem>
              <SelectItem value="TOUR">Tour</SelectItem>
              <SelectItem value="APPLICATION">Applied</SelectItem>
            </SelectContent>
          </Select>
          {selectedIds.size >= 2 && (
            <Button size="sm" variant="outline" onClick={() => setShowCompare(true)} className="h-8 gap-1.5 text-xs hidden sm:inline-flex">
              <GitCompare size={12} />
              Compare
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExportSelected} className="h-8 gap-1.5 text-xs">
            <Download size={12} />
            Export
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="h-8 text-xs">
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {showCompare && selectedIds.size >= 2 && (
        <ApplicationCompare
          slug={slug}
          selectedIds={[...selectedIds]}
          onClose={() => setShowCompare(false)}
        />
      )}
      <ContactForm open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} mode="add" slug={slug} />
      <ContactForm
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
        onSubmit={handleEdit}
        mode="edit"
        defaultValues={
          editContact
            ? {
                name: editContact.name,
                email: editContact.email ?? '',
                phone: editContact.phone ?? '',
                budget: editContact.budget?.toString() ?? '',
                preferences: editContact.preferences ?? '',
                properties: editContact.properties.join(', '),
                address: editContact.address ?? '',
                notes: editContact.notes ?? '',
                type: editContact.type,
                tags: editContact.tags.join(', '),
              }
            : undefined
        }
      />

      {importOpen && (
        <CsvImportModal
          slug={slug}
          onClose={() => setImportOpen(false)}
          onImported={(count) => {
            setImportOpen(false);
            if (count > 0) {
              toast.success('Contacts imported.');
              fetchContacts();
            }
          }}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

// ── Contact card sub-component ────────────────────────────────────────────────

function ContactCard({
  contact,
  slug,
  onEdit,
  onDelete,
  stageClassName,
  selected,
  onToggleSelect,
}: {
  contact: Client;
  slug: string;
  onEdit: () => void;
  onDelete: () => void;
  stageClassName: string;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div className={cn(
      'group rounded-lg border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px',
      selected ? 'border-primary/40 bg-primary/5' : 'border-border',
    )}>
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-border cursor-pointer flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity data-[checked=true]:opacity-100"
              data-checked={selected}
            />
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
              {getInitials(contact.name)}
            </div>
            <div className="min-w-0">
              <Link
                href={`/s/${slug}/contacts/${contact.id}`}
                className="font-semibold text-sm hover:text-foreground transition-colors truncate block leading-tight"
              >
                {contact.name}
              </Link>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button type="button" onClick={onEdit} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Pencil size={12} />
            </button>
            <button type="button" onClick={onDelete} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-1">
          {contact.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone size={10} className="flex-shrink-0" />
              <a href={`tel:${contact.phone}`} className="truncate hover:text-foreground transition-colors">
                {contact.phone}
              </a>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail size={10} className="flex-shrink-0" />
              <a href={`mailto:${contact.email}`} className="truncate hover:text-foreground transition-colors">
                {contact.email}
              </a>
            </div>
          )}
          {contact.budget != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet size={10} className="flex-shrink-0" />
              <span>{formatCurrency(contact.budget)}/mo</span>
            </div>
          )}
          {contact.preferences && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin size={10} className="flex-shrink-0" />
              <span className="truncate">{contact.preferences}</span>
            </div>
          )}
          {contact.followUpAt && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              new Date(contact.followUpAt) < new Date() ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            )}>
              <CalendarDays size={10} className="flex-shrink-0" />
              <span>
                {new Date(contact.followUpAt) < new Date() ? 'Overdue' : 'Due'}{' '}
                {new Date(contact.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
