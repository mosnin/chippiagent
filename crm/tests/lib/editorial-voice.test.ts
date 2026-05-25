/**
 * Editorial voice tests — Chippi's brand voice as hard rules.
 *
 * Structural tests verify that copy *appears*. They do not verify that copy
 * is *good*. "Maya's looking hot" passed every structural test until a human
 * with taste read it. This file is the editorial layer: rules of voice,
 * checked at CI time, no exceptions.
 *
 * Every assertion in this file is a hard rule. Soft rules are suggestions;
 * suggestions don't ship. If a check is too noisy to enforce against the
 * current codebase honestly, it lives as a `test.skip` with a comment
 * explaining why — never as a warning. A warning nobody fixes is worse
 * than nothing.
 *
 * What this file IS:
 *   - A scan of every user-facing source file (auto-discovered) for forbidden
 *     phrases, anti-patterns, emoji, and structural copy mistakes.
 *   - A length cap on the home story sentence (the h1 wraps ugly past 80).
 *   - A check that the canonical CTA verbs we ship actually appear.
 *
 * Discovery is automatic, not hand-curated. See `editorial-voice-utils.ts`
 * for the rule (one rule, with a small EXCLUDES list — that's it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { composeMorningStory } from '@/lib/morning-story';
import type { MorningSummary } from '@/app/api/agent/morning/route';
import { discoverEditorialFiles } from './editorial-voice-utils';

// ── File set under audit ────────────────────────────────────────────────────
// Auto-discovered from the filesystem. Every `.ts`/`.tsx` under `app/`,
// `components/`, plus the prompt files in `lib/`, MINUS test code, auth,
// admin, API routes, type declarations, and >50KB files. The list of
// excludes is the only knob; the rest is enforced by default.
//
// Hand-curated lists drift. New surfaces ship; the list doesn't get updated;
// the rules silently stop applying. Auto-discovery makes that impossible.
const ROOT = resolve(__dirname, '..', '..');
const FILES_UNDER_AUDIT = discoverEditorialFiles(ROOT);

// Stats log up front — if the count drifts unexpectedly (a new top-level
// directory appears, or excludes accidentally swallow real surfaces), this
// is the first thing you'll see.
console.log(`[editorial-voice] auditing ${FILES_UNDER_AUDIT.length} files`);

/** Read each audited file once. Failing to read is a hard error — the test
 * file is the canonical reference; if discovery hands us a path that won't
 * read, that's a real problem worth surfacing. */
function readAudited(): Array<{ path: string; text: string }> {
  return FILES_UNDER_AUDIT.map((rel) => ({
    path: rel,
    text: readFileSync(resolve(ROOT, rel), 'utf8'),
  }));
}

// ── Forbidden phrases ───────────────────────────────────────────────────────
// The tells of corporate-email autopilot. None of these belong in Chippi's
// mouth — they signal "I'm a template" instead of "I'm a person who knows
// you." Case-insensitive match; if it appears verbatim, it fails.
//
// We also flag the phrase even when it lives inside an AI system prompt
// (where the prompt author may have *quoted* the phrase to tell the model
// not to use it). That's intentional: a prompt should describe the *kind*
// of voice we want, not list bad-word strings the model could regurgitate.
// Paraphrase the negative ("skip stale openers") instead of quoting it.
const FORBIDDEN_PHRASES = [
  "Don't hesitate to reach out",
  "Hope this email finds you well",
  "I hope this finds you well",
  "Just wanted to check in",
  'circle back',
  'touch base',
  'Let me know if',
  "Please don't hesitate",
  'looking forward to hearing',
  'at your earliest convenience',
  'as per',
  'kindly',
] as const;

describe('editorial voice — forbidden phrases', () => {
  const audited = readAudited();

  for (const phrase of FORBIDDEN_PHRASES) {
    it(`never appears in user-facing copy: "${phrase}"`, () => {
      const offenders = audited
        .filter((f) => f.text.toLowerCase().includes(phrase.toLowerCase()))
        .map((f) => f.path);
      // The assertion message is the actionable bit — name the file(s) and
      // the phrase so the diff to fix is one line, not a hunt.
      expect(
        offenders,
        `Forbidden phrase "${phrase}" found in: ${offenders.join(', ')}`,
      ).toEqual([]);
    });
  }
});

