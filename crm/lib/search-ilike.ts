/**
 * PostgREST ILIKE helpers for workspace search.
 *
 * Cmd+K previously stripped `. : ( ) ' "` before building `or=(col.ilike.%q%)`.
 * That made every normal email miss (`gmail.com` → `gmailcom`) and hid the
 * lead. PostgREST already accepts quoted values; we quote instead of destroy.
 *
 * spaceId is NOT part of this helper. Callers must `.eq('spaceId', space.id)`
 * on the same query so one tenant cannot see another.
 */

const MAX_QUERY_CHARS = 100;

/** Escape ILIKE wildcards and wrap the pattern so PostgREST keeps punctuation. */
export function quoteIlikePattern(raw: string): string | null {
  const trimmed = raw.slice(0, MAX_QUERY_CHARS).trim();
  if (!trimmed) return null;

  const escaped = trimmed
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/"/g, '""');

  return `"%${escaped}%"`;
}

/** `name.ilike."%q%",email.ilike."%q%",...` for a `.or()` filter. */
export function postgrestIlikeOr(raw: string, columns: readonly string[]): string | null {
  const pattern = quoteIlikePattern(raw);
  if (!pattern || columns.length === 0) return null;
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}
