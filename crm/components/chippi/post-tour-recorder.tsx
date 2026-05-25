'use client';

/**
 * PostTourRecorder — the one client component on /chippi/log.
 *
 * State machine:
 *   idle → recording → transcribing → processing → awaiting_approval
 *        → approving → done → idle
 *
 * Decisions:
 *   - Tap to start, tap to stop. Hold-to-record is satisfying once but
 *     fragile on mobile (sweaty palm, bumped screen, lost recording).
 *     Tap is forgiving.
 *   - The transcript is invisible. The realtor never sees it. They see
 *     the actions land, which is the substance.
 *   - "Approve all" is the primary path. Editing exists but is one click
 *     away — the brief says most realtors approve all.
 *   - One done-sentence. No toasts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Pencil, X, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TITLE_FONT, PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

type State =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'processing'
  | 'awaiting_approval'
  | 'approving'
  | 'done'
  | 'error';

interface Proposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  /** Server-resolved Chippi-voice line that uses real names instead of IDs.
   *  Preferred over `summary` whenever present. Absent only on rare misses. */
  humanSummary?: string;
  mutates: boolean;
}

interface ExecResult {
  tool: string;
  ok: boolean;
  summary: string;
}

interface UiProposal extends Proposal {
  uid: string;
  enabled: boolean;
  editing: boolean;
}

interface Props {
  slug: string;
  /** Optional pre-fill from the URL — biases the orchestrator's proposals
   *  toward this person. Sent through as `contextHint` on the post-tour
   *  request body. The recorder UI is unchanged; the realtor never sees
   *  the id. */
  personId?: string;
  /** Same as `personId` but for a deal — used when the recorder is reached
   *  from a deal detail page so the proposed actions land on the right deal. */
  dealId?: string;
}

const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 minutes — Whisper can take more, but a tour debrief shouldn't.

