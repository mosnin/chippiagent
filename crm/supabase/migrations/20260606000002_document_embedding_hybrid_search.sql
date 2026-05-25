-- DocumentEmbedding: add lexical search alongside the existing cosine path.
--
-- Why hybrid: pure semantic search loses to exact-string matches on
-- addresses ("123 Oak St"), MLS numbers, contact names, deal titles —
-- the embedding squashes the literal token into a fuzzy region of vector
-- space, and "123 Oak St" returns "Oak St condo" before it returns the
-- actual address row. BM25 (Postgres tsvector + ts_rank_cd) gets the
-- exact match right; cosine gets the semantic match right. RRF
-- (Reciprocal Rank Fusion) combines them without needing to normalize
-- score scales.
--
-- The Anthropic Contextual Retrieval research showed this hybrid pattern
-- cuts retrieval failure ~49% vs. cosine-only. Cheap to add; meaningful
-- to add.
--
-- The original match_documents RPC stays; callers can migrate to
-- match_documents_hybrid on their own schedule. Idempotent.

-- ── tsvector column (GENERATED ALWAYS — never goes stale) ────────────────────

ALTER TABLE "DocumentEmbedding"
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "DocumentEmbedding_tsv_gin_idx"
  ON "DocumentEmbedding" USING GIN (tsv);

-- ── Hybrid search RPC ────────────────────────────────────────────────────────
--
-- Reciprocal Rank Fusion: each document's score is the sum of 1/(k+rank)
-- across both ranked result sets. k=60 is the conventional constant from
-- the original RRF paper; lower k weights top results more aggressively,
-- higher k flattens. 60 is the well-tested default.
--
-- We fetch 4× match_count from each side before fusing so a document
-- ranked low on one side but high on the other still has a chance to
-- surface. The final LIMIT applies after fusion.
--
-- query_text can be empty/null; in that case we degrade to pure cosine
-- (callers without a text version of the query get the same behavior as
-- the original match_documents).

CREATE OR REPLACE FUNCTION match_documents_hybrid(
  query_embedding vector(1536),
  query_text      text,
  match_space_id  text,
  match_count     int DEFAULT 5,
  rrf_k           int DEFAULT 60
)
RETURNS TABLE (
  id          text,
  entity_type text,
  entity_id   text,
  content     text,
  score       float
)
LANGUAGE plpgsql
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  -- plainto_tsquery handles user input safely (no need to escape operators).
  -- Returns null if the text strips to nothing after stop-word removal;
  -- the BM25 leg then yields zero rows and the result reduces to cosine.
  IF query_text IS NOT NULL AND length(trim(query_text)) > 0 THEN
    ts_query := plainto_tsquery('english', query_text);
  ELSE
    ts_query := NULL;
  END IF;

  RETURN QUERY
  WITH cosine_results AS (
    SELECT
      de.id,
      ROW_NUMBER() OVER (ORDER BY de.embedding <=> query_embedding) AS rank
    FROM "DocumentEmbedding" de
    WHERE de."spaceId" = match_space_id
      AND de.embedding IS NOT NULL
    ORDER BY de.embedding <=> query_embedding
    LIMIT match_count * 4
  ),
  bm25_results AS (
    SELECT
      de.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(de.tsv, ts_query) DESC
      ) AS rank
    FROM "DocumentEmbedding" de
    WHERE de."spaceId" = match_space_id
      AND ts_query IS NOT NULL
      AND de.tsv @@ ts_query
    ORDER BY ts_rank_cd(de.tsv, ts_query) DESC
    LIMIT match_count * 4
  ),
  fused AS (
    SELECT
      COALESCE(c.id, b.id) AS id,
      (CASE WHEN c.rank IS NOT NULL THEN 1.0 / (rrf_k + c.rank) ELSE 0 END) +
      (CASE WHEN b.rank IS NOT NULL THEN 1.0 / (rrf_k + b.rank) ELSE 0 END) AS score
    FROM cosine_results c
    FULL OUTER JOIN bm25_results b ON c.id = b.id
  )
  SELECT
    de.id,
    de."entityType"  AS entity_type,
    de."entityId"    AS entity_id,
    de.content,
    f.score::float
  FROM fused f
  JOIN "DocumentEmbedding" de ON de.id = f.id
  WHERE f.score > 0
  ORDER BY f.score DESC
  LIMIT match_count;
END;
$$;
