"""Direct Postgres access via asyncpg, with a thin query-builder shim.

Replaces supabase-py to drop ~30 transitive dependencies (pyiceberg,
pyroaring, mmh3, zstandard, etc.) and skip the postgrest REST hop on every
query. The shim exposes the same fluent interface the tools already use:

    db = await supabase()
    result = await (
        db.table("Contact")
        .select("id,name")
        .eq("spaceId", space_id)
        .ilike("name", "%alex%")
        .order("createdAt", desc=True)
        .limit(20)
        .execute()
    )
    rows = result.data           # list[dict]
    n    = result.count          # int | None (only when count="exact" set)

The shim supports the operations the agent actually uses — everything else
should fail loudly rather than silently doing the wrong thing.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Iterable

import asyncpg

from config import settings


# ---------------------------------------------------------------------------
# Connection pool — lazy, async-safe, single instance per process
# ---------------------------------------------------------------------------

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def _init_codecs(conn: asyncpg.Connection) -> None:
    """Make jsonb columns automatically marshal to/from Python dicts/lists."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _pool_lock:
            if _pool is None:
                if not settings.database_url:
                    raise RuntimeError(
                        "DATABASE_URL is not set. Configure the chippi-secrets "
                        "Modal secret with the direct-Postgres URL."
                    )
                _pool = await asyncpg.create_pool(
                    settings.database_url,
                    min_size=1,
                    max_size=10,
                    init=_init_codecs,
                    statement_cache_size=0,  # pgbouncer compat
                )
    return _pool


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class Result:
    data: Any = None
    count: int | None = None


# ---------------------------------------------------------------------------
# Query builder
# ---------------------------------------------------------------------------

@dataclass
class _Filter:
    column: str
    op: str  # 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'ilike' | 'in' | 'is' | 'is_not'
    value: Any = None


@dataclass
class _OrderBy:
    column: str
    desc: bool = False


@dataclass
class _NotProxy:
    """Implements the `.not_.is_(col, val)` chain."""
    parent: "QueryBuilder"

    def is_(self, column: str, value: Any) -> "QueryBuilder":
        self.parent._filters.append(_Filter(column, "is_not", value))
        return self.parent