export function PostTourRecorder({ slug, personId, dealId }: Props) {
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposals, setProposals] = useState<UiProposal[]>([]);
  const [results, setResults] = useState<ExecResult[]>([]);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Stash the optional URL-driven context in a ref so processAudio (memoized
  // with [] deps) reads the latest values without re-binding on every render.
  // The realtor never sees these — they're a hint to the proposal model so
  // calls/notes/follow-ups land on the right person or deal.
  const contextHintRef = useRef<{ personId?: string; dealId?: string }>({});
  useEffect(() => {
    contextHintRef.current = { personId, dealId };
  }, [personId, dealId]);

  // Cleanup any open mic on unmount.
  useEffect(() => {
    return () => stopAllTracks(streamRef.current);
  }, []);

  // Stopwatch tick.
  useEffect(() => {
    if (state !== 'recording') {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) handleStop();
    }, 200);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleStart = useCallback(async () => {
    setErrorMsg(null);
    setResults([]);
    setProposals([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, pickRecorderOptions());
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopAllTracks(streamRef.current);
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        await processAudio(blob);
      };
      recorder.start();
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState('recording');
    } catch {
      setErrorMsg("I couldn't reach the microphone. Check your browser permissions.");
      setState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = useCallback(() => {
    const rec = mediaRef.current;
    if (!rec) return;
    setState('transcribing');
    try {
      rec.stop();
    } catch {
      // already stopped
    }
    mediaRef.current = null;
  }, []);

  const processAudio = useCallback(async (blob: Blob) => {
    if (blob.size === 0) {
      setErrorMsg("I didn't catch any sound. Try again.");
      setState('error');
      return;
    }
    if (blob.size > 25 * 1024 * 1024) {
      setErrorMsg('That take ran long. Try a shorter recap.');
      setState('error');
      return;
    }

    // Phase 1 — transcribe.
    let transcript = '';
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'tour.webm');
      const res = await fetch('/api/chippi/transcribe', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { transcript?: string };
      transcript = (json.transcript ?? '').trim();
    } catch {
      setErrorMsg("I couldn't make out the recording. Try again.");
      setState('error');
      return;
    }
    if (!transcript) {
      setErrorMsg("I didn't catch a clear action. Try a quick rephrase.");
      setState('error');
      return;
    }

    // Phase 2 — propose actions.
    setState('processing');
    try {
      const res = await fetch('/api/chippi/post-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          contextHint: buildContextHint(contextHintRef.current),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { proposals?: Proposal[] };
      const got = (json.proposals ?? []).map((p, i) => ({
        ...p,
        uid: `${i}-${p.tool}`,
        enabled: true,
        editing: false,
      }));
      if (got.length === 0) {
        setErrorMsg("I didn't catch a clear action. Try a quick rephrase.");
        setState('error');
        return;
      }
      setProposals(got);
      setState('awaiting_approval');
    } catch {
      setErrorMsg('Something went wrong. Try again.');
      setState('error');
    }
  }, []);

  const handleApproveAll = useCallback(async () => {
    const checked = proposals.filter((p) => p.enabled);
    if (checked.length === 0) return;
    setState('approving');
    try {
      const res = await fetch('/api/chippi/post-tour/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposals: checked.map((p) => ({ tool: p.tool, args: p.args })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { results?: ExecResult[] };
      setResults(json.results ?? []);
      setState('done');
    } catch {
      setErrorMsg("I couldn't finish. Try again.");
      setState('error');
    }
  }, [proposals]);

  const handleReset = useCallback(() => {
    setProposals([]);
    setResults([]);
    setErrorMsg(null);
    setState('idle');
  }, []);

  // ─── Header ──────────────────────────────────────────────────────────────
  const headerLine =
    state === 'idle' || state === 'error'
      ? 'Tell me about your tour.'
      : state === 'recording'
        ? 'Listening.'
        : state === 'transcribing' || state === 'processing'
          ? 'Working on it.'
          : state === 'awaiting_approval'
            ? "Here's what I'd do."
            : state === 'approving'
              ? 'On it.'
              : 'Done.';

  return (
    <div className="w-full max-w-md">
      {/* Back link — single muted breadcrumb. Doesn't compete with the focal element. */}
      <div className="mb-10">
        <Link
          href={`/s/${slug}/chippi`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} />
          Back to Chippi
        </Link>
      </div>

      <header className="text-center mb-10">
        <h1
          className="text-[2.25rem] tracking-tight leading-tight text-foreground"
          style={TITLE_FONT}
        >
          {headerLine}
        </h1>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {(state === 'idle' || state === 'recording' || state === 'transcribing' || state === 'processing' || state === 'error') && (
          <motion.div
            key="record"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="flex flex-col items-center gap-6"
          >
            <RecordButton
              state={state}
              elapsedMs={elapsed}
              onStart={handleStart}
              onStop={handleStop}
            />
            {state === 'error' && (
              <div className="text-center space-y-3">
                <p className="text-sm text-foreground">{errorMsg}</p>
                <button
                  type="button"
                  onClick={handleReset}
                  className={GHOST_PILL}
                >
                  Try again
                </button>
              </div>
            )}
          </motion.div>
        )}

        {state === 'awaiting_approval' && (
          <motion.div
            key="approve"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="space-y-6"
          >
            <ProposalStack
              proposals={proposals}
              onChange={setProposals}
            />

            <div className="flex flex-col items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleApproveAll}
                className={PRIMARY_PILL}
                disabled={proposals.every((p) => !p.enabled)}
              >
                Approve all
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {state === 'approving' && (
          <motion.div
            key="approving"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center"
          >
            <CalmPulse />
          </motion.div>
        )}

        {state === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="text-center space-y-6"
          >
            <p className="text-base text-foreground">{buildDoneSentence(results, proposals)}</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className={GHOST_PILL}
              >
                Log another
              </button>
              <Link
                href={`/s/${slug}/chippi`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium',
                  'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                  'transition-colors duration-150',
                )}
              >
                Back to Chippi
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function RecordButton({
  state,
  elapsedMs,
  onStart,
  onStop,
}: {
  state: State;
  elapsedMs: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = state === 'recording';
  const busy = state === 'transcribing' || state === 'processing';
  const disabled = busy;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={recording ? onStop : onStart}
        disabled={disabled}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        className={cn(
          'relative flex h-24 w-24 items-center justify-center rounded-full',
          'border border-border/70 bg-background',
          'transition-all duration-150',
          'active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !disabled && 'hover:bg-muted/30',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {recording && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border border-foreground/30"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.25 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        {busy ? (
          <CalmPulse />
        ) : recording ? (
          <Square size={28} strokeWidth={2.25} className="text-foreground" />
        ) : (
          <Mic size={28} strokeWidth={2} className="text-foreground" />
        )}
      </button>
      <div className="h-5 text-[11px] tabular-nums text-muted-foreground">
        {recording ? formatElapsed(elapsedMs) : ''}
      </div>
    </div>
  );
}

function CalmPulse() {
  return (
    <div className="flex items-center gap-1.5" aria-label="Working">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-foreground/60"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.18,
          }}
        />
      ))}
    </div>
  );
}

function ProposalStack({
  proposals,
  onChange,
}: {
  proposals: UiProposal[];
  onChange: (next: UiProposal[]) => void;
}) {
  function update(uid: string, patch: Partial<UiProposal>) {
    onChange(proposals.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  }

  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card overflow-hidden">
      {proposals.map((p) => {
        const label = p.humanSummary ?? p.summary;
        return (
        <li key={p.uid} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label={label}
              checked={p.enabled}
              onChange={(e) => update(p.uid, { enabled: e.target.checked })}
              className="h-4 w-4 accent-foreground cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm leading-snug',
                  p.enabled ? 'text-foreground' : 'text-muted-foreground line-through',
                )}
              >
                {label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => update(p.uid, { editing: !p.editing })}
              aria-label={p.editing ? 'Close editor' : 'Edit'}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {p.editing ? <X size={14} /> : <Pencil size={14} />}
            </button>
          </div>
          {p.editing && (
            <ArgsEditor
              args={p.args}
              onChange={(args) => update(p.uid, { args })}
            />
          )}
        </li>
        );
      })}
    </ul>
  );
}

