'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PAGE_VARIANTS } from '@/lib/motion';
import { timeAgo } from '@/lib/formatting';
import { cn } from '@/lib/utils';

/* ─── URL-driven tab strip ──────────────────────────────────────────────── */

export type ContactTabKey =
  | 'activity'
  | 'application'
  | 'documents'
  | 'deals'
  | 'tours';

const TABS: { key: ContactTabKey; label: string }[] = [
  { key: 'activity', label: 'Activity' },
  { key: 'application', label: 'Application' },
  { key: 'documents', label: 'Documents' },
  { key: 'deals', label: 'Linked deals' },
  { key: 'tours', label: 'Tours' },
];

export function ContactTabStrip({
  baseHref,
}: {
  baseHref: string;
}) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const active: ContactTabKey =
    (TABS.find((t) => t.key === tab)?.key as ContactTabKey) ?? 'activity';

  return (
    <nav
      className="flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto"
      aria-label="Person sections"
    >
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={`${baseHref}?tab=${t.key}`}
            scroll={false}
            className={cn(
              'flex items-center px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors duration-150',
              isActive
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ─── Animated tab content wrapper ─────────────────────────────────────── */

export function TabContent({
  tabKey,
  children,
}: {
  tabKey: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        variants={PAGE_VARIANTS}
        initial="initial"
        animate="enter"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── Inline editable field (PATCH /api/contacts/[id]) ─────────────────── */

interface EditableFieldProps {
  contactId: string;
  field: 'name' | 'email' | 'phone' | 'budget';
  initialValue: string | number | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  prefix?: string;
  suffix?: string;
  formatDisplay?: (v: string | number | null) => string;
}

export function EditableField({
  contactId,
  field,
  initialValue,
  placeholder,
  className,
  inputClassName,
  prefix,
  suffix,
  formatDisplay,
}: EditableFieldProps) {
  const [value, setValue] = useState<string>(
    initialValue == null ? '' : String(initialValue),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    if (saving) return;
    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    if (field === 'name' && !trimmed) {
      toast.error('Give them a name first.');
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (field === 'budget') {
        payload.budget = trimmed === '' ? null : Number(trimmed.replace(/[^0-9.]/g, ''));
      } else {
        payload[field] = trimmed === '' ? null : trimmed;
      }
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setValue(trimmed);
      toast.success('Saved.');
    } catch {
      toast.error("Couldn't save that. Try again.");
      setDraft(value);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        disabled={saving}
        className={cn(
          'bg-transparent outline-none border-b border-foreground/40 focus:border-foreground transition-colors',
          inputClassName ?? className,
        )}
      />
    );
  }

  const display = value
    ? (formatDisplay ? formatDisplay(value) : `${prefix ?? ''}${value}${suffix ?? ''}`)
    : (placeholder ?? '—');

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        'text-left rounded-sm hover:bg-foreground/[0.04] transition-colors -mx-1 px-1',
        !value && 'text-muted-foreground italic',
        className,
      )}
    >
      {display}
    </button>
  );
}

/* ─── Last-activity sentence (brand voice) ─────────────────────────────── */

export function LastActivityLine({
  contactId,
  contactFirstName,
}: {
  contactId: string;
  contactFirstName: string;
}) {
  const [sentence, setSentence] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [activitiesRes, timelineRes] = await Promise.all([
          fetch(`/api/contacts/${contactId}/activity`),
          fetch(`/api/contacts/${contactId}/timeline`),
        ]);
        const events: { type: string; content: string | null; createdAt: string; kind?: string }[] = [];
        if (activitiesRes.ok) {
          const acts = await activitiesRes.json();
          for (const a of acts) {
            events.push({
              type: a.type,
              content: a.content,
              createdAt: a.createdAt,
              kind: 'activity',
            });
          }
        }
        if (timelineRes.ok) {
          const tl = await timelineRes.json();
          for (const e of tl) events.push(e);
        }
        events.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        if (cancelled) return;
        const latest = events[0];
        if (!latest) {
          setSentence(
            `I haven't heard from ${contactFirstName} yet. Want me to nudge?`,
          );
          return;
        }
        const ago = timeAgo(latest.createdAt);
        const verb = verbForType(latest.type, latest.kind);
        setSentence(`Last activity: ${verb} ${ago}.`);
      } catch {
        if (!cancelled) setSentence(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, contactFirstName]);

  if (!sentence) return null;
  return (
    <p
      className="text-base text-muted-foreground"
      style={{ fontFamily: 'var(--font-title)' }}
    >
      {sentence}
    </p>
  );
}

function verbForType(type: string, kind?: string): string {
  if (kind === 'activity') {
    switch (type) {
      case 'note': return 'You logged a note';
      case 'call': return 'You logged a call';
      case 'email': return 'You sent an email';
      case 'meeting': return 'You met';
      case 'follow_up': return 'You followed up';
      default: return 'Activity logged';
    }
  }
  switch (type) {
    case 'tour_scheduled': return 'Tour scheduled';
    case 'tour_confirmed': return 'Tour confirmed';
    case 'tour_completed': return 'Tour completed';
    case 'tour_cancelled': return 'Tour cancelled';
    case 'tour_no_show': return 'No-show';
    case 'deal_created': return 'Deal created';
    case 'contact_created': return 'Contact added';
    case 'stage_change': return 'Stage changed';
    case 'status_change': return 'Status changed';
    default: return 'Last touch';
  }
}

/* ─── Keyboard shortcut hook for action pills ──────────────────────────── */

export function useActionShortcuts(handlers: {
  onMessage?: () => void;
  onTour?: () => void;
  onNote?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'm' && handlers.onMessage) {
        e.preventDefault();
        handlers.onMessage();
      } else if (key === 't' && handlers.onTour) {
        e.preventDefault();
        handlers.onTour();
      } else if (key === 'n' && handlers.onNote) {
        e.preventDefault();
        handlers.onNote();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}
