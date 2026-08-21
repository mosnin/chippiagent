/**
 * Compare-and-swap helpers for Contact / Deal / Tour writes.
 *
 * Last-write-wins on a read-modify-write of tags, notes, or JSON blobs
 * silently drops a concurrent writer's fields. These helpers retry on
 * `updatedAt` mismatch so two writers of different keys both land.
 */
import { supabase } from '@/lib/supabase';

export const CAS_ATTEMPTS = 5;

export type CasFailureReason = 'not_found' | 'conflict' | 'error';

export type CasResult<T> =
  | { ok: true; row: T; skipped?: boolean }
  | { ok: false; reason: CasFailureReason; error?: unknown };

type WritableTable = 'Contact' | 'Deal' | 'Tour';

function applyEq<Q extends { eq: (k: string, v: unknown) => Q; is: (k: string, v: null) => Q }>(
  query: Q,
  clauses: Record<string, unknown>,
): Q {
  let q = query;
  for (const [key, value] of Object.entries(clauses)) {
    q = value === null ? q.is(key, null) : q.eq(key, value);
  }
  return q;
}

export async function casUpdate<T extends Record<string, unknown>>(opts: {
  table: WritableTable;
  id: string;
  scope?: Record<string, unknown>;
  match: Record<string, unknown>;
  patch: Record<string, unknown>;
}): Promise<CasResult<T>> {
  let q = supabase.from(opts.table).update(opts.patch).eq('id', opts.id);
  if (opts.scope) q = applyEq(q, opts.scope);
  q = applyEq(q, opts.match);
  const { data, error } = await q.select().maybeSingle();
  if (error) return { ok: false, reason: 'error', error };
  if (!data) return { ok: false, reason: 'conflict' };
  return { ok: true, row: data as unknown as T };
}

export async function retryOnConflict<T extends { updatedAt?: string }>(opts: {
  table: WritableTable;
  id: string;
  scope?: Record<string, unknown>;
  readColumns: string;
  maxAttempts?: number;
  build: (
    current: T,
  ) =>
    | { skip: true }
    | { abort: CasFailureReason }
    | { patch: Record<string, unknown>; match?: Record<string, unknown> };
}): Promise<CasResult<T>> {
  const attempts = opts.maxAttempts ?? CAS_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    let q = supabase.from(opts.table).select(opts.readColumns).eq('id', opts.id);
    if (opts.scope) q = applyEq(q, opts.scope);
    const { data, error } = await q.maybeSingle();
    if (error) return { ok: false, reason: 'error', error };
    if (!data) return { ok: false, reason: 'not_found' };
    const current = data as unknown as T;
    const built = opts.build(current);
    if ('skip' in built) return { ok: true, row: current, skipped: true };
    if ('abort' in built) return { ok: false, reason: built.abort };
    const match =
      built.match ??
      (current.updatedAt != null ? { updatedAt: current.updatedAt } : {});
    const result = await casUpdate<T>({
      table: opts.table,
      id: opts.id,
      scope: opts.scope,
      match,
      patch: built.patch,
    });
    if (result.ok || result.reason === 'error') return result;
  }
  return { ok: false, reason: 'conflict' };
}

export async function removeContactTags(opts: {
  id: string;
  spaceId?: string;
  remove: string[];
}): Promise<CasResult<{ id: string; tags: string[]; updatedAt: string }>> {
  const remove = new Set(opts.remove);
  return retryOnConflict({
    table: 'Contact',
    id: opts.id,
    scope: opts.spaceId ? { spaceId: opts.spaceId } : undefined,
    readColumns: 'id, tags, updatedAt',
    build: (current) => {
      const tags = (current.tags ?? []) as string[];
      const next = tags.filter((t) => !remove.has(t));
      if (next.length === tags.length) return { skip: true };
      return {
        patch: { tags: next, updatedAt: new Date().toISOString() },
        match: { updatedAt: current.updatedAt },
      };
    },
  });
}

export async function prependContactNotes(opts: {
  id: string;
  spaceId?: string;
  prefix: string;
}): Promise<CasResult<{ id: string; notes: string | null; updatedAt: string }>> {
  return retryOnConflict({
    table: 'Contact',
    id: opts.id,
    scope: opts.spaceId ? { spaceId: opts.spaceId } : undefined,
    readColumns: 'id, notes, updatedAt',
    build: (current) => {
      const existing = (current.notes as string | null) ?? '';
      const notes = existing ? `${opts.prefix}\n\n${existing}` : opts.prefix;
      return {
        patch: { notes, updatedAt: new Date().toISOString() },
        match: { updatedAt: current.updatedAt },
      };
    },
  });
}
