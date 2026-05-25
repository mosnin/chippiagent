/**
 * Application-wide constants — single source of truth.
 * These replace per-file duplicates scattered across components.
 */

import {
  Flame,
  Thermometer,
  Snowflake,
  HelpCircle,
  FileText,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Activity,
  CheckCircle2,
} from 'lucide-react';

// ── Contact pipeline stages ────────────────────────────────────────────────

export const CONTACT_STAGES = [
  {
    key: 'QUALIFICATION' as const,
    label: 'Qualifying',
    description: 'Initial review',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    dotColor: 'bg-blue-400',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    headerBg: 'bg-blue-50/60 dark:bg-blue-500/5',
  },
  {
    key: 'TOUR' as const,
    label: 'Tour',
    description: 'Showing scheduled',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    dotColor: 'bg-amber-400',
    border: 'border-amber-200/60 dark:border-amber-800/40',
    headerBg: 'bg-amber-50/60 dark:bg-amber-500/5',
  },
  {
    key: 'APPLICATION' as const,
    label: 'Applied',
    description: 'Application submitted',
    className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    dotColor: 'bg-green-400',
    border: 'border-green-200/60 dark:border-green-800/40',
    headerBg: 'bg-green-50/60 dark:bg-green-500/5',
  },
] as const;

export type ContactStageKey = (typeof CONTACT_STAGES)[number]['key'];

// ── Lead tier config ────────────────────────────────────────────────────────

export const LEAD_TIERS = {
  hot: {
    label: 'Hot',
    icon: Flame,
    ring: 'ring-red-400/60',
    bg: 'bg-muted/40',
    border: 'border-red-500',
    text: 'text-red-700 dark:text-red-400',
    pill: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    scoreBg: 'bg-red-500',
  },
  warm: {
    label: 'Warm',
    icon: Thermometer,
    ring: 'ring-amber-400/60',
    bg: 'bg-muted/40',
    border: 'border-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    scoreBg: 'bg-amber-500',
  },
  cold: {
    label: 'Cold',
    icon: Snowflake,
    ring: 'ring-blue-400/60',
    bg: 'bg-muted/40',
    border: 'border-blue-400',
    text: 'text-blue-700 dark:text-blue-400',
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    scoreBg: 'bg-blue-400',
  },
  unscored: {
    label: 'Unscored',
    icon: HelpCircle,
    ring: 'ring-border',
    bg: 'bg-muted/40',
    border: 'border-border',
    text: 'text-muted-foreground',
    pill: 'bg-muted text-muted-foreground',
    scoreBg: 'bg-muted-foreground/30',
  },
} as const;

export type TierKey = keyof typeof LEAD_TIERS;

// ── Lead-score thresholds ───────────────────────────────────────────────────
// Single source of truth for "what hot means." Different surfaces used to
// hard-code 70, 75, or 80 — three definitions of the same word. Centralise
// so the brand voice can say "X hot people" with one cutoff everywhere.

/** Score at or above this = "hot". Matches the system-prompt convention
 *  the agent uses when it talks about hot people in chat. */
export const HOT_LEAD_THRESHOLD = 70;
/** Score at or above this = "warm" (and below = cold / unscored). */
export const WARM_LEAD_THRESHOLD = 40;

// ── Activity type metadata ──────────────────────────────────────────────────
// Covers all 7 types used across deal-panel + contact-activity-tab.
// Contact UI only exposes the first 5 (no stage_change / status_change).

export const ACTIVITY_META = {
  note:         { label: 'Note',          icon: FileText,     color: 'text-muted-foreground bg-muted' },
  call:         { label: 'Call',          icon: Phone,        color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10' },
  email:        { label: 'Email',         icon: Mail,         color: 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-500/10' },
  meeting:      { label: 'Meeting',       icon: Calendar,     color: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
  follow_up:    { label: 'Follow-up',     icon: MessageSquare,color: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10' },
  stage_change: { label: 'Stage change',  icon: Activity,     color: 'text-muted-foreground bg-muted' },
  status_change:{ label: 'Status change', icon: CheckCircle2, color: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10' },
} as const;

export type ActivityType = keyof typeof ACTIVITY_META;

// ── Contact type union ──────────────────────────────────────────────────────

export const CLIENT_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
