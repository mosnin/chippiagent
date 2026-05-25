// Vector storage backed by Supabase pgvector.
// Replaces the previous Zilliz/Milvus integration — same exported interface so
// lib/vectorize.ts and lib/ai.ts require no import changes.

import { supabase } from '@/lib/supabase';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Format a number[] into the Postgres vector literal expected by pgvector. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Upsert (insert or replace) a single embedding row.
 * The `id` is a stable composite key like `contact_<uuid>` or `deal_<uuid>`.
 */
export async function upsertVector(
  spaceId: string,
  id: string,
  entityType: 'contact' | 'deal',
  entityId: string,
  text: string,
  vector: number[]
): Promise<void> {
  const { error } = await supabase.from('DocumentEmbedding').upsert(
    {
      id,
      spaceId,
      entityType,
      entityId,
      content: text,
      embedding: toVectorLiteral(vector),
    },
    { onConflict: 'id' }
  );

  if (error) throw error;
}

/**
 * Delete the embedding row for a given composite id.
 * The spaceId guard ensures a user can only delete their own vectors.
 */
export async function deleteVector(spaceId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('DocumentEmbedding')
    .delete()
    .eq('id', id)
    .eq('spaceId', spaceId);

  if (error) throw error;
}

/**
 * Return the topK most similar documents for the given query vector,
 * scoped strictly to the caller's spaceId so users never see each other's data.
 *
 * If `queryText` is provided, runs hybrid retrieval: BM25 (Postgres
 * tsvector) + cosine fused via RRF. The BM25 leg fixes the failure mode
 * where pure semantic search loses on exact-string matches — addresses
 * ("123 Oak St"), MLS numbers, contact names. When `queryText` is omitted
 * the function degrades to the original cosine-only behavior (caller
 * doesn't have to know which RPC ran).
 */
export async function searchVectors(
  spaceId: string,
  queryVector: number[],
  topK = 5,
  queryText?: string,
): Promise<Array<{ entity_type: string; entity_id: string; text: string; score: number }>> {
  // When we have the source text, prefer the hybrid RPC. The score it
  // returns is the RRF score (sum of 1/(60+rank) across the two legs),
  // not a cosine similarity — different scale, same ordering semantics
  // for the caller's purposes.
  if (queryText && queryText.trim().length > 0) {
    const { data, error } = await supabase.rpc('match_documents_hybrid', {
      query_embedding: toVectorLiteral(queryVector),
      query_text: queryText,
      match_space_id: spaceId,
      match_count: topK,
    });

    if (!error) {
      return (data ?? []).map((row: {
        entity_type: string;
        entity_id: string;
        content: string;
        score: number;
      }) => ({
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        text: row.content,
        score: row.score,
      }));
    }
    // Hybrid RPC missing (migration not yet run on this env) → fall through
    // to cosine-only so callers don't break during the migration window.
    if (!String(error?.message ?? '').match(/match_documents_hybrid/i)) {
      throw error;
    }
  }

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: toVectorLiteral(queryVector),
    match_space_id: spaceId,
    match_count: topK,
  });

  if (error) throw error;

  return (data ?? []).map((row: {
    entity_type: string;
    entity_id: string;
    content: string;
    similarity: number;
  }) => ({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    text: row.content,
    score: row.similarity,
  }));
}