/** Keys we never expose to the realtor in the args editor — they're
 *  workspace UUIDs, not editable copy. The proposal stack already uses
 *  `humanSummary` to render the resolved name; surfacing the raw id here
 *  reintroduces the same robot-speak we just removed. */
const HIDDEN_ARG_KEYS = new Set(['personId', 'dealId', 'contactId', 'propertyId', 'tourId']);

function ArgsEditor({
  args,
  onChange,
}: {
  args: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  // Simple key/value editor over the proposal's existing args. We don't
  // synthesize new keys — the model already chose them; the realtor edits
  // values only. Numeric inputs get number coercion; everything else is a
  // string. Good enough for the 90% case (followup dates, summaries,
  // sentiment). Power editing happens in the chat surface.
  const keys = Object.keys(args).filter((k) => !HIDDEN_ARG_KEYS.has(k));
  return (
    <div className="mt-3 space-y-2 rounded-md bg-muted/30 px-3 py-3">
      {keys.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing to edit here.</p>
      )}
      {keys.map((k) => {
        const v = args[k];
        if (v === null || typeof v === 'object') {
          return (
            <div key={k} className="text-[11px] text-muted-foreground">
              {k}: <span className="tabular-nums">{JSON.stringify(v)}</span>
            </div>
          );
        }
        return (
          <div key={k} className="space-y-1">
            <Label htmlFor={`arg-${k}`} className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {k}
            </Label>
            <Input
              id={`arg-${k}`}
              value={String(v ?? '')}
              onChange={(e) => onChange({ ...args, [k]: coerce(v, e.target.value) })}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function pickRecorderOptions(): MediaRecorderOptions {
  // Prefer opus in webm; falls through to default if unsupported (Safari).
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus' };
  }
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/mp4')) {
    return { mimeType: 'audio/mp4' };
  }
  return {};
}

function stopAllTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}

function coerce(prev: unknown, next: string): unknown {
  if (typeof prev === 'number') {
    if (next.trim() === '') return prev;
    const n = Number(next);
    return Number.isFinite(n) ? n : next;
  }
  if (typeof prev === 'boolean') {
    if (next === 'true') return true;
    if (next === 'false') return false;
    return prev;
  }
  return next;
}

/** ONE sentence, calm, names a person whenever we can.
 *  Examples:
 *   - "Done. Sam's call logged, follow-up set for Friday."
 *   - "Done. Three things landed."
 *   - "Done — but two steps need a hand." */
export function buildDoneSentence(results: ExecResult[], proposals: UiProposal[]): string {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (ok.length === 0) return "Nothing landed. I'll let you take it from here.";

  const fact = pickFact(ok, proposals);
  const verbCount =
    ok.length === 1 ? 'One thing' : ok.length === 2 ? 'Two things' : `${ok.length} things`;

  let line: string;
  if (fact) {
    line = `Done. ${fact}.`;
  } else {
    line = `Done. ${verbCount} landed.`;
  }
  if (failed.length > 0) {
    line += ` ${failed.length === 1 ? 'One step' : `${failed.length} steps`} need a hand.`;
  }
  return line;
}

/** Pull a clean fact out of the matched proposal/result pair. We prefer the
 *  first-name from `humanSummary` (server-resolved) because it never lies. */
function pickFact(ok: ExecResult[], proposals: UiProposal[]): string | null {
  // Try: first OK proposal with a humanSummary → "Sam's call logged"
  for (const r of ok) {
    const matched = proposals.find((p) => p.tool === r.tool);
    const verb = describe(r.tool);
    if (!verb) continue;
    const first = matched?.humanSummary ? firstNameFrom(matched.humanSummary) : null;
    if (first) return `${first}'s ${verb}`;
  }
  // Fall back to a verb stack.
  const verbs = ok.map((r) => describe(r.tool)).filter((v): v is string => Boolean(v));
  if (verbs.length === 1) return verbs[0][0].toUpperCase() + verbs[0].slice(1);
  if (verbs.length === 2) return `${cap(verbs[0])}, ${verbs[1]}`;
  if (verbs.length >= 3) return `${cap(verbs[0])}, ${verbs[1]}, ${verbs[2]}`;
  return null;
}

function firstNameFrom(humanSummary: string): string | null {
  // "Log Sam Chen's call: ...", "Mark Sam Chen hot — ...", "Follow up with Sam Chen on Friday",
  // "Note on 412 Elm: ...", "Draft a check-in email to Sam Chen"
  const patterns = [
    /^Log ([\w'.-]+)/,            // log_call / log_meeting → "Log Sam Chen's call"
    /^Mark ([\w'.-]+)/,           // mark_*_hot/cold → "Mark Sam Chen hot"
    /^Follow up with ([\w'.-]+)/, // set_followup
    /to ([\w'.-]+)$/,             // draft_email/sms → "Draft a check-in email to Sam Chen"
    /^Note on ([\w'.-]+)/,        // note_on_*
  ];
  for (const re of patterns) {
    const m = humanSummary.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Build the `contextHint` payload for the orchestrator. Omits the field
 *  entirely when both ids are absent so the wire payload stays clean for
 *  the no-context case (the orchestrator branches on presence). Trims and
 *  drops empty strings — defensive against a stray `?personId=` on the URL. */
export function buildContextHint(
  raw: { personId?: string | null; dealId?: string | null } | null | undefined,
): { personId?: string; dealId?: string } | undefined {
  if (!raw) return undefined;
  const personId = typeof raw.personId === 'string' ? raw.personId.trim() : '';
  const dealId = typeof raw.dealId === 'string' ? raw.dealId.trim() : '';
  if (!personId && !dealId) return undefined;
  const out: { personId?: string; dealId?: string } = {};
  if (personId) out.personId = personId;
  if (dealId) out.dealId = dealId;
  return out;
}

function describe(tool: string): string | null {
  switch (tool) {
    case 'log_call':
      return 'call logged';
    case 'log_meeting':
      return 'meeting logged';
    case 'note_on_person':
    case 'note_on_deal':
      return 'note added';
    case 'mark_person_hot':
      return 'marked hot';
    case 'mark_person_cold':
      return 'marked cold';
    case 'set_followup':
      return 'follow-up set';
    case 'draft_email':
      return 'email drafted';
    case 'draft_sms':
      return 'text drafted';
    default:
      return null;
  }
}
