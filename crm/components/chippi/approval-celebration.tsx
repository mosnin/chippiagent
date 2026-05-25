'use client';

/**
 * The one Chippi-voiced sentence the realtor sees AFTER an approval lands.
 *
 * Three surfaces consume this — the morning home's MorningActionSheet, the
 * agent drafts inbox, and the chat permission prompt. They all hand in a
 * `kind` (and an optional `subject` for the two kinds whose sentence names
 * the person/date) and let the component own the dwell + dismiss.
 *
 * Sweat-the-detail notes:
 * - 2.5s dwell. 2s reads rushed; 3s reads sluggish. The realtor needs ~2.5
 *   seconds to read four to seven words and feel that someone-is-here pause
 *   before the surface gets out of the way.
 * - text-foreground for the dwell window — this is the ONE moment, not a
 *   footnote. The fade-out collapses the height to 0 so the surrounding
 *   layout reflows cleanly.
 * - No icons. No checkmark. The sentence IS the celebration.
 * - Tasteful 4px slide-in from the left as the line appears — Chippi
 *   pausing to look the realtor in the eye, not a slot machine spin.
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { DURATION_BASE, DURATION_FAST, EASE_OUT } from '@/lib/motion';

export type ApprovalKind =
  | 'email'
  | 'sms'
  | 'note'
  | 'stage'
  | 'tour'
  | 'person-hot'
  | 'person-cold'
  | 'followup';

export interface ApprovalCelebrationProps {
  kind: ApprovalKind;
  /** Person name for `person-hot`/`person-cold`, formatted date for `followup`. Ignored otherwise. */
  subject?: string;
  /** Fired when the dwell + fade have completed and the parent should remove the surface. */
  onDone?: () => void;
}

/** How long the sentence stays loud before the height collapses. */
export const APPROVAL_DWELL_MS = 2500;

/**
 * Pull the subject (person name / formatted date) the celebration sentence
 * should weave in. The chat permission prompt only carries raw arg ids on
 * `args`, so we fall back to `null` when nothing useful is there — the
 * celebration component then renders the subject-less variant of the
 * sentence, which is intentional (still calm, still in voice).
 */
export function approvalSubjectFromArgs(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  if (toolName === 'set_followup') {
    const w = args.when;
    return typeof w === 'string' && w.trim().length > 0 ? w.trim() : undefined;
  }
  // For mark_person_hot/cold the args only carry an id — no name. Leave it
  // empty; the celebration falls back to the subject-less direction line.
  return undefined;
}

/**
 * Map an agent tool name (the chat permission prompt's `prompt.name`) to the
 * approval kind it should celebrate as. Returns `null` for tools whose
 * approval doesn't warrant a celebration line — find/list/lookup tools, the
 * draft_* tools (which compose but don't deliver), researcher subagents, etc.
 *
 * Centralised here so the chat, the morning sheet, and the drafts inbox
 * all draw from one taste-decision file.
 */
export function approvalKindForTool(toolName: string): ApprovalKind | null {
  switch (toolName) {
    case 'send_email':
    case 'log_email_sent':
      return 'email';
    case 'send_sms':
    case 'log_sms_sent':
      return 'sms';
    case 'note_on_person':
    case 'note_on_deal':
    case 'note_on_property':
    case 'log_call':
    case 'log_meeting':
      return 'note';
    case 'move_deal_stage':
      return 'stage';
    case 'schedule_tour':
    case 'reschedule_tour':
      return 'tour';
    case 'mark_person_hot':
      return 'person-hot';
    case 'mark_person_cold':
      return 'person-cold';
    case 'set_followup':
      return 'followup';
    default:
      return null;
  }
}

/**
 * Pure mapping from action kind to the sentence the realtor sees.
 *
 * Decisions worth defending:
 * - The two-thought rhythm ("Sent. I'll watch for a reply.") — the first
 *   word names what just happened; the second sentence names what Chippi
 *   does next. Two short thoughts, one continuous breath.
 * - `person-hot` / `person-cold` name the direction the realtor just fired.
 *   The realtor already knows which verb they tapped; the celebration
 *   echoes it back so they're sure it landed. "Got it. Sam's hot now." is
 *   confidence; "where they should be" is friendly-vague.
 * - `stage` says "the board" not "the pipeline" — the realtor's word for
 *   the kanban surface they actually look at.
 *
 * Exported for tests + so a consumer can render the same string elsewhere
 * if they need to log it. Safe with bad input — falls back to a generic
 * "Done." so an unknown kind still reads calm rather than crashing.
 */
export function getApprovalSentence(kind: ApprovalKind, subject?: string): string {
  switch (kind) {
    case 'email':
      return "Sent. I'll watch for a reply.";
    case 'sms':
      return "Sent. I'll let you know if they reply.";
    case 'note':
      return "Logged. It's in the timeline.";
    case 'stage':
      return 'Moved. The board reflects it.';
    case 'tour':
      return "On the calendar. I'll prep them the day before.";
    case 'person-hot': {
      const name = subject?.trim();
      return name ? `Got it. ${name}'s hot now.` : "Got it. They're hot now.";
    }
    case 'person-cold': {
      const name = subject?.trim();
      return name ? `Got it. ${name}'s cold now.` : "Got it. They're cold now.";
    }
    case 'followup': {
      const when = subject?.trim();
      return when
        ? `Set for ${when}. I'll surface it.`
        : "Set. I'll surface it.";
    }
    default:
      return 'Done.';
  }
}

export function ApprovalCelebration({ kind, subject, onDone }: ApprovalCelebrationProps) {
  const sentence = getApprovalSentence(kind, subject);

  useEffect(() => {
    if (!onDone) return;
    const t = setTimeout(onDone, APPROVAL_DWELL_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.p
      // Height-collapse on exit so the surface above (composer, drafts list,
      // chat prompt) reflows without a stray empty box. Width stays auto.
      initial={{ opacity: 0, x: -4, height: 'auto' }}
      animate={{
        opacity: 1,
        x: 0,
        transition: { duration: DURATION_BASE, ease: EASE_OUT },
      }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: 0,
        marginBottom: 0,
        transition: { duration: DURATION_FAST, ease: EASE_OUT },
      }}
      className="text-sm text-foreground leading-relaxed"
      role="status"
      aria-live="polite"
    >
      {sentence}
    </motion.p>
  );
}
