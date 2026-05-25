'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Brain,
  MessageSquare,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { ImportanceDot } from './importance-dot';
import { ChippiAssessmentCard } from '@/components/agent/chippi-assessment-card';

interface AgentMemory {
  id: string;
  memoryType: 'fact' | 'observation';
  content: string;
  importance: number;
  createdAt: string;
}

interface AgentDraft {
  id: string;
  channel: 'sms' | 'email' | 'note';
  subject: string | null;
  content: string;
  reasoning: string | null;
  priority: number;
  status: 'pending' | 'approved';
  createdAt: string;
}

interface AgentActivity {
  id: string;
  agentType: string;
  action: string;
  outcome: string;
  summary: string | null;
  createdAt: string;
}

interface AgentContactData {
  contactId: string;
  memories: AgentMemory[];
  drafts: AgentDraft[];
  activity: AgentActivity[];
}

const CHANNEL_PILL: Record<string, string> = {
  sms: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  email: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  note: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};

const AGENT_LABELS: Record<string, string> = {
  lead_nurture: 'Lead Nurture',
  deal_sentinel: 'Deal Sentinel',
  long_term_nurture: 'Long-Term Nurture',
  lead_scorer: 'Lead Scorer',
};


function DraftCard({
  draft,
  onApprove,
  onDismiss,
}: {
  draft: AgentDraft;
  onApprove: (id: string, content: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<'approve' | 'dismiss' | null>(null);

  const isSms = draft.channel === 'sms';
  const overLimit = isSms && editedContent.length > 160;

  async function handleApprove() {
    if (overLimit) return;
    setLoading('approve');
    await navigator.clipboard.writeText(editedContent).catch(() => {});
    setCopied(true);
    await onApprove(draft.id, editedContent);
    setLoading(null);
  }

  async function handleDismiss() {
    setLoading('dismiss');
    await onDismiss(draft.id);
    setLoading(null);
  }

  return (
    <div className={cn(
      'rounded-lg border border-border/70 bg-card text-sm',
      draft.status === 'approved' && 'opacity-60',
    )}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide', CHANNEL_PILL[draft.channel] ?? 'bg-muted text-muted-foreground')}>
          {draft.channel}
        </span>
        {draft.subject && (
          <span className="text-xs text-muted-foreground truncate flex-1">{draft.subject}</span>
        )}
        <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo(draft.createdAt)}</span>
      </div>

      <div className="p-3 space-y-2">
        {editing ? (
          <textarea
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
            className="w-full text-sm bg-muted/40 border border-border rounded-md p-2 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        ) : (
          <p
            className="text-sm leading-relaxed cursor-text hover:bg-muted/30 rounded px-1 -mx-1 py-0.5 transition-colors"
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            {editedContent}
          </p>
        )}

        {isSms && (
          <div className={cn('text-xs text-right', overLimit ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {editedContent.length}/160{overLimit && ' — over SMS limit'}
          </div>
        )}

        {draft.reasoning && (
          <blockquote className="border-l-2 border-muted-foreground/20 pl-2 text-xs text-muted-foreground leading-relaxed">
            {draft.reasoning}
          </blockquote>
        )}
      </div>

      {draft.status === 'pending' && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
          <button
            onClick={() => setEditing(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {editing ? 'Done editing' : 'Edit'}
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={handleDismiss}
              disabled={!!loading}
              className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-md text-xs border border-border hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              {loading === 'dismiss' ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
              Dismiss
            </button>
            <button
              onClick={handleApprove}
              disabled={!!loading || overLimit}
              className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading === 'approve'
                ? <Loader2 size={11} className="animate-spin" />
                : copied
                  ? <Check size={11} />
                  : <Copy size={11} />}
              {copied ? 'Copied!' : 'Approve & Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentContactPanel({ contactId, slug, contactName }: { contactId: string; slug: string; contactName?: string }) {
  const [data, setData] = useState<AgentContactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [activeSection, setActiveSection] = useState<'drafts' | 'memories' | 'activity'>('drafts');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/contact/${contactId}`);
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail — panel is not critical path
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => { void load(); }, [load]);

  async function handleApprove(draftId: string, content: string) {
    await fetch(`/api/agent/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', content }),
    });
    setData(prev => prev ? {
      ...prev,
      drafts: prev.drafts.map(d => d.id === draftId ? { ...d, status: 'approved' as const } : d),
    } : prev);
  }

  async function handleDismiss(draftId: string) {
    await fetch(`/api/agent/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    setData(prev => prev ? {
      ...prev,
      drafts: prev.drafts.filter(d => d.id !== draftId),
    } : prev);
  }

  async function handleRequestAnalysis() {
    setTriggering(true);
    try {
      await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'new_lead', contactId }),
      });
      setTriggered(true);
      setTimeout(() => setTriggered(false), 4000);
    } finally {
      setTriggering(false);
    }
  }

  const pendingDrafts = data?.drafts.filter(d => d.status === 'pending') ?? [];
  const allDrafts = data?.drafts ?? [];
  const memories = data?.memories ?? [];
  const activity = data?.activity ?? [];

  if (loading) {
    return (
      <div className="space-y-3">
        <ChippiAssessmentCard entityType="contact" entityId={contactId} entityName={contactName ?? 'this contact'} slug={slug} />
        <div className="rounded-lg border border-border/70 bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={14} className="text-primary animate-pulse" />
            <span className="text-sm font-semibold">Agent Intelligence</span>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasContent = allDrafts.length > 0 || memories.length > 0 || activity.length > 0;

  return (
    <div className="space-y-3">
      <ChippiAssessmentCard entityType="contact" entityId={contactId} entityName={contactName ?? 'this contact'} slug={slug} />
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-primary" />
          <span className="text-sm font-semibold">Agent Intelligence</span>
          {pendingDrafts.length > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-semibold px-1.5 py-0.5 rounded-full">
              {pendingDrafts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/s/${slug}/chippi?q=${encodeURIComponent(`Tell me about ${contactName ?? 'this contact'} and suggest what I should do next`)}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/60 transition-colors"
          >
            <MessageCircle size={11} />
            Ask Chippi
          </Link>
          <button
            onClick={() => void load()}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => void handleRequestAnalysis()}
            disabled={triggering}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {triggering ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {triggered ? 'Queued!' : 'Analyse now'}
          </button>
        </div>
      </div>

      {!hasContent ? (
        <div className="px-4 py-8 text-center">
          <Brain size={28} className="text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No agent data yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Run the agent to start building context about this contact.</p>
        </div>
      ) : (
        <>
          {/* Section tabs */}
          <div className="flex border-b border-border text-xs">
            {([
              { key: 'drafts', label: 'Drafts', count: allDrafts.length, icon: MessageSquare },
              { key: 'memories', label: 'Memory', count: memories.length, icon: Brain },
              { key: 'activity', label: 'Activity', count: activity.length, icon: Activity },
            ] as const).map(({ key, label, count, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap',
                  activeSection === key
                    ? 'border-primary text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={11} />
                {label}
                {count > 0 && (
                  <span className={cn(
                    'text-xs px-1 rounded',
                    activeSection === key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2.5 max-h-[500px] overflow-y-auto">
            {/* Drafts section */}
            {activeSection === 'drafts' && (
              <>
                {allDrafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No drafts for this contact.</p>
                ) : (
                  allDrafts.map(draft => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      onApprove={handleApprove}
                      onDismiss={handleDismiss}
                    />
                  ))
                )}
              </>
            )}

            {/* Memories section */}
            {activeSection === 'memories' && (
              <>
                {memories.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No agent memories yet.</p>
                ) : (
                  memories.map(mem => (
                    <div key={mem.id} className="flex gap-2 items-start text-sm">
                      <ImportanceDot importance={mem.importance} />
                      <div className="flex-1 min-w-0">
                        <p className="leading-snug">{mem.content}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {mem.memoryType === 'fact' ? 'Fact' : 'Observation'} · {timeAgo(mem.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Activity section */}
            {activeSection === 'activity' && (
              <>
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No agent activity for this contact.</p>
                ) : (
                  activity.map(entry => (
                    <div key={entry.id} className="flex gap-2 items-start text-sm">
                      <span className={cn(
                        'mt-0.5 w-1.5 h-1.5 rounded-full shrink-0',
                        entry.outcome === 'success' ? 'bg-emerald-500' :
                        entry.outcome === 'error' ? 'bg-destructive' : 'bg-muted-foreground/40',
                      )} />
                      <div className="flex-1 min-w-0">
                        {entry.summary ? (
                          <p className="leading-snug">{entry.summary}</p>
                        ) : (
                          <p className="leading-snug text-muted-foreground">{entry.action}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {AGENT_LABELS[entry.agentType] ?? entry.agentType} · {timeAgo(entry.createdAt)}
                        </p>
                      </div>
                      {entry.outcome === 'success' && <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />}
                      {entry.outcome === 'error' && <XCircle size={12} className="text-destructive shrink-0 mt-0.5" />}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
    </div>
  );
}