// ── Home story sentence length ──────────────────────────────────────────────
// The /chippi home renders one sentence as an h1 in a serif title face. Past
// ~80 characters it wraps to two lines and the silhouette stops feeling like
// a thought; it feels like a paragraph. The deterministic ladder must stay
// under that bar even on the longest legitimate inputs (long person names,
// 99 days overdue, etc.). The agent override CAN be longer — that's a
// separate problem for the agent prompt, not this ladder.
describe('editorial voice — morning sentence length', () => {
  const empty: MorningSummary = {
    newPeopleCount: 0,
    hotPeopleCount: 0,
    overdueFollowUpsCount: 0,
    stuckDealsCount: 0,
    closingThisWeekCount: 0,
    draftsCount: 0,
    questionsCount: 0,
    topStuckDeal: null,
    topOverdueFollowUp: null,
    topNewPerson: null,
    topHotPerson: null,
  };

  // A representative spread: each branch of the ladder, with the kind of
  // realistic-but-on-the-long-side inputs that would push the wrap.
  const cases: Array<{ name: string; summary: MorningSummary }> = [
    {
      name: 'short stuck deal',
      summary: {
        ...empty,
        stuckDealsCount: 1,
        topStuckDeal: { id: 'd1', title: 'Chen', daysStuck: 14 },
      },
    },
    {
      name: 'stuck deal with messy title (falls back to generic subject)',
      summary: {
        ...empty,
        stuckDealsCount: 1,
        topStuckDeal: {
          id: 'd1',
          title: 'Smith — buyer, $700k Sunset Strip',
          daysStuck: 99,
        },
      },
    },
    {
      name: 'overdue follow-up, long name, big day count',
      summary: {
        ...empty,
        overdueFollowUpsCount: 1,
        topOverdueFollowUp: {
          id: 'c1',
          name: 'Alexandra Constantinopoulos',
          daysOverdue: 99,
        },
      },
    },
    {
      name: 'new person, long name',
      summary: {
        ...empty,
        newPeopleCount: 1,
        topNewPerson: { id: 'c2', name: 'Christopher Featherstone-Hawthorne' },
      },
    },
    {
      name: 'hot person',
      summary: {
        ...empty,
        hotPeopleCount: 1,
        topHotPerson: { id: 'c3', name: 'Maya' },
      },
    },
    { name: 'drafts + questions', summary: { ...empty, draftsCount: 9, questionsCount: 4 } },
    { name: 'closing this week', summary: { ...empty, closingThisWeekCount: 9 } },
    { name: 'all clear', summary: { ...empty } },
  ];

  for (const { name, summary } of cases) {
    it(`stays <= 80 chars: ${name}`, () => {
      const out = composeMorningStory(summary);
      expect(
        out.text.length,
        `Sentence is ${out.text.length} chars (cap 80): "${out.text}"`,
      ).toBeLessThanOrEqual(80);
    });
  }
});

// ── Canonical CTA verbs ─────────────────────────────────────────────────────
// Chippi's button copy is verb-led and specific. Generic words ("Submit",
// "Click", "OK") don't ship — they tell the user nothing about what's about
// to happen. The list below is the canonical inventory; if any of these go
// missing, something rebranded a screen and broke the voice.
//
// We assert presence by string-matching across the audited file set. The
// match is intentionally loose (a substring is enough); copy can live in
// JSX, an object literal, or a `>Text<` body.
describe('editorial voice — canonical CTA verbs', () => {
  const audited = readAudited();
  const allText = audited.map((f) => f.text).join('\n');

  // Each entry is a verb-led CTA we ship. Listed as it appears in source.
  const CANONICAL_CTAS = [
    'Tell Chippi →',
    'Send',
    'Edit',
    'Cancel',
    'Try again',
    'Open chat',
    'Schedule tour',
    'Save event',
    'Save note',
  ];

  for (const cta of CANONICAL_CTAS) {
    it(`canonical CTA is present: "${cta}"`, () => {
      expect(
        allText.includes(cta),
        `Canonical CTA "${cta}" is missing from audited files. ` +
          `Either it was renamed (update this list) or removed (probably wrong).`,
      ).toBe(true);
    });
  }

  // Negative: "Submit" is the cardinal sin of generic button copy. We allow
  // `onSubmit=` (form handler), `type="submit"` (HTML input attribute), and
  // identifier strings like `noteSubmitting` / `formSubmitting`. We forbid
  // `>Submit<` and `'Submit'` / `"Submit"` as button labels.
  it('does not use "Submit" as a button label', () => {
    const offenders: string[] = [];
    const labelLike = /(>Submit<|['"]Submit['"])/;
    for (const f of audited) {
      if (labelLike.test(f.text)) offenders.push(f.path);
    }
    expect(
      offenders,
      `"Submit" appears as button copy in: ${offenders.join(', ')}. ` +
        `Use a verb that names what's about to happen ("Send", "Save event", etc.).`,
    ).toEqual([]);
  });
});

// ── No emoji except the curly arrow ────────────────────────────────────────
// The brand uses one decorative glyph: the rightward curly arrow `→`
// (U+2192) on the primary "Tell Chippi →" pill. Anything else — sparkles,
// rockets, party poppers — is consumer-app theater, not the calm,
// confident voice we want. Em-dash (—), en-dash (–), ellipsis (…), curly
// quotes are typography, not emoji; they are allowed.
//
// We target the actual emoji codepoint blocks so we don't trip on Unicode
// punctuation. If a future emoji bleeds in (e.g. an icon was pasted instead
// of imported from lucide), this catches it.
describe('editorial voice — emoji policy', () => {
  const audited = readAudited();
  // Symbols + Pictographs, Supplemental Symbols (incl. emoji),
  // Transport, Misc Symbols, Dingbats. We exclude U+2192 (→) explicitly.
  const EMOJI_RE =
    /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2700}-\u{27BF}]/u;

  it('no emoji glyphs in audited files (curly arrow → is allowed)', () => {
    const offenders: Array<{ path: string; sample: string }> = [];
    for (const f of audited) {
      const m = f.text.match(EMOJI_RE);
      if (m) {
        // Show the offending line for fast triage.
        const line = f.text.split('\n').find((l) => EMOJI_RE.test(l)) ?? '';
        offenders.push({ path: f.path, sample: line.trim().slice(0, 120) });
      }
    }
    expect(
      offenders,
      `Emoji found:\n${offenders.map((o) => `  ${o.path}: ${o.sample}`).join('\n')}`,
    ).toEqual([]);
  });
});

