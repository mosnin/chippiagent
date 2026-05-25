/**
 * TS-side AgentMemory persistence + semantic recall.
 *
 * This is the chat cutover blocker called out in `agent/MIGRATION_GAP.md`:
 * the Python runtime has a pgvector-backed memory; the TS side had nothing.
 *
 * Design principles:
 *   - Read/write the SAME `AgentMemory` rows the Python runtime uses. No fork.
 *     The migration `20260419000000_agent_tables.sql` already created the
 *     table; we only added the `match_agent_memory` RPC.
 *   - spaceId is the only blast-radius boundary. Every read and write filters
 *     on it. Cross-tenant leak is impossible by construction.
 *   - The TS surface uses the friendlier name `kind` for what the DB calls
 *     `memoryType`. Same column, less typing in calling code.
 *   - The TS surface accepts `contactId` / `dealId` because callers know in
 *     contact/deal terms. We translate to entityType/entityId at the SQL
 *     layer — that's how the Python schema thinks about it.
 *
 * Embedding failures throw — let the caller decide. The Python side silently
 * falls back to keyword search; in TS we don't have that option (the
 * `recall_history` keyword path was just replaced with this), so failure
 * surfaces upward.
 */

import { supabase } from '@/lib/supabase';
import { embed } from './embed';
import type { MemoryEntry, MemoryEntityType, MemoryKind } from './types';

// pgvector accepts string form '[0.1,0.2,...]' over the wire; the supabase-js
// JSON encoder handles that correctly when inserting into a vector column.
function vectorLiteral(vec: number[]): string {
  return '[' + vec.map((x) => x.toFixed(7)).join(',') + ']';
}

// ── Storage ────────────────────────────────────────────────────────────────

export interface StoreMemoryInput {
  spaceId: string;
  /** Optional Clerk userId — kept in metadata-style fields if needed later.
   *  The current schema doesn't have a userId column; Python doesn't write
   *  one either. We accept it on the API for forward-compat but ignore it
   *  at the storage layer until the schema needs it. */
  userId?: string;
  contactId?: string;
  dealId?: string;
  /** Friendly alias for the DB's `memoryType`. */
  kind: MemoryKind;
  content: string;
  /** 0-1; defaults to 0.5 to match Python. */
  importance?: number;
  /** Reserved for future use. Today `AgentMemory` has no JSON metadata
   *  column — the Python schema doesn't either. We accept it to avoid
   *  breaking call sites once we add it; right now it's a no-op. */
  metadata?: Record<string, unknown>;
}

/**
 * Translate caller-friendly contactId/dealId into the schema's
 * (entityType, entityId) pair. Order matters: contactId wins if both are set
 * because a memory about a contact-on-a-deal is most-naturally "about the
 * contact." Callers who really mean "this is about the deal" should pass
 * dealId only.
 */
function resolveEntity(
  spaceId: string,
  contactId: string | undefined,
  dealId: string | undefined,
): { entityType: MemoryEntityType; entityId: string } {
  if (contactId) return { entityType: 'contact', entityId: contactId };
  if (dealId) return { entityType: 'deal', entityId: dealId };
  return { entityType: 'space', entityId: spaceId };
}

export async function storeMemory(input: StoreMemoryInput): Promise<{ id: string }> {
  const cleaned = (input.content ?? '').trim();
  if (!cleaned) {
    throw new Error('storeMemory: content is empty');
  }

  const importance = Math.max(0, Math.min(1, input.importance ?? 0.5));
  const { entityType, entityId } = resolveEntity(input.spaceId, input.contactId, input.dealId);

  // Embed first. If embedding fails, throw — partial writes (a row without
  // a vector) are useless for semantic recall. Python is more permissive;
  // we're stricter so callers don't silently lose recall capability.
  const vec = await embed(cleaned);

  const { data, error } = await supabase
    .from('AgentMemory')
    .insert({
      spaceId: input.spaceId,
      entityType,
      entityId,
      memoryType: input.kind,
      content: cleaned,
      embedding: vectorLiteral(vec),
      importance,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`storeMemory: insert failed: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error('storeMemory: insert returned no id');
  }
  return { id: data.id };
}

// ── Recall ─────────────────────────────────────────────────────────────────

export interface RecallMemoryInput {
  spaceId: string;
  query: string;
  /** Default 6. Capped at 50 to keep responses sane. */
  k?: number;
  /** Friendly alias for the DB's `memoryType`. */
  kind?: MemoryKind;
  contactId?: string;
  dealId?: string;
  /** 0-1 floor. 0 = return everything ranked. Default 0. */
  minSimilarity?: number;
}

interface RpcRow {
  id: string;
  content: string;
  memoryType: MemoryKind;
  entityType: MemoryEntityType | null;
  entityId: string | null;
  importance: number;
  similarity: number;
  createdAt: string;
}

export async function recallMemory(input: RecallMemoryInput): Promise<MemoryEntry[]> {
  const cleaned = (input.query ?? '').trim();
  if (!cleaned) {
    throw new Error('recallMemory: query is empty');
  }

  const k = Math.max(1, Math.min(50, input.k ?? 6));
  const queryVec = await embed(cleaned);

  // Translate caller filters to (entityType, entityId). Unlike storeMemory
  // we don't fall back to space — caller may want a workspace-wide search.
  let filterEntityType: MemoryEntityType | null = null;
  let filterEntityId: string | null = null;
  if (input.contactId) {
    filterEntityType = 'contact';
    filterEntityId = input.contactId;
  } else if (input.dealId) {
    filterEntityType = 'deal';
    filterEntityId = input.dealId;
  }

  const { data, error } = await supabase.rpc('match_agent_memory', {
    query_embedding: vectorLiteral(queryVec),
    match_space_id: input.spaceId,
    match_count: k,
    filter_memory_type: input.kind ?? null,
    filter_entity_type: filterEntityType,
    filter_entity_id: filterEntityId,
    min_similarity: input.minSimilarity ?? 0,
  });

  if (error) {
    throw new Error(`recallMemory: rpc failed: ${error.message}`);
  }

  const rows = (data ?? []) as RpcRow[];
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    kind: r.memoryType,
    createdAt: r.createdAt,
    similarity: typeof r.similarity === 'number' ? r.similarity : undefined,
    importance: r.importance,
    entityType: r.entityType,
    entityId: r.entityId,
  }));
}
