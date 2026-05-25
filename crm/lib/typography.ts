/**
 * Chippi typography + spacing scale.
 *
 * Single source of truth for every page's visual hierarchy. Agents and
 * components import from here so the eye lands on the same thing on every
 * screen. The values are Tailwind utility class strings; consumers compose
 * them via `cn(...)`.
 *
 * The hierarchy rule: every page has ONE focal element. Title + focal stats
 * are the loud notes. Section headings recede; body recedes further; muted
 * labels recede furthest. Spacing breathes between sections, tightens within.
 */

/* ─── Display: focal numbers + page titles ─────────────────────────────── */

/** Page-level h1 — serif Times, the screen's headline. */
export const H1 = 'text-3xl tracking-tight text-foreground';
/** Inline style — apply with style={{ fontFamily: 'var(--font-title)' }} */
export const TITLE_FONT = { fontFamily: 'var(--font-title)' } as const;

/** Focal stat number — same scale as H1 but treated as data. Use serif. */
export const STAT_NUMBER = 'text-3xl tracking-tight text-foreground tabular-nums';
/** Compact stat (when 4+ are in a row). */
export const STAT_NUMBER_COMPACT = 'text-2xl tracking-tight text-foreground tabular-nums';

/* ─── Section headings ─────────────────────────────────────────────────── */

/** Section h2 — sub-page heading. Sans-serif so it recedes from the page h1. */
export const H2 = 'text-xl tracking-tight font-semibold text-foreground';

/** Card / panel heading. */
export const H3 = 'text-base font-semibold text-foreground';

/** Quiet small-caps section label (above a group of fields or rows). */
export const SECTION_LABEL =
  'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

/* ─── Body ─────────────────────────────────────────────────────────────── */

/** Default body. */
export const BODY = 'text-sm text-foreground';

/** Muted body — subtitles, helper text, secondary info. */
export const BODY_MUTED = 'text-sm text-muted-foreground';

/** Compact body for dense surfaces (tables, sidebars). */
export const BODY_COMPACT = 'text-[13px] text-foreground';

/** Caption / chrome / metadata. */
export const CAPTION = 'text-xs text-muted-foreground';

/** Smallest tabular metadata (timestamps, ids). */
export const META = 'text-[11px] tabular-nums text-muted-foreground';

/* ─── Spacing rhythm ───────────────────────────────────────────────────── */

/** Between MAJOR page sections (header → list → empty state). */
export const PAGE_RHYTHM = 'space-y-12';

/** Between sub-sections within a section. */
export const SECTION_RHYTHM = 'space-y-6';

/** Between form fields or list rows. */
export const FIELD_RHYTHM = 'space-y-4';

/** Tight inline cluster (label + chip, icon + text). */
export const INLINE_TIGHT = 'gap-1.5';

/** Standard inline cluster (toolbar buttons, action row). */
export const INLINE = 'gap-2';

/** Between hairline-divided rows: padding only, no margin. */
export const ROW_PAD = 'py-3';
export const ROW_PAD_TIGHT = 'py-2.5';

/* ─── Layout containers ────────────────────────────────────────────────── */

/** Standard page container max width — matches existing pages. */
export const PAGE_MAX = 'max-w-[1500px]';

/** Reading column — single-form pages, settings, intake customize. */
export const READING_MAX = 'max-w-3xl';

/* ─── Helper class strings for primary actions ─────────────────────────── */

/** The locked primary action pill. Use on Save / Add / Confirm / Send. */
export const PRIMARY_PILL =
  'inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium ' +
  'bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] ' +
  'transition-all duration-150 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-background';

/** Secondary ghost — Cancel, Discard, secondary action. */
export const GHOST_PILL =
  'inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium ' +
  'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] ' +
  'transition-colors duration-150';

/** Quiet text link — "Edit", "Cancel" inline within a row. */
export const QUIET_LINK =
  'text-sm text-muted-foreground hover:text-foreground transition-colors duration-150';
