/**
 * Per-draft feedback helpers.
 *
 * The agent emits a draft. The realtor either ships it as written, edits
 * it, or rejects it. Edit distance — the count of single-character edits
 * needed to turn the agent's text into what actually went out — is the
 * cleanest one-number signal of "how close was the model to right?"
 *
 * Classic Levenshtein. Iterative DP, two rolling rows, O(n*m) time and
 * O(min(n,m)) space. No third-party dep — it's thirty lines.
 *
 * Capped at LEVENSHTEIN_CAP. A 5,000-character email vs. a complete
 * rewrite is the same signal as 1,000 vs. 1,000: "the realtor rewrote it."
 * The cap stops a pathological draft from chewing CPU on a request path.
 */

export const LEVENSHTEIN_CAP = 1000;

/**
 * Levenshtein distance between two strings, clamped at {@link LEVENSHTEIN_CAP}.
 *
 * Unicode-safe: iterates code points (via `Array.from`), so a curly quote
 * or em-dash counts as one character, not three bytes. Identity is by
 * code-point equality, which is what we want for "did the realtor change
 * this character" — not Unicode normalization (NFC vs. NFD), which would
 * be a different question.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  // Quick degenerate cases — avoid allocating a row when one side is empty.
  if (a.length === 0) return Math.min(b.length, LEVENSHTEIN_CAP);
  if (b.length === 0) return Math.min(a.length, LEVENSHTEIN_CAP);

  // Iterate code points, not UTF-16 units, so emoji / surrogate pairs / etc.
  // count as one edit, not two.
  const aChars = Array.from(a);
  const bChars = Array.from(b);

  // Put the shorter string on the inside of the loop to keep memory bounded.
  const [short, long] = aChars.length <= bChars.length
    ? [aChars, bChars]
    : [bChars, aChars];

  // Two rolling rows is enough; we never need more than the previous row.
  let prev = new Array<number>(short.length + 1);
  let curr = new Array<number>(short.length + 1);
  for (let j = 0; j <= short.length; j++) prev[j] = j;

  for (let i = 1; i <= long.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= short.length; j++) {
      const cost = long[i - 1] === short[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Early exit: once the entire row is at or above the cap, no future row
    // can produce a smaller answer. Bail with the cap instead of grinding on.
    if (rowMin >= LEVENSHTEIN_CAP) return LEVENSHTEIN_CAP;
    [prev, curr] = [curr, prev];
  }

  return Math.min(prev[short.length], LEVENSHTEIN_CAP);
}

/**
 * Collapse all whitespace runs to a single space and trim ends.
 *
 * The point: "Hi Maya," vs "Hi Maya, " (trailing space) is not a real edit;
 * neither is "Hi\n\nMaya" vs "Hi\nMaya". We measure how much the realtor
 * changed the *content*, not whether they hit return one extra time. Trimming
 * and collapsing strips that noise without altering any actual character.
 *
 * `\s` covers spaces, tabs, newlines, carriage returns, and Unicode
 * whitespace — exactly the surface we want to normalize away.
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Levenshtein distance after whitespace normalization.
 *
 * Use this on the server-side comparison path. The raw {@link levenshtein}
 * is kept for cases where whitespace IS the signal (it shouldn't be — but the
 * low-level helper stays honest about what it does).
 */
export function normalizedLevenshtein(a: string, b: string): number {
  return levenshtein(normalizeWhitespace(a), normalizeWhitespace(b));
}
