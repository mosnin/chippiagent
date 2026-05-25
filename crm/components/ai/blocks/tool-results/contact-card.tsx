'use client';

import { Phone, Mail, Clock, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { timeAgo, formatFollowUpDate, formatMoney } from '@/lib/formatting';
import { EntityCard } from '../entity-card';
import { CardSkeleton } from '../card-skeleton';

interface ContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType?: 'rental' | 'buyer' | null;
  scoreLabel?: string | null;
  leadScore?: number | null;
  followUpAt?: string | null;
}

interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  leadType: string | null;
  leadScore: number | null;
  scoreLabel: string | null;
  budget: number | null;
  followUpAt: string | null;
  notes: Array<{ id: string; content: string; createdAt: string }>;
  recentActivity: Array<{ type: string; summary: string; createdAt: string }>;
}

interface ContactCardProps {
  contact: ContactSummary;
  slug: string;
  animDelay?: number;
}

// Score label → pill colours. Hot uses rose (not orange — orange is Chippi-only per STYLESHEET).
const SCORE_PILL: Record<string, string> = {
  hot: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
  warm: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  cold: 'text-muted-foreground bg-muted',
};

// Small inline text tone used in the collapsed row (no bg pill, just coloured text).
const SCORE_TEXT: Record<string, string> = {
  hot: 'text-rose-600 dark:text-rose-400',
  warm: 'text-amber-600 dark:text-amber-400',
  cold: 'text-muted-foreground',
};

function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground select-none">
      {initials}
    </div>
  );
}

function CollapsedRow({
  contact,
  isExpanded,
}: {
  contact: ContactSummary;
  isExpanded: boolean;
}) {
  const overdue =
    contact.followUpAt && new Date(contact.followUpAt) < new Date()
      ? contact.followUpAt
      : null;

  const scoreClass = contact.scoreLabel ? SCORE_TEXT[contact.scoreLabel] : undefined;
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
      <Avatar name={contact.name} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground truncate">{contact.name}</span>
          {contact.leadType && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
              {contact.leadType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          {contact.email && !contact.phone && (
            <span className="truncate">{contact.email}</span>
          )}
          {contact.phone && (
            <span className="truncate">{contact.phone}</span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <Clock size={10} />
              follow-up overdue {timeAgo(overdue)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {contact.scoreLabel && contact.leadScore != null && (
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums',
              contact.scoreLabel && SCORE_PILL[contact.scoreLabel]
                ? SCORE_PILL[contact.scoreLabel]
                : 'text-muted-foreground bg-muted',
            )}
          >
            {contact.scoreLabel} {Math.round(contact.leadScore)}
          </span>
        )}
        <Chevron size={14} className="text-muted-foreground/60" />
      </div>
    </div>
  );
}

function ExpandedDetail({
  contact,
  detail,
  loading,
  error,
  slug,
}: {
  contact: ContactSummary;
  detail: ContactDetail | null;
  loading: boolean;
  error: boolean;
  slug: string;
}) {
  const profileHref = slug ? `/s/${slug}/contacts/${contact.id}` : '#';

  if (loading) return <CardSkeleton rows={4} />;
  if (error) return <p className="text-xs text-muted-foreground">Could not load details.</p>;
  if (!detail) return null;

  const followUpLabel = detail.followUpAt
    ? formatFollowUpDate(detail.followUpAt)
    : 'None';

  return (
    <div className="space-y-4">
      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap">
        {detail.phone && (
          <a
            href={`tel:${detail.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-border/70 bg-background hover:bg-muted/30 transition-colors"
          >
            <Phone size={11} />
            {detail.phone}
          </a>
        )}
        {detail.email && (
          <a
            href={`mailto:${detail.email}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-border/70 bg-background hover:bg-muted/30 transition-colors"
          >
            <Mail size={11} />
            {detail.email}
          </a>
        )}
        <a
          href={profileHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          View profile
          <ExternalLink size={11} />
        </a>
      </div>

      {/* Data grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Lead type</span>
          {detail.leadType ? (
            <span className="text-sm font-medium capitalize">{detail.leadType}</span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Budget</span>
          <span className="text-sm font-medium">
            {detail.budget != null ? formatMoney(detail.budget) : '—'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Score</span>
          {detail.scoreLabel ? (
            <span
              className={cn(
                'text-xs font-medium px-1.5 py-0.5 rounded-full w-fit',
                SCORE_PILL[detail.scoreLabel] ?? 'text-muted-foreground bg-muted',
              )}
            >
              {detail.scoreLabel}
              {detail.leadScore != null ? ` ${Math.round(detail.leadScore)}` : ''}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Follow-up</span>
          <span className="text-sm font-medium">{followUpLabel}</span>
        </div>
      </div>

      {/* Tags */}
      {detail.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detail.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {detail.notes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Notes
          </p>
          {detail.notes.slice(0, 3).map((note) => (
            <div key={note.id} className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground italic line-clamp-2 flex-1">
                &ldquo;{note.content}&rdquo;
              </p>
              <span className="text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
                {timeAgo(note.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recent activity */}
      {detail.recentActivity.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent activity
          </p>
          <ul className="space-y-0.5">
            {detail.recentActivity.slice(0, 5).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="before:content-['•'] before:mr-1.5 before:text-muted-foreground/50">
                  {a.summary}
                </span>
                <span className="text-[11px] tabular-nums flex-shrink-0">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ContactCard({ contact, slug, animDelay = 0 }: ContactCardProps) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetched = useRef(false);

  const handleExpand = useCallback(async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/cards/contact/${contact.id}?slug=${slug}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setDetail(json.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [contact.id, slug]);

  return (
    <EntityCard
      row={(isExpanded) => (
        <CollapsedRow contact={contact} isExpanded={isExpanded} />
      )}
      detail={
        <ExpandedDetail
          contact={contact}
          detail={detail}
          loading={loading}
          error={error}
          slug={slug}
        />
      }
      onExpand={handleExpand}
    />
  );
}
