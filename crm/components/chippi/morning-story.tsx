'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import type { MorningResponse, MorningSummary } from '@/app/api/agent/morning/route';
import { composeMorningStory, countMorningCandidates } from '@/lib/morning-story';
import { buildMorningActions, type MorningAction } from './morning-actions';
import { MorningActionSheet } from './morning-action-sheet';

interface Props {
  /** Workspace slug — needed to deep-link the inline actions. */
  slug: string;
  /**
   * True only on day one — zero contacts, zero deals, nothing in the
   * pipeline. MorningStory shows a different sentence so the space is never
   * blank for a first-time user.
   */
  isFresh?: boolean;
}

type LoadState = 'loading' | 'ok' | 'error';

/**
 * Chippi-voiced fallback sentences. Called when the API is unavailable or
 * when the data is empty/null. The sentences are direct, useful, one idea.
 */
function getFallback(state: LoadState, isFresh: boolean): string {
  if (isFresh) return "Ready to get to work. Add your first lead and I'll start tracking.";
  if (state === 'error') return "Ready when you are.";
  return "Pipeline looks clear today. A good day to reach out cold.";
}

/**
 * The /chippi home's one sentence. Phase 5 made it expand into an action
 * panel; Phase 7 made the panel actually do work — compose actions now
 * draft, preview, and send inline. The realtor never leaves the home.
 */
export function MorningStory({ slug, isFresh = false }: Props) {
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [agentSentence, setAgentSentence] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [open, setOpen] = useState(false);
  /** Which compose action is currently expanded into a draft sheet. */
  const [activeCompose, setActiveCompose] = useState<MorningAction | null>(null);
  /**
   * In-memory cycle index for the "Next" pill. Resets on page load — tomorrow
   * morning is a new morning, no persistence. The pill increments this; the
   * ladder picks the Nth named subject down.
   */
  const [skip, setSkip] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/morning', { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as MorningResponse;
          setSummary(data);
          setAgentSentence(data.composedSentence ?? null);
          setLoadState('ok');
        } else {
          setLoadState('error');
        }
      } catch (err) {
        // AbortError fires on unmount — don't transition to error state for that
        if (err instanceof Error && err.name !== 'AbortError') {
          setLoadState('error');
        }
      }
    })();
    return () => controller.abort();
  }, []);

  // Collapse on outside click + escape. Both matter on desktop; on mobile
  // tapping outside (e.g. on TodayFeed) is the natural close gesture too.
  // While the action sheet is firing a send, we ignore outside taps so a
  // stray click can't dismiss the panel mid-send.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      const target = e.target as Node | null;
      if (target && !containerRef.current.contains(target)) {
        setOpen(false);
        setActiveCompose(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setActiveCompose(null);
      }
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // While loading, render a non-breaking space to hold the layout without
  // showing placeholder copy. On error or missing data, show a Chippi-voiced
  // fallback — never leave the H1 blank.
  if (loadState === 'loading') {
    return (
      <h1
        className="text-[2.25rem] sm:text-[2.5rem] tracking-tight text-foreground leading-tight text-center"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        &nbsp;
      </h1>
    );
  }

  if (!summary) {
    // API failed or returned an error — show a calm fallback in the same style.
    const displaySentence = getFallback(loadState, isFresh);
    return (
      <h1
        className="text-[2.25rem] sm:text-[2.5rem] tracking-tight text-foreground leading-tight text-center"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {displaySentence}
      </h1>
    );
  }

  const candidateCount = countMorningCandidates(summary);
  const effectiveSkip = Math.min(skip, Math.max(0, candidateCount - 1));
  const story = composeMorningStory(summary, agentSentence, { skip: effectiveSkip });
  // Guard: never render a blank or whitespace-only heading. composeMorningStory
  // always returns a non-empty string for valid data, but a corrupted API
  // response could produce an empty composedSentence that slips through.
  const displaySentence = story.text?.trim() || getFallback(loadState, isFresh);
  const actions = buildMorningActions(story.doorway, summary, slug);
  const isInteractive = actions.length > 0;
  // Pill renders only when there's actually a next subject to cycle to. Once
  // we've reached the last candidate, the pill disappears — no greyed-out,
  // no "no more" copy, headline stays where it is.
  const hasNext = candidateCount > effectiveSkip + 1;

  function handleNext() {
    setSkip((n) => n + 1);
    setOpen(false);
    setActiveCompose(null);
  }

  function handleActionTap(a: MorningAction) {
    if (a.kind === 'compose') {
      setActiveCompose(a);
    }
    // 'navigate' actions are <Link>s and self-close via onClick below.
  }

  function handleSent() {
    // Roll the home back to the un-expanded sentence on success.
    setActiveCompose(null);
    setOpen(false);
  }

  function handleCancel() {
    setActiveCompose(null);
  }

  return (
    <div ref={containerRef} className="relative">
      {/*
        "Next" pill — cycles to the next-best subject so a queue of 47 hot
        leads doesn't show the same face every morning. Right-aligned,
        tertiary text style (matches the kbd hints in the command palette).
        Only renders when there's actually a next subject; once exhausted,
        the pill disappears — no greyed-out, no "no more" copy. Resets on
        page load, no persistence — tomorrow morning is a new morning.
      */}
      {hasNext && (
        <button
          type="button"
          onClick={handleNext}
          className={cn(
            'absolute top-0 right-0 inline-flex items-center h-7 px-2 rounded-full',
            'text-[11px] text-muted-foreground hover:text-foreground transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
          aria-label="Show next subject"
        >
          Next →
        </button>
      )}

      {isInteractive ? (
        <motion.button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setActiveCompose(null);
          }}
          aria-expanded={open}
          key={displaySentence}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className={cn(
            'text-[2.25rem] sm:text-[2.5rem] tracking-tight leading-tight text-center block mx-auto',
            'text-foreground hover:opacity-80 transition-opacity cursor-pointer',
          )}
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {displaySentence}
        </motion.button>
      ) : (
        <motion.h1
          key={displaySentence}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="text-[2.25rem] sm:text-[2.5rem] tracking-tight leading-tight text-center block mx-auto text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {displaySentence}
        </motion.h1>
      )}

      <AnimatePresence initial={false}>
        {open && isInteractive && (
          <motion.div
            key="actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            }}
            className="overflow-hidden"
          >
            {activeCompose && activeCompose.kind === 'compose' ? (
              <MorningActionSheet
                slug={slug}
                intent={activeCompose.intent}
                context={activeCompose.context}
                onSent={handleSent}
                onCancel={handleCancel}
              />
            ) : (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {actions.map((a) =>
                  a.kind === 'navigate' ? (
                    <Link
                      key={a.id}
                      href={a.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'inline-flex items-center h-9 rounded-full px-4 text-sm transition-colors',
                        'border border-border/70 bg-background text-foreground hover:bg-muted/40',
                      )}
                    >
                      {a.label}
                    </Link>
                  ) : (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleActionTap(a)}
                      className={cn(
                        'inline-flex items-center h-9 rounded-full px-4 text-sm transition-colors',
                        'border border-border/70 bg-foreground text-background hover:bg-foreground/90',
                      )}
                    >
                      {a.label}
                    </button>
                  ),
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
