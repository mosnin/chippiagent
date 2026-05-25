"""Tool primitives — retry with exponential backoff, idempotency caching, and rate limiting.

Usage
-----
Retry a Supabase mutation:
    result = await with_retry(lambda: db.table("Foo").update(patch).execute())

Idempotency decorator (applied INSIDE @function_tool so the
FunctionTool stays the outermost object):
    @function_tool
    @idempotent_tool
    async def create_something(ctx, ...): ...

Rate-limit decorator (also INSIDE @function_tool — same reason):
    @function_tool
    @rate_limited(max_calls=10, window_seconds=3600)
    async def send_email(ctx, ...): ...

    # Or rely on DEFAULT_RATE_LIMITS for known tool names:
    @function_tool
    @rate_limited()
    async def send_sms(ctx, ...): ...
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable

import structlog

from errors import AgentError

log = structlog.get_logger(__name__)

# ── Retry ───────────────────────────────────────────────────────────────────────────────

# Exceptions that are never transient — do not retry.
_NO_RETRY = (ValueError, PermissionError)


async def with_retry(
    coro_fn: Callable,
    max_attempts: int = 3,
    base_delay: float = 1.0,
) -> Any:
    """Call `coro_fn()` up to `max_attempts` times with exponential backoff.

    `coro_fn` must be a zero-argument async callable (use `lambda` or
    `functools.partial` at the call site to bind arguments).

    Back-off schedule (base_delay=1.0): 1 s → 2 s → 4 s
    Never retries: ValueError, PermissionError, or RuntimeError whose message
    starts with "space_disabled:".
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await coro_fn()
        except AgentError as exc:
            # Honour the error taxonomy's retryable flag — a non-retryable
            # AgentError (bad args, permission denied) must fail fast instead
            # of burning three attempts on a permanent failure.
            if not exc.retryable:
                raise
            last_exc = exc
        except _NO_RETRY as exc:
            raise
        except RuntimeError as exc:
            if str(exc).startswith("space_disabled:"):
                raise
            last_exc = exc
        except Exception as exc:  # noqa: BLE001
            last_exc = exc

        if attempt < max_attempts:
            delay = base_delay * (2 ** (attempt - 1))
            log.warning(
                "tool.retry",
                attempt=attempt,
                max_attempts=max_attempts,
                delay_s=delay,
                error=str(last_exc),
            )
            await asyncio.sleep(delay)

    raise last_exc  # type: ignore[misc]


# ── Idempotency store ─────────────────────────────────────────────────────────────────────

_IDEM: dict[str, dict] = {}
_TTL = timedelta(minutes=5)


class IdempotencyStore:
    """Module-level in-memory idempotency cache (short-lived; process scope)."""

    @staticmethod
    def make_key(tool_name: str, space_id: str, **kwargs: Any) -> str:
        """SHA-256 over tool_name + space_id + sorted kwargs → first 16 hex chars."""
        payload = json.dumps(
            {"tool": tool_name, "space": space_id, **dict(sorted(kwargs.items()))},
            sort_keys=True,
            default=str,
        )
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    @staticmethod
    def check(key: str) -> dict | None:
        """Return cached result if present and not expired; else None."""
        entry = _IDEM.get(key)
        if entry is None:
            return None
        if datetime.now(timezone.utc) > entry["_expires"]:
            del _IDEM[key]
            return None
        return {k: v for k, v in entry.items() if k != "_expires"}

    @staticmethod
    def store(key: str, result: dict) -> None:
        """Cache result with a 5-minute TTL."""
        _IDEM[key] = {**result, "_expires": datetime.now(timezone.utc) + _TTL}


# ── Idempotency decorator ──────────────────────────────────────────────────────────────────

def idempotent_tool(tool_fn: Callable) -> Callable:
    """Decorator for mutation tools that adds idempotency caching.

    The cache key is a hash of (function name + space_id + all positional
    args after ctx + all keyword args). Previously this keyed on only the
    first positional string argument — which silently dropped legitimate
    distinct mutations on the same entity (e.g. `update_contact(id, reason=A)`
    then `update_contact(id, reason=B)` within 5 minutes would return the
    cached A response for the B call). Hashing the full arg set fixes that
    while still deduping true retries (identical args).

    Apply INSIDE @function_tool so the FunctionTool stays the outermost
    object (otherwise the agents SDK sees a plain wrapper function and
    rejects it with "Unknown tool type"):

        @function_tool
        @idempotent_tool
        async def my_mutation_tool(ctx, entity_id: str, ...): ...

    If a cached result is found it is returned immediately with _cached=True.
    Results are only cached on successful (non-exception) execution.
    """
    @wraps(tool_fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        # Locate ctx — it's the first arg, with `.context.space_id`
        ctx = args[0] if args else None
        space_id: str = ""
        try:
            space_id = ctx.context.space_id  # type: ignore[union-attr]
        except AttributeError:
            pass

        # Fingerprint: all positional args after ctx + all kwargs. `default=str`
        # handles non-JSON-native values (Pydantic models, datetimes) without
        # raising; the resulting string is deterministic for repeated calls.
        key = IdempotencyStore.make_key(
            tool_name=tool_fn.__name__,
            space_id=space_id,
            args=list(args[1:]),
            kwargs=kwargs,
        )

        cached = IdempotencyStore.check(key)
        if cached is not None:
            log.info("tool.idempotency_hit", tool=tool_fn.__name__, key=key)
            return {**cached, "_cached": True}

        result = await tool_fn(*args, **kwargs)

        if isinstance(result, dict) and "error" not in result:
            IdempotencyStore.store(key, result)

        return result

    return wrapper


# ── Rate limiting ───────────────────────────────────────────────────────────────────────

# Per-tool, per-space rate limit state.
# key: "tool_name:space_id" → deque of monotonic timestamps (float)
_RATE_LIMIT_STATE: dict[str, deque] = {}

# Default limits: tool_name → (max_calls, window_seconds)
# "*" is the fallback for any tool not listed here.
DEFAULT_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "send_email": (10, 3600),
    "send_sms": (5, 3600),
    "send_message": (10, 3600),
    "create_deal": (20, 3600),
    "update_contact": (50, 3600),
    "archive_contact": (20, 3600),
    "mark_deal_lost": (10, 3600),
    "*": (100, 3600),  # fallback for unlisted tools
}


