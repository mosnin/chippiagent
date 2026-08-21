'use client';

/**
 * One Chippi-voiced sentence after work already happened.
 *
 * This is not an approval gate. Morning home, the drafts inbox, and chat
 * call this after Chippi acts. There is no human wait in this file.
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

/** How long the sentence stays visible before the height collapses. */
export const APPROVAL_DWELL_MS = 2500;

/**
 * Pull the subject (person name / formatted date) the completion sentence
 * should weave in. Chat only carries raw arg ids on `args`, so we fall
 * back to `null` when nothing useful is there.
 */
export function approvalSubjectFromArgs(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  if (toolName === 'set_followup') {
    const w = args.when;
    return typeof w === 'string' && w.trim().length > 0 ? w.trim() : undefined;
  }
  return undefined;
}

/**
 * Map an agent tool name to the completion kind it should speak as.
 * Returns `null` for tools that do not warrant a line.
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
 * Pure mapping from action kind to the sentence the realtor sees after
 * Chippi already did the work. Not a prompt. Not a wait.
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
