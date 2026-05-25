'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Search,
  UserPlus,
  UserMinus,
  Check,
  PhoneIncoming,
  Users,
  CalendarClock,
  Handshake,
  ArrowRight,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Home,
  Key,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatCompact } from '@/lib/formatting';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  budget: number | null;
  scoreLabel: string | null;
  leadScore: number | null;
  leadType: 'rental' | 'buyer' | null;
  moveTiming: string | null;
  createdAt: string;
  assignedTo: string | null;
  assignedAt: string | null;
}

export interface AssignedLeadProgress {
  realtorName: string;
  assignedAt: string;
  assignedContactId: string;
  assignedSpaceId: string;
  currentStage: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  currentScore: number | null;
  currentScoreLabel: string | null;
  lastActivityAt: string | null;
  hasFollowUp: boolean;
  followUpAt: string | null;
  hasDeal: boolean;
}

export interface RealtorOption {
  userId: string;
  name: string | null;
  email: string;
  spaceId: string | null;
  leadCount: number;
}

interface Props {
  unassignedLeads: LeadRow[];
  assignedLeads: LeadRow[];
  realtors: RealtorOption[];
  assignedLeadProgress?: Record<string, AssignedLeadProgress>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreBadge(label: string | null) {
  if (!label) return null;
  const l = label.toLowerCase();
  let className = 'bg-muted text-muted-foreground';
  if (l === 'hot') className = 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
  if (l === 'warm') className = 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
  if (l === 'cold') className = 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
  return (
    <Badge variant="secondary" className={className}>
      {label}
    </Badge>
  );
}

function leadTypeBadge(leadType: 'rental' | 'buyer' | null) {
  if (leadType === 'buyer') {
    return (
      <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
        <Key size={10} className="mr-1" />
        Buyer
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400">
      <Home size={10} className="mr-1" />
      Rental
    </Badge>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(name: string | null, email: string | null) {
  const str = name || email || '?';
  return str
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function relativeTime(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function stageBadge(stage: AssignedLeadProgress['currentStage']) {
  const styles: Record<string, string> = {
    QUALIFICATION: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    TOUR: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    APPLICATION: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  };
  const labels: Record<string, string> = {
    QUALIFICATION: 'Qualification',
    TOUR: 'Tour',
    APPLICATION: 'Application',
  };
  return (
    <Badge variant="secondary" className={styles[stage] ?? 'bg-muted text-muted-foreground'}>
      {labels[stage] ?? stage}
    </Badge>
  );
}

function stageProgress(stage: AssignedLeadProgress['currentStage']) {
  const stages = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
  const idx = stages.indexOf(stage);
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${
              i <= idx ? 'bg-primary' : 'bg-muted-foreground/20'
            }`}
          />
          {i < stages.length - 1 && (
            <div className={`w-3 h-px ${i < idx ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Realtor picker popover ────────────────────────────────────────────────────

function RealtorPicker({
  realtors,
  onSelect,
  disabled,
}: {
  realtors: RealtorOption[];
  onSelect: (r: RealtorOption) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return realtors;
    const q = search.toLowerCase();
    return realtors.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [realtors, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <UserPlus size={13} />
          Assign
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
            <Search size={13} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Find a realtor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground text-center">No realtors match.</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.userId}
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-semibold flex-shrink-0">
                  {initials(r.name, r.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name ?? r.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {r.leadCount}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Lead notes ────────────────────────────────────────────────────────────────

function LeadNotes({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadNotes = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch(`/api/broker/lead-note?contactId=${contactId}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? '');
      }
    } catch {
      // Silently fail
    } finally {
      setLoaded(true);
    }
  }, [contactId, loaded]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function handleAddNote(noteText: string) {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/broker/lead-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, note: noteText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "We couldn't save that note.");
      }
      const data = await res.json();
      setNotes(data.updatedNotes);
      if (textareaRef.current) textareaRef.current.value = '';
      toast.success('Note saved.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "We couldn't save that note.");
    } finally {
      setSaving(false);
    }
  }

  const noteEntries = notes.split(/\n\n/).filter((n) => n.trim()).slice(0, 10);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          placeholder="Add a note…"
          rows={2}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs resize-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAddNote(e.currentTarget.value);
            }
          }}
        />
        <button
          disabled={saving}
          onClick={() => {
            if (textareaRef.current) handleAddNote(textareaRef.current.value);
          }}
          className="self-end px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">⌘+Enter to save</p>

      {noteEntries.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {noteEntries.map((entry, i) => (
            <div
              key={i}
              className="text-xs text-muted-foreground bg-muted/40 rounded px-2.5 py-1.5 whitespace-pre-wrap"
            >
              {entry}
            </div>
          ))}
        </div>
      )}
      {loaded && noteEntries.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 italic">No notes yet.</p>
      )}
    </div>
  );
}

// ── Unassigned row ────────────────────────────────────────────────────────────

function UnassignedRow({
  lead,
  realtors,
  onAssigned,
  onDeleted,
}: {
  lead: LeadRow;
  realtors: RealtorOption[];
  onAssigned: (leadId: string, realtor: RealtorOption) => void;
  onDeleted: (leadId: string) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("We couldn't delete that lead.");
      toast.success('Lead deleted.');
      onDeleted(lead.id);
    } catch {
      toast.error("We couldn't delete that lead.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleAssign(realtor: RealtorOption) {
    setAssigning(true);
    try {
      const res = await fetch('/api/broker/assign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id, realtorUserId: realtor.userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "We couldn't assign that lead.");
      }
      toast.success(`Routed to ${realtor.name ?? realtor.email}.`);
      onAssigned(lead.id, realtor);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "We couldn't assign that lead.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
          {initials(lead.name, lead.email)}
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{lead.name || 'Unnamed'}</p>
            {leadTypeBadge(lead.leadType)}
            {scoreBadge(lead.scoreLabel)}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {lead.email && <span>{lead.email}</span>}
            {lead.phone && <span>{lead.phone}</span>}
            {lead.budget != null && <span>{formatCompact(lead.budget)} budget</span>}
            <span>{relativeTime(lead.createdAt)}</span>
          </div>
        </div>

        <button
          onClick={() => setShowNotes(!showNotes)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
          title="Notes"
        >
          <MessageSquare size={13} />
          {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        <RealtorPicker realtors={realtors} onSelect={(r) => handleAssign(r)} disabled={assigning} />

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-1 text-[10px] font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? '…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 text-[10px] font-medium rounded border border-border hover:bg-muted"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Delete lead"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {showNotes && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <LeadNotes contactId={lead.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assigned row ──────────────────────────────────────────────────────────────

function AssignedRow({
  lead,
  progress,
  onUnassigned,
}: {
  lead: LeadRow;
  progress?: AssignedLeadProgress;
  onUnassigned?: (leadId: string, realtorName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const realtorName = progress?.realtorName ?? lead.assignedTo ?? 'this realtor';

  async function handleUnassign() {
    setUnassigning(true);
    try {
      const res = await fetch('/api/broker/unassign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "We couldn't unassign that lead.");
      }
      toast.success(`Pulled back from ${realtorName}.`);
      setConfirmOpen(false);
      onUnassigned?.(lead.id, realtorName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "We couldn't unassign that lead.");
    } finally {
      setUnassigning(false);
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => progress && setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
          {initials(lead.name, lead.email)}
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{lead.name || 'Unnamed'}</p>
            {leadTypeBadge(lead.leadType)}
            {progress ? stageBadge(progress.currentStage) : scoreBadge(lead.scoreLabel)}
            {progress?.hasDeal && (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
              >
                <Handshake size={10} className="mr-1" />
                Deal
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {(progress?.realtorName ?? lead.assignedTo) && (
              <span className="inline-flex items-center gap-1">
                <Check size={10} className="text-green-600" />
                {progress?.realtorName ?? lead.assignedTo}
              </span>
            )}
            {progress && stageProgress(progress.currentStage)}
            {progress?.lastActivityAt && (
              <span className="inline-flex items-center gap-1">
                <Clock size={10} />
                {relativeTime(progress.lastActivityAt)}
              </span>
            )}
            {progress?.hasFollowUp && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CalendarClock size={10} />
                Follow-up set
              </span>
            )}
            {!progress && lead.assignedAt && <span>Assigned {formatDate(lead.assignedAt)}</span>}
          </div>
        </div>

        {!progress && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNotes(!showNotes);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Notes"
          >
            <MessageSquare size={13} />
            {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          disabled={unassigning}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 hover:border-red-300 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title="Pull back"
        >
          <UserMinus size={12} />
          <span className="hidden sm:inline">Pull back</span>
        </button>

        {progress && (
          <ArrowRight
            size={14}
            className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pull this lead back?</DialogTitle>
            <DialogDescription>
              {lead.name || 'This lead'} will be removed from {realtorName}&rsquo;s CRM and returned to the unassigned queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={unassigning}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUnassign}
              disabled={unassigning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {unassigning ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
              Pull back
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {expanded && progress && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Realtor</p>
                <p className="font-medium">{progress.realtorName}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Stage</p>
                <p className="font-medium">
                  {progress.currentStage.charAt(0) + progress.currentStage.slice(1).toLowerCase()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Score</p>
                <p className="font-medium">
                  {progress.currentScore != null ? progress.currentScore : '—'}
                  {progress.currentScoreLabel && (
                    <span className="ml-1 text-muted-foreground">({progress.currentScoreLabel})</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Assigned</p>
                <p className="font-medium">{formatDate(progress.assignedAt)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Last activity</p>
                <p className="font-medium">
                  {progress.lastActivityAt ? relativeTime(progress.lastActivityAt) : 'Nothing yet'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Follow-up</p>
                <p className="font-medium">
                  {progress.followUpAt ? formatDate(progress.followUpAt) : 'None scheduled'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Deal</p>
                <p className="font-medium">{progress.hasDeal ? 'Open' : 'None'}</p>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotes(!showNotes);
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <MessageSquare size={12} />
                Notes
                {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showNotes && <LeadNotes contactId={lead.id} />}
            </div>
          </div>
        </div>
      )}

      {showNotes && !progress && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <LeadNotes contactId={lead.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BrokerLeadsClient({
  unassignedLeads,
  assignedLeads,
  realtors,
  assignedLeadProgress = {},
}: Props) {
  const [unassigned, setUnassigned] = useState(unassignedLeads);
  const [assigned, setAssigned] = useState(assignedLeads);
  const [tab, setTab] = useState(unassignedLeads.length > 0 ? 'unassigned' : 'assigned');
  const [search, setSearch] = useState('');

  const applySearch = useCallback(
    (list: LeadRow[]) => {
      const q = search.trim().toLowerCase();
      if (!q) return list;
      return list.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q),
      );
    },
    [search],
  );

  const filteredUnassigned = useMemo(() => applySearch(unassigned), [unassigned, applySearch]);
  const filteredAssigned = useMemo(() => applySearch(assigned), [assigned, applySearch]);

  function handleAssigned(leadId: string, realtor: RealtorOption) {
    const lead = unassigned.find((l) => l.id === leadId);
    if (!lead) return;
    setUnassigned((prev) => prev.filter((l) => l.id !== leadId));
    setAssigned((prev) => [
      {
        ...lead,
        assignedTo: realtor.name ?? realtor.email,
        assignedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setTab('assigned');
  }

  function handleUnassigned(leadId: string) {
    const lead = assigned.find((l) => l.id === leadId);
    if (!lead) return;
    setAssigned((prev) => prev.filter((l) => l.id !== leadId));
    setUnassigned((prev) => [
      { ...lead, assignedTo: null, assignedAt: null },
      ...prev,
    ]);
    setTab('unassigned');
  }

  return (
    <div className="space-y-4">
      {/* Search — the only chrome. View toggles, sort dropdown, lead type filter,
          score pills, and "Add Lead" button all cut. Brokers don't manually add
          leads; intake forms do. */}
      <div className="relative w-full sm:w-80">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="unassigned" className="gap-1.5">
            <PhoneIncoming size={14} />
            Unassigned
            {filteredUnassigned.length > 0 && (
              <span className="ml-1 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold tabular-nums">
                {filteredUnassigned.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="assigned" className="gap-1.5">
            <Users size={14} />
            Assigned
            {filteredAssigned.length > 0 && (
              <span className="ml-1 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold tabular-nums">
                {filteredAssigned.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unassigned">
          {filteredUnassigned.length === 0 ? (
            <Card>
              <CardContent className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {search.trim() ? 'No matches.' : 'Inbox empty. Every lead is on someone’s plate.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {filteredUnassigned.map((lead) => (
                  <UnassignedRow
                    key={lead.id}
                    lead={lead}
                    realtors={realtors}
                    onAssigned={handleAssigned}
                    onDeleted={(id) => setUnassigned((prev) => prev.filter((l) => l.id !== id))}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assigned">
          {filteredAssigned.length === 0 ? (
            <Card>
              <CardContent className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {search.trim() ? 'No matches.' : 'Nothing routed yet.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {filteredAssigned.map((lead) => (
                  <AssignedRow
                    key={lead.id}
                    lead={lead}
                    progress={assignedLeadProgress[lead.id]}
                    onUnassigned={handleUnassigned}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
