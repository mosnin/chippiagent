'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  MessageSquare, Mail, StickyNote, RefreshCw, Paperclip,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { SECTION_LABEL, BODY, BODY_MUTED, CAPTION, META } from '@/lib/typography';

/**
 * Drafts log — what Chippi already tried to send.
 *
 * `sent` is a successful delivery. The table still stores a delivery miss
 * as `approved` (legacy column). This UI never fetches `pending` and never
 * PATCHes a draft, so it cannot gate a send.
 */
export type DraftLogStatus = 'sent' | 'approved';
export type DraftLogOutcome = 'sent' | 'failed';

export const DRAFT_LOG_FETCH_STATUSES: readonly DraftLogStatus[] = ['sent', 'approved'];

export const DRAFTS_PAGE_COPY = {
  title: 'Drafts',
  subtitle: 'What Chippi sent. Failed ones stay on the list.',
} as const;

export const DRAFTS_INBOX_COPY = {
  sectionTitle: 'What I sent',
  emptyHeadline: 'Nothing sent yet.',
  emptyNext: 'When Chippi sends outreach, it shows up here.',
} as const;

interface DraftContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface AgentDraft {
  id: string;
  contactId: string | null;
  dealId: string | null;
  channel: 'sms' | 'email' | 'note';
  subject: string | null;
  content: string;
  reasoning: string | null;
  priority: number;
  confidence: number | null;
  status: 'pending' | 'approved' | 'dismissed' | 'sent';
  createdAt: string;
  updatedAt?: string;
  expiresAt: string | null;
  Contact: DraftContact | null;
}

interface Props {
  slug: string;
}

const CHANNEL_META = {
  sms:   { label: 'SMS',   icon: MessageSquare },
  email: { label: 'Email', icon: Mail },
  note:  { label: 'Note',  icon: StickyNote },
} as const;

/** This surface is a log. It cannot hold a send for a human. */
export function draftInboxCanGateSend(): false {
  return false;
}

export function draftLogOutcome(status: string): DraftLogOutcome {
  return status === 'sent' ? 'sent' : 'failed';
}

export function draftLogLabel(status: string): 'Sent' | 'Failed' {
  return draftLogOutcome(status) === 'sent' ? 'Sent' : 'Failed';
}

export function isDraftLogRow(draft: Pick<AgentDraft, 'status'>): boolean {
  return draft.status === 'sent' || draft.status === 'approved';
}

export function mergeDraftLog(lists: AgentDraft[][]): AgentDraft[] {
  const byId = new Map<string, AgentDraft>();
  for (const list of lists) {
    for (const draft of list) {
      if (!isDraftLogRow(draft)) continue;
      byId.set(draft.id, draft);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const aAt = Date.parse(a.updatedAt ?? a.createdAt);
    const bAt = Date.parse(b.updatedAt ?? b.createdAt);
    return bAt - aAt;
  });
}

export function draftLogFetchUrls(limit = 50): string[] {
  return DRAFT_LOG_FETCH_STATUSES.map(
    (status) => `/api/agent/drafts?status=${status}&limit=${limit}`,
  );
}

function DraftRow({
  draft,
  slug,
}: {
  draft: AgentDraft;
  slug: string;
}) {
  const meta = CHANNEL_META[draft.channel];
  const Icon = meta.icon;
  const hasPacket = /\/packet\/[a-zA-Z0-9_-]+/i.test(draft.content);
  const outcome = draftLogOutcome(draft.status);
  const stamp = draft.updatedAt ?? draft.createdAt;

  return (
    <article className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 text-sm">
        {draft.Contact ? (
          <Link
            href={`/s/${slug}/contacts/${draft.Contact.id}`}
            className="font-medium text-foreground hover:underline underline-offset-2 truncate"
          >
            {draft.Contact.name}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">Unknown contact</span>
        )}

        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon size={12} className="opacity-70" />
          {meta.label}
        </span>

        {hasPacket && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400"
            title="Packet attached"
          >
            <Paperclip size={11} className="opacity-80" />
            Packet
          </span>
        )}

        <span
          className={cn(
            'inline-flex text-xs font-medium rounded-full px-2.5 py-0.5',
            outcome === 'sent'
              ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
              : 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
          )}
        >
          {draftLogLabel(draft.status)}
        </span>

        <span className={cn(META, 'ml-auto flex-shrink-0')}>
          {timeAgo(stamp)}
        </span>
      </div>

      {draft.subject && (
        <p className={cn(BODY, 'mt-2 font-medium')}>{draft.subject}</p>
      )}

      <p className={cn(BODY, 'mt-2 leading-relaxed text-foreground/90 whitespace-pre-wrap')}>
        {draft.content}
      </p>

      {draft.reasoning && (
        <p className={cn(CAPTION, 'mt-2.5 leading-relaxed italic')}>
          {draft.reasoning}
        </p>
      )}
    </article>
  );
}

export function AgentDraftInbox({ slug }: Props) {
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const responses = await Promise.all(
        draftLogFetchUrls(50).map((url) => fetch(url)),
      );
      const lists: AgentDraft[][] = [];
      for (const res of responses) {
        if (!res.ok) continue;
        const data: unknown = await res.json();
        if (Array.isArray(data)) lists.push(data as AgentDraft[]);
      }
      setDrafts(mergeDraftLog(lists));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className={SECTION_LABEL}>
          {DRAFTS_INBOX_COPY.sectionTitle}
        </h2>
        {!loading && drafts.length > 0 && (
          <span className={cn(META)}>
            {drafts.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={load}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Refresh"
            aria-label="Refresh drafts"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-4 pt-5">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-2">
              <div className="h-4 w-48 rounded bg-muted/50 animate-pulse" />
              <div className="h-12 w-full rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && drafts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className={BODY}>{DRAFTS_INBOX_COPY.emptyHeadline}</p>
          <p className={cn(BODY_MUTED, 'text-xs mt-1')}>{DRAFTS_INBOX_COPY.emptyNext}</p>
        </div>
      )}

      {!loading && drafts.length > 0 && (
        <StaggerList className="divide-y divide-border/60">
          {drafts.map((draft) => (
            <StaggerItem key={draft.id}>
              <DraftRow draft={draft} slug={slug} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </section>
  );
}
