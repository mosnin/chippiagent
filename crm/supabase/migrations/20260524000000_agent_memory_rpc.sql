-- AgentMemory pgvector helpers for the TypeScript runtime.
--
-- The "AgentMemory" table itself was created in 20260419000000_agent_tables.sql
-- with these columns (which the Python runtime already writes to):
--
--   id, "spaceId", "entityType", "entityId", "memoryType", content,
--   embedding vector(1536), importance, "expiresAt", "createdAt", "updatedAt"
--
-- We do NOT recreate or fork the table. The TS side reads/writes the same
-- rows. This migration only adds a SECURITY DEFINER RPC for cosine-similarity
-- search, because postgrest can't express `embedding <=> $1::vector` cleanly.
--
-- Filters (kind / contact / deal) all narrow against the same single index;
-- the entityType/entityId pair is how Python expresses contact-vs-deal
-- scoping, and we keep that contract.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION match_agent_memory(
  query_embedding vector(1536),
  match_space_id text,
  match_count int DEFAULT 6,
  filter_memory_type text DEFAULT NULL,
  filter_entity_type text DEFAULT NULL,
  filter_entity_id text DEFAULT NULL,
  min_similarity float DEFAULT 0.0
) RETURNS TABLE (
  id text,
  content text,
  "memoryType" text,
  "entityType" text,
  "entityId" text,
  importance float,
  similarity float,
  "createdAt" timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m."memoryType",
    m."entityType",
    m."entityId",
    m.importance,
    (1 - (m.embedding <=> query_embedding))::float AS similarity,
    m."createdAt"
  FROM "AgentMemory" m
  WHERE m."spaceId" = match_space_id
    AND m.embedding IS NOT NULL
    AND (filter_memory_type IS NULL OR m."memoryType" = filter_memory_type)
    AND (filter_entity_type IS NULL OR m."entityType" = filter_entity_type)
    AND (filter_entity_id   IS NULL OR m."entityId"   = filter_entity_id)
    AND (1 - (m.embedding <=> query_embedding)) >= min_similarity
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
