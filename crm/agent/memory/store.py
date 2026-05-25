"""Persistent agent memory via pgvector.

Memories accumulate across runs so the agent builds understanding over
time. Each new memory is embedded with text-embedding-3-small (1536 dims,
matches the schema column) and stored alongside the content. Recall has
two modes:

  - keyed: load_memories(entity_id=...) — direct lookup by entity, ordered
    by importance. Used at run start to inject context for a known contact
    or deal.
  - semantic: search_similar(query=...) — pgvector cosine similarity. Used
    when the agent has a topic in mind ("anything about pre-approval?")
    but doesn't know which entity to look at.

Both paths are spaceId-scoped at the SQL layer; cross-tenant leak is
impossible by construction.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from asyncpg.exceptions import UndefinedColumnError
from openai import AsyncOpenAI

from db import get_pool, supabase
from llm import EMBEDDING_MODEL, get_llm_client

_EMBED_MODEL = EMBEDDING_MODEL
_EMBED_DIMS = 1536

_openai: AsyncOpenAI | None = None

logger = logging.getLogger(__name__)

# Kill-switch cache: space_id -> (is_disabled, expires_at_timestamp)
_kill_switch_cache: dict[str, tuple[bool, float]] = {}
_KILL_SWITCH_TTL = 30.0  # seconds


def _client() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        _openai = get_llm_client()
    return _openai


async def _embed(text: str) -> list[float] | None:
    """Embed a string. Returns None on failure so save still proceeds without
    a vector — the row will be searchable by entity but not by similarity."""
    try:
        cleaned = (text or "").strip()
        if not cleaned:
            return None
        # Embed model has a token cap; keep payload sane. ~8k chars is well
        # under the 8191 token limit for text-embedding-3-small.
        if len(cleaned) > 8000:
            cleaned = cleaned[:8000]
        res = await _client().embeddings.create(model=_EMBED_MODEL, input=cleaned)
        vec = res.data[0].embedding
        if len(vec) != _EMBED_DIMS:
            return None
        return list(vec)
    except Exception:
        return None


def _vector_literal(vec: list[float]) -> str:
    """pgvector accepts string form: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


async def is_space_disabled(space_id: str) -> bool:
    """Check whether a space is currently disabled via the kill switch.

    Results are cached for 30 seconds to avoid hammering the DB on every
    memory operation. Fails open on DB errors — memory ops should not be
    blocked by a transient DB issue.
    """
    now = time.monotonic()
    cached = _kill_switch_cache.get(space_id)
    if cached is not None:
        value, expires_at = cached
        if now < expires_at:
            return value

    try:
        db = await supabase()
        result = await (
            db.table("DisabledSpace")
            .select("id")
            .eq("spaceId", space_id)
            .eq("isActive", True)
            .maybe_single()
            .execute()
        )
        is_disabled = result.data is not None
    except Exception:
        logger.warning("is_space_disabled: DB error for space %s — failing open", space_id)
        return False

    _kill_switch_cache[space_id] = (is_disabled, now + _KILL_SWITCH_TTL)
    return is_disabled