// ── No "click here" / "tap here" ───────────────────────────────────────────
// Anti-pattern. Link copy should describe the destination, not point at
// itself. "Share your intake link" beats "Click here to share." This rule
// holds even inside marketing-style empty states — Chippi doesn't write
// marketing copy.
describe('editorial voice — no "click here" / "tap here"', () => {
  const audited = readAudited();
  const ANTIPATTERNS = ['click here', 'tap here'];

  for (const phrase of ANTIPATTERNS) {
    it(`never uses "${phrase}"`, () => {
      const offenders = audited
        .filter((f) => f.text.toLowerCase().includes(phrase))
        .map((f) => f.path);
      expect(
        offenders,
        `Anti-pattern "${phrase}" found in: ${offenders.join(', ')}. ` +
          `Describe the destination instead.`,
      ).toEqual([]);
    });
  }
});

// ── Toast sentence-case ────────────────────────────────────────────────────
// Toasts are quiet, calm acknowledgements — sentence-cased, not Title-Cased.
// "Contact deleted." beats "Contact Deleted." The detection is hard to do
// cleanly without a full parser (the second word can legitimately be a
// proper noun: Sonner, Chippi, Telnyx). We try a best-effort scan and
// allow a small allowlist; if a future toast breaks the rule but the
// detection is too noisy, prefer to refactor the toast.
describe('editorial voice — toast sentence-case', () => {
  const audited = readAudited();
  // Words that legitimately start uppercase mid-sentence (proper nouns,
  // brand names, channels we capitalize). Add only when the toast is
  // genuinely correct.
  const PROPER_NOUNS = new Set([
    'Chippi',
    'Sonner',
    'Telnyx',
    'OpenAI',
    'Resend',
    'I',
    "I'll",
    "I'm",
    "I've",
  ]);
  // Match `toast.success(` / `toast.error(` / `toast.info(` followed by a
  // string literal. We only inspect the first ~3 words; the rest is too
  // variable for static analysis.
  const TOAST_RE = /toast\.(?:success|error|info)\(\s*['"`]([^'"`]+)['"`]/g;

  it('toast strings start sentence-case (not Title Case)', () => {
    const offenders: Array<{ path: string; toast: string }> = [];
    for (const f of audited) {
      let m: RegExpExecArray | null;
      while ((m = TOAST_RE.exec(f.text)) !== null) {
        const text = m[1].trim();
        if (!text) continue;
        // Only inspect the FIRST sentence. A toast can be two sentences
        // ("Saved. Add an integration…") and the second one legitimately
        // starts with a capital. Splitting on .!? and looking at only the
        // first chunk dodges the false positive without losing the signal.
        const firstSentence = text.split(/[.!?]/)[0].trim();
        const words = firstSentence.split(/\s+/);
        // Need at least two words to even have a "second word" to check.
        if (words.length < 2) continue;
        // First word always starts a sentence — capital is fine, skip.
        // The signal we care about: are words 2 and 3 ALSO uppercased
        // when they're not proper nouns? That's Title Case.
        const suspectWords = words.slice(1, 3).filter((w) => {
          const stripped = w.replace(/[.,!?:;]+$/, '');
          if (!stripped) return false;
          if (PROPER_NOUNS.has(stripped)) return false;
          // Numbers, symbols, lowercased words — fine.
          if (!/^[A-Z]/.test(stripped)) return false;
          // Two+ uppercase letters in a row at start = Title Case suspect.
          return /^[A-Z][a-z]+/.test(stripped);
        });
        if (suspectWords.length >= 1) {
          offenders.push({ path: f.path, toast: text });
        }
      }
    }
    expect(
      offenders,
      `Title-cased toast(s) found:\n${offenders
        .map((o) => `  ${o.path}: "${o.toast}"`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