@dataclass
class QueryBuilder:
    table: str
    _select: str = "*"
    _count_mode: str | None = None
    _filters: list[_Filter] = field(default_factory=list)
    _or_groups: list[list[_Filter]] = field(default_factory=list)
    _order: list[_OrderBy] = field(default_factory=list)
    _limit: int | None = None
    _single_mode: str | None = None  # 'single' | 'maybe_single'
    _write_kind: str | None = None  # 'insert' | 'update' | 'upsert'
    _payload: Any = None  # dict or list[dict]
    _on_conflict: str | None = None
    _returning: bool = True

    # ── reads ──────────────────────────────────────────────────────────
    def select(self, columns: str = "*", count: str | None = None) -> "QueryBuilder":
        self._select = columns
        self._count_mode = count
        return self

    def eq(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append(_Filter(column, "eq", value))
        return self

    def neq(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append(_Filter(column, "neq", value))
        return self

    def lt(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append(_Filter(column, "lt", value))
        return self

    def lte(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append(_Filter(column, "lte", value))
        return self

    def gt(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append(_Filter(column, "gt", value))
        return self

    def gte(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append(_Filter(column, "gte", value))
        return self

    def ilike(self, column: str, pattern: str) -> "QueryBuilder":
        self._filters.append(_Filter(column, "ilike", pattern))
        return self

    def in_(self, column: str, values: Iterable[Any]) -> "QueryBuilder":
        self._filters.append(_Filter(column, "in", list(values)))
        return self

    def is_(self, column: str, value: Any) -> "QueryBuilder":
        # Both .is_(col, None) and .is_(col, "null") are used in the codebase.
        self._filters.append(_Filter(column, "is", value))
        return self

    @property
    def not_(self) -> _NotProxy:
        return _NotProxy(self)

    def or_(self, expr: str) -> "QueryBuilder":
        """Postgrest-style OR group: 'col.op.val,col2.op.val'.

        Each comma-separated term is parsed into a filter; the group is OR'd
        together at SQL build time.
        """
        terms = [t for t in (s.strip() for s in expr.split(",")) if t]
        group: list[_Filter] = []
        for term in terms:
            parts = term.split(".", 2)
            if len(parts) != 3:
                raise ValueError(f"Bad or_() term: {term!r}")
            col, op, raw = parts
            if op == "is":
                value: Any = None if raw.lower() == "null" else raw
                group.append(_Filter(col, "is", value))
            elif op in ("eq", "neq", "lt", "lte", "gt", "gte", "ilike"):
                group.append(_Filter(col, op, raw))
            else:
                raise ValueError(f"Unsupported or_() op: {op}")
        self._or_groups.append(group)
        return self

    def order(self, column: str, desc: bool = False) -> "QueryBuilder":
        self._order.append(_OrderBy(column, desc))
        return self

    def limit(self, n: int) -> "QueryBuilder":
        self._limit = n
        return self

    def single(self) -> "QueryBuilder":
        self._single_mode = "single"
        self._limit = 1
        return self

    def maybe_single(self) -> "QueryBuilder":
        self._single_mode = "maybe_single"
        self._limit = 1
        return self

    # ── writes ─────────────────────────────────────────────────────────
    def insert(self, payload: dict | list[dict]) -> "QueryBuilder":
        self._write_kind = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict) -> "QueryBuilder":
        self._write_kind = "update"
        self._payload = payload
        return self

    def upsert(self, payload: dict | list[dict], on_conflict: str | None = None) -> "QueryBuilder":
        self._write_kind = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def delete(self) -> "QueryBuilder":
        self._write_kind = "delete"
        return self

    # ── execution ──────────────────────────────────────────────────────
    async def execute(self) -> Result:
        if self._write_kind == "insert":
            return await self._execute_insert()
        if self._write_kind == "update":
            return await self._execute_update()
        if self._write_kind == "upsert":
            return await self._execute_upsert()
        if self._write_kind == "delete":
            return await self._execute_delete()
        return await self._execute_select()

    # ── SQL builders ───────────────────────────────────────────────────
    def _quoted_table(self) -> str:
        return f'"{self.table}"'

    def _quoted_select(self) -> str:
        if self._select == "*":
            return "*"
        out: list[str] = []
        for raw in self._select.split(","):
            c = raw.strip()
            if not c:
                continue
            # Tolerate already-quoted identifiers (legacy supabase-py callers)
            # by stripping surrounding double quotes before re-wrapping.
            if len(c) >= 2 and c.startswith('"') and c.endswith('"'):
                c = c[1:-1]
            out.append(f'"{c}"')
        return ", ".join(out)

    def _build_where(self, params: list[Any], start_idx: int) -> tuple[str, int]:
        """Build the WHERE clause from filters + or_groups. Returns (sql, next_idx)."""
        parts: list[str] = []
        idx = start_idx

        for f in self._filters:
            clause, idx = self._filter_clause(f, params, idx)
            parts.append(clause)

        for group in self._or_groups:
            sub_clauses: list[str] = []
            for f in group:
                clause, idx = self._filter_clause(f, params, idx)
                sub_clauses.append(clause)
            if sub_clauses:
                parts.append("(" + " OR ".join(sub_clauses) + ")")

        if not parts:
            return "", idx
        return "WHERE " + " AND ".join(parts), idx

    def _filter_clause(self, f: _Filter, params: list[Any], idx: int) -> tuple[str, int]:
        col = f'"{f.column}"'
        op = f.op
        if op == "is":
            if f.value is None or (isinstance(f.value, str) and f.value.lower() == "null"):
                return f"{col} IS NULL", idx
            params.append(f.value)
            return f"{col} IS NOT DISTINCT FROM ${idx}", idx + 1
        if op == "is_not":
            if f.value is None or (isinstance(f.value, str) and f.value.lower() == "null"):
                return f"{col} IS NOT NULL", idx
            params.append(f.value)
            return f"{col} IS DISTINCT FROM ${idx}", idx + 1
        if op == "in":
            if not f.value:
                return "FALSE", idx
            placeholders = []
            for v in f.value:
                params.append(v)
                placeholders.append(f"${idx}")
                idx += 1
            return f"{col} IN ({', '.join(placeholders)})", idx
        sql_op = {
            "eq": "=", "neq": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">=",
            "ilike": "ILIKE",
        }.get(op)
        if sql_op is None:
            raise ValueError(f"Unsupported filter op: {op}")
        params.append(f.value)
        return f"{col} {sql_op} ${idx}", idx + 1

    # ── execute paths ──────────────────────────────────────────────────
    async def _execute_select(self) -> Result:
        params: list[Any] = []
        where_sql, _ = self._build_where(params, 1)

        order_sql = ""
        if self._order:
            order_sql = "ORDER BY " + ", ".join(
                f'"{o.column}" {"DESC" if o.desc else "ASC"}' for o in self._order
            )

        limit_sql = f"LIMIT {int(self._limit)}" if self._limit is not None else ""

        sql = " ".join(
            p for p in (
                f"SELECT {self._quoted_select()} FROM {self._quoted_table()}",
                where_sql,
                order_sql,
                limit_sql,
            ) if p
        )

        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
            data = [dict(r) for r in rows]

            count: int | None = None
            if self._count_mode == "exact":
                count_params: list[Any] = []
                count_where, _ = self._build_where(count_params, 1)
                count_sql = f"SELECT COUNT(*) AS c FROM {self._quoted_table()} {count_where}".strip()
                count_row = await conn.fetchrow(count_sql, *count_params)
                count = int(count_row["c"]) if count_row else 0

        if self._single_mode == "maybe_single":
            return Result(data=(data[0] if data else None), count=count)
        if self._single_mode == "single":
            if not data:
                raise RuntimeError("single() expected one row, got 0")
            return Result(data=data[0], count=count)
        return Result(data=data, count=count)

    async def _execute_insert(self) -> Result:
        rows = self._payload if isinstance(self._payload, list) else [self._payload]
        if not rows:
            return Result(data=[])
        cols = list(rows[0].keys())
        col_sql = ", ".join(f'"{c}"' for c in cols)

        params: list[Any] = []
        value_clauses: list[str] = []
        for row in rows:
            placeholders = []
            for c in cols:
                params.append(row.get(c))
                placeholders.append(f"${len(params)}")
            value_clauses.append("(" + ", ".join(placeholders) + ")")

        returning = " RETURNING *" if self._returning else ""
        sql = (
            f"INSERT INTO {self._quoted_table()} ({col_sql}) "
            f"VALUES {', '.join(value_clauses)}{returning}"
        )
        pool = await _get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetch(sql, *params)
            return Result(data=[dict(r) for r in result])

    async def _execute_update(self) -> Result:
        assert isinstance(self._payload, dict)
        params: list[Any] = []
        set_parts = []
        for k, v in self._payload.items():
            params.append(v)
            set_parts.append(f'"{k}" = ${len(params)}')

        where_sql, _ = self._build_where(params, len(params) + 1)
        if not where_sql:
            raise RuntimeError(
                "update() without filters is refused — guards against a "
                "full-table overwrite."
            )

        returning = " RETURNING *" if self._returning else ""
        sql = (
            f"UPDATE {self._quoted_table()} SET {', '.join(set_parts)} "
            f"{where_sql}{returning}"
        ).strip()

        pool = await _get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetch(sql, *params)
            return Result(data=[dict(r) for r in result])

    async def _execute_delete(self) -> Result:
        params: list[Any] = []
        where_sql, _ = self._build_where(params, 1)
        if not where_sql:
            raise RuntimeError(
                "delete() without filters is refused — guards against catastrophic deletes."
            )
        returning = " RETURNING *" if self._returning else ""
        sql = f"DELETE FROM {self._quoted_table()} {where_sql}{returning}"
        pool = await _get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetch(sql, *params)
            return Result(data=[dict(r) for r in result])

    async def _execute_upsert(self) -> Result:
        rows = self._payload if isinstance(self._payload, list) else [self._payload]
        if not rows:
            return Result(data=[])

        # Take the union of keys across rows so optional fields land as NULL.
        cols: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for k in row.keys():
                if k not in seen:
                    seen.add(k)
                    cols.append(k)

        col_sql = ", ".join(f'"{c}"' for c in cols)

        params: list[Any] = []
        value_clauses: list[str] = []
        for row in rows:
            placeholders = []
            for c in cols:
                params.append(row.get(c))
                placeholders.append(f"${len(params)}")
            value_clauses.append("(" + ", ".join(placeholders) + ")")

        conflict_target = self._on_conflict or ""
        if conflict_target:
            conflict_target = f'("{conflict_target}")'

        update_cols = [c for c in cols if c != self._on_conflict]
        update_set = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
        if update_set:
            on_conflict_clause = f"ON CONFLICT {conflict_target} DO UPDATE SET {update_set}"
        else:
            on_conflict_clause = f"ON CONFLICT {conflict_target} DO NOTHING"

        returning = " RETURNING *" if self._returning else ""
        sql = (
            f"INSERT INTO {self._quoted_table()} ({col_sql}) "
            f"VALUES {', '.join(value_clauses)} {on_conflict_clause}{returning}"
        )

        pool = await _get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetch(sql, *params)
            return Result(data=[dict(r) for r in result])


# ---------------------------------------------------------------------------
# RPC — call a Postgres function: db.rpc("fn", {...}).execute()
# ---------------------------------------------------------------------------

@dataclass
class _RpcCall:
    """Invoke a Postgres function with named arguments.

    Named-arg invocation means the params dict maps straight onto the
    function's parameter names, order-independent. Returns the function's
    result set as rows — same shape as a SELECT.
    """
    function: str
    params: dict[str, Any]

    async def execute(self) -> Result:
        keys = list(self.params.keys())
        if keys:
            arg_sql = ", ".join(f'"{k}" => ${i + 1}' for i, k in enumerate(keys))
            values = [self.params[k] for k in keys]
        else:
            arg_sql = ""
            values = []
        sql = f'SELECT * FROM "{self.function}"({arg_sql})'
        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *values)
            return Result(data=[dict(r) for r in rows])


# ---------------------------------------------------------------------------
# Public client — drop-in replacement for the old `await supabase()` call
# ---------------------------------------------------------------------------

class Client:
    """Minimal client exposing the .table(...) and .rpc(...) entrypoints."""

    def table(self, name: str) -> QueryBuilder:
        return QueryBuilder(table=name)

    def rpc(self, function: str, params: dict[str, Any] | None = None) -> _RpcCall:
        return _RpcCall(function=function, params=params or {})


_client = Client()


async def supabase() -> Client:
    """Return the singleton client. Preserves the existing `await supabase()` API."""
    # Trigger pool creation eagerly so the first real query doesn't pay it.
    await _get_pool()
    return _client


async def get_pool() -> asyncpg.Pool:
    """Public accessor for the asyncpg pool.

    Use this when you need raw SQL — vector similarity search, complex CTEs,
    anything the QueryBuilder doesn't cover. Most code should keep using the
    fluent API via `supabase()`.
    """
    return await _get_pool()


async def close_pool() -> None:
    """Tear down the pool. Useful in tests; Modal functions don't need it."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