async def load_memories(
    space_id: str,
    entity_id: str | None = None,
    entity_type: str | None = None,
    memory_type: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Load memories for a space, optionally scoped to an entity. Keyed lookup
    only — no similarity ranking. For semantic recall use search_similar."""
    db = await supabase()

    query = (
        db.table("AgentMemory")
        .select("id,entityType,entityId,memoryType,content,importance,createdAt,updatedAt")
        .eq("spaceId", space_id)
        .order("importance", desc=True)
        .order("createdAt", desc=True)
        .limit(limit)
    )

    if entity_id:
        query = query.eq("entityId", entity_id)
    if entity_type:
        query = query.eq("entityType", entity_type)
    if memory_type:
        query = query.eq("memoryType", memory_type)

    result = await query.execute()
    return result.data or []


async def search_similar(
    space_id: str,
    query: str,
    limit: int = 8,
    entity_type: str | None = None,
    entity_id: str | None = None,
    min_similarity: float = 0.0,
) -> list[dict[str, Any]]:
    """Semantic recall via pgvector cosine similarity. Returns up to `limit`
    memories ranked by similarity to `query`, scoped to the space.

    min_similarity: 0.0–1.0 floor (1.0 = identical). Filters out weak matches
    so the agent doesn't get noise. Default 0.0 returns everything ranked.
    """
    vec = await _embed(query)
    if vec is None:
        # Embedding failed (no API key, network error, etc.). Fall back to
        # the keyed loader so the caller still gets *something* useful.
        return await load_memories(
            space_id=space_id,
            entity_id=entity_id,
            entity_type=entity_type,
            limit=limit,
        )

    pool = await get_pool()
    vec_lit = _vector_literal(vec)

    # Cosine distance: 1 - cosine_similarity. pgvector exposes <=> for it.
    # similarity = 1 - distance.
    sql = """
        SELECT id, "entityType", "entityId", "memoryType", content, importance,
               "createdAt", "updatedAt",
               1 - (embedding <=> $1::vector) AS similarity
          FROM "AgentMemory"
         WHERE "spaceId" = $2
           AND embedding IS NOT NULL
    """
    params: list[Any] = [vec_lit, space_id]
    if entity_type is not None:
        params.append(entity_type)
        sql += f' AND "entityType" = ${len(params)}'
    if entity_id is not None:
        params.append(entity_id)
        sql += f' AND "entityId" = ${len(params)}'
    if min_similarity > 0:
        params.append(float(min_similarity))
        sql += f" AND (1 - (embedding <=> $1::vector)) >= ${len(params)}"
    params.append(int(limit))
    sql += f" ORDER BY embedding <=> $1::vector LIMIT ${len(params)}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
        return [dict(r) for r in rows]


async def save_memory(
    space_id: str,
    entity_type: str,
    entity_id: str,
    memory_type: str,
    content: str,
    importance: float = 0.5,
    expires_at: str | None = None,
    task_id: str | None = None,
    source_run_id: str | None = None,
    source_tool_name: str | None = None,
    source_conversation_id: str | None = None,
) -> dict[str, Any]:
    """Persist a memory and embed it for future semantic recall.

    Upsert behaviour: if a memory with the same (spaceId, entityType,
    entityId, memoryType) already exists, its content, importance, and
    embedding are updated in-place rather than creating a duplicate row.
    This keeps the memory pool clean across repeated agent runs.

    Source attribution: the optional source_run_id, source_tool_name, and
    source_conversation_id parameters are stored when provided so every
    memory row can be traced back to the tool/run that created it.
    These columns are added by migration 20260601000007. If the migration
    has not yet run the write falls back gracefully without those columns.

    Embedding failures don't abort the save — the row still lands, just
    without a vector. Better partial than nothing.

    Raises RuntimeError("space_disabled:<space_id>") if the space has been
    disabled via the kill switch. All other DB errors are non-blocking.
    """
    if await is_space_disabled(space_id):
        raise RuntimeError(f"space_disabled:{space_id}")

    pool = await get_pool()
    importance_clamped = max(0.0, min(1.0, importance))

    vec = await _embed(content)
    vec_lit = _vector_literal(vec) if vec is not None else None

    # Check for an existing row with the same natural key so we can upsert.
    # No unique constraint exists on these four columns in the DB schema, so
    # we use a SELECT-first approach rather than ON CONFLICT.
    check_sql = """
        SELECT id FROM "AgentMemory"
        WHERE "spaceId" = $1
          AND "entityType" IS NOT DISTINCT FROM $2
          AND "entityId" IS NOT DISTINCT FROM $3
          AND "memoryType" = $4
        LIMIT 1
    """

    # Semantic dedup — feature-flagged because the failure mode (over-
    # merging two distinct facts that share vocabulary) is hard to detect
    # without an eval. Off by default; flip AGENT_MEMORY_SEMANTIC_DEDUP=1
    # when ready to validate. When on, before the structural-key check we
    # look for an existing memory in this space + same (entityType,
    # entityId) with cosine similarity ≥ 0.92 to the new content. If
    # found, we update that row instead. Threshold is intentionally
    # conservative (0.85 is the Mem0 default; we start higher) — the
    # cost of false-merge here is loss of a real fact, not a duplicate.
    # The (entity_type, entity_id) scope keeps blast radius narrow:
    # facts about different contacts can never accidentally merge.
    semantic_dedup_enabled = os.environ.get("AGENT_MEMORY_SEMANTIC_DEDUP") == "1"
    semantic_match_id: str | None = None
    if semantic_dedup_enabled and vec is not None and entity_type and entity_id:
        try:
            similar = await search_similar(
                space_id=space_id,
                query=content,
                limit=1,
                entity_type=entity_type,
                entity_id=entity_id,
                min_similarity=0.92,
            )
            if similar:
                semantic_match_id = similar[0]["id"]
                logger.info(
                    "save_memory: semantic dedup matched existing row %s "
                    "(space %s, %s/%s)",
                    semantic_match_id, space_id, entity_type, entity_id,
                )
        except Exception as e:
            # A dedup search failure must never block the save. Worst
            # case we get a duplicate row, which the kill switch and
            # the structural check already guard against in most paths.
            logger.warning("save_memory: semantic dedup search failed: %s", e)

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            check_sql, space_id, entity_type, entity_id, memory_type
        )
        # Semantic dedup wins over structural — if both fire, the semantic
        # match is the "this is the same fact, different phrasing" case.
        if semantic_match_id and (not existing or existing["id"] != semantic_match_id):
            existing = {"id": semantic_match_id}

        if existing:
            # UPDATE the existing row: refresh content, importance, embedding,
            # expiry, and source attribution. taskId is left unchanged on
            # update (it was set at insert time for task-scoped memories).
            try:
                update_sql = """
                    UPDATE "AgentMemory"
                    SET content = $1,
                        importance = $2,
                        embedding = $3::vector,
                        "expiresAt" = $4,
                        "sourceRunId" = $5,
                        "sourceToolName" = $6,
                        "sourceConversationId" = $7,
                        "updatedAt" = NOW()
                    WHERE id = $8
                    RETURNING id, "entityType", "entityId", "memoryType",
                              content, importance, "createdAt", "updatedAt"
                """
                row = await conn.fetchrow(
                    update_sql,
                    content, importance_clamped, vec_lit, expires_at,
                    source_run_id, source_tool_name, source_conversation_id,
                    existing["id"],
                )
            except UndefinedColumnError:
                # The source attribution columns don't exist yet (migration
                # 20260601000007 hasn't run). Fall back to updating without
                # them. A transient DB error is deliberately NOT caught here —
                # it must propagate, not be misdiagnosed as a missing column.
                logger.warning(
                    "save_memory: source attribution columns unavailable, "
                    "updating without attribution for space %s", space_id
                )
                update_sql_fallback = """
                    UPDATE "AgentMemory"
                    SET content = $1,
                        importance = $2,
                        embedding = $3::vector,
                        "expiresAt" = $4,
                        "updatedAt" = NOW()
                    WHERE id = $5
                    RETURNING id, "entityType", "entityId", "memoryType",
                              content, importance, "createdAt", "updatedAt"
                """
                row = await conn.fetchrow(
                    update_sql_fallback,
                    content, importance_clamped, vec_lit, expires_at,
                    existing["id"],
                )
        else:
            # INSERT a new row. Try with source attribution columns first;
            # fall back without them if the migration hasn't run yet.
            new_id = str(uuid.uuid4())
            try:
                insert_sql = """
                    INSERT INTO "AgentMemory" (
                        id, "spaceId", "entityType", "entityId", "memoryType",
                        content, importance, embedding, "expiresAt", "taskId",
                        "sourceRunId", "sourceToolName", "sourceConversationId"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10,
                              $11, $12, $13)
                    RETURNING id, "entityType", "entityId", "memoryType",
                              content, importance, "createdAt", "updatedAt"
                """
                row = await conn.fetchrow(
                    insert_sql,
                    new_id, space_id, entity_type, entity_id, memory_type,
                    content, importance_clamped, vec_lit, expires_at, task_id,
                    source_run_id, source_tool_name, source_conversation_id,
                )
            except UndefinedColumnError:
                # The source attribution columns don't exist yet. Fall back to
                # insert without them. A transient DB error is deliberately NOT
                # caught here — it must propagate, not be misdiagnosed as a
                # missing column.
                logger.warning(
                    "save_memory: source attribution columns unavailable, "
                    "inserting without attribution for space %s", space_id
                )
                insert_sql_fallback = """
                    INSERT INTO "AgentMemory" (
                        id, "spaceId", "entityType", "entityId", "memoryType",
                        content, importance, embedding, "expiresAt", "taskId"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10)
                    RETURNING id, "entityType", "entityId", "memoryType",
                              content, importance, "createdAt", "updatedAt"
                """
                row = await conn.fetchrow(
                    insert_sql_fallback,
                    new_id, space_id, entity_type, entity_id, memory_type,
                    content, importance_clamped, vec_lit, expires_at, task_id,
                )

    existing_id = existing["id"] if existing else new_id  # type: ignore[possibly-undefined]
    return dict(row) if row else {
        "id": existing_id, "spaceId": space_id, "entityType": entity_type,
        "entityId": entity_id, "memoryType": memory_type, "content": content,
        "importance": importance_clamped,
    }


async def prune_expired(space_id: str) -> int:
    """Delete memories past their expiry date. Called at run start."""
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    result = await (
        db.table("AgentMemory")
        .delete()
        .eq("spaceId", space_id)
        .lte("expiresAt", now)
        .not_.is_("expiresAt", "null")
        .execute()
    )
    return len(result.data) if result.data else 0


async def format_memories_for_prompt(
    memories: list[dict[str, Any]],
    max_chars: int = 3_000,
) -> str:
    """Render memories as a compact text block for prompt injection.

    Respects max_chars budget. Callers pass memories already ordered by
    relevance (importance for keyed loads, similarity for semantic). Each
    entry is capped at 200 chars so one verbose memory can't crowd out
    the rest.
    """
    if not memories:
        return ""

    header = "## What you already know (from previous runs)\n"
    lines: list[str] = []
    remaining = max_chars - len(header)

    for m in memories:
        content = m["content"]
        if len(content) > 200:
            content = content[:197] + "…"

        entity_label = ""
        if m.get("entityId") and m.get("entityType") != "space":
            entity_label = f" [{m.get('entityType', 'entity')} {m['entityId'][:8]}]"

        line = f"- {content}{entity_label}"
        if remaining - len(line) - 1 < 0:
            lines.append("- (additional memories omitted — budget reached)")
            break
        lines.append(line)
        remaining -= len(line) + 1

    return header + "\n".join(lines)


# json import retained for compat with anything that imported the module
# expecting json to be available there (none currently, but cheap insurance).
_ = json