class RateLimiter:
    """Sliding-window rate limiter backed by per-key timestamp deques.

    State is process-local and in-memory — intentionally; the agent is
    single-process and we want zero infrastructure for this guard rail.
    """

    @staticmethod
    def check_and_increment(
        tool_name: str,
        space_id: str,
        max_calls: int,
        window_seconds: int,
    ) -> bool:
        """Return True if the call is within the allowed rate, False if exceeded.

        When True is returned the call is recorded; when False the caller is
        expected to raise rather than execute the underlying tool.

        Rate limit state is keyed on ``tool_name:space_id`` — one space's
        usage never affects another space's budget.
        """
        key = f"{tool_name}:{space_id}"
        now = time.monotonic()
        window_start = now - window_seconds

        if key not in _RATE_LIMIT_STATE:
            _RATE_LIMIT_STATE[key] = deque()

        q = _RATE_LIMIT_STATE[key]

        # Evict timestamps that have fallen outside the current window.
        while q and q[0] < window_start:
            q.popleft()

        if len(q) >= max_calls:
            return False  # limit exceeded — do not record

        q.append(now)
        return True


def rate_limited(
    max_calls: int | None = None,
    window_seconds: int | None = None,
) -> Callable:
    """Decorator that enforces a per-space sliding-window rate limit.

    Apply INSIDE ``@function_tool`` so the FunctionTool stays the outermost
    object (otherwise the agents SDK rejects the wrapper with
    "Unknown tool type").

    Parameters
    ----------
    max_calls:
        Maximum calls allowed within ``window_seconds``.  If omitted,
        ``DEFAULT_RATE_LIMITS[tool_name]`` is used; falls back to
        ``DEFAULT_RATE_LIMITS["*"]`` for unknown tool names.
    window_seconds:
        Length of the sliding window in seconds.  Same resolution rules as
        ``max_calls``.

    Raises
    ------
    RuntimeError
        ``"rate_limit:{tool_name}:{space_id} (max {N}/{W}s)"`` when the limit
        is exceeded.  The ``with_retry`` helper treats RuntimeError as
        potentially transient; callers that want to surface this cleanly should
        catch it before passing through ``with_retry``.
    """
    def decorator(fn: Callable) -> Callable:
        tool_name = fn.__name__

        # Resolve limits: explicit args win; then per-tool default; then "*".
        _defaults = DEFAULT_RATE_LIMITS.get(tool_name, DEFAULT_RATE_LIMITS["*"])
        _max: int = max_calls if max_calls is not None else _defaults[0]
        _window: int = window_seconds if window_seconds is not None else _defaults[1]

        @wraps(fn)
        async def wrapper(ctx: Any, *args: Any, **kwargs: Any) -> Any:
            space_id: str = getattr(
                getattr(ctx, "context", None), "space_id", "unknown"
            )

            allowed = RateLimiter.check_and_increment(
                tool_name, space_id, _max, _window
            )

            if not allowed:
                log.warning(
                    "tool.rate_limit_exceeded",
                    tool=tool_name,
                    space_id=space_id,
                    max_calls=_max,
                    window_seconds=_window,
                )
                raise RuntimeError(
                    f"rate_limit:{tool_name}:{space_id} (max {_max}/{_window}s)"
                )

            return await fn(ctx, *args, **kwargs)

        return wrapper

    return decorator


# ── Result inspection ─────────────────────────────────────────────────────────────────────

def result_is_ok(output: Any) -> bool:
    """Whether a tool result represents success.

    Tools return a dict; a failure carries an "error" key (see idempotent_tool,
    which only caches dicts without one). The Agents SDK sometimes serializes
    the output to a JSON string, so parse that too. Unknown shapes default to
    ok — never report a working tool as failed.
    """
    if isinstance(output, dict):
        return "error" not in output
    if isinstance(output, str):
        try:
            parsed = json.loads(output)
        except (json.JSONDecodeError, ValueError):
            return True
        if isinstance(parsed, dict):
            return "error" not in parsed
    return True
