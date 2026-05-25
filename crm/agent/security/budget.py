"""Per-space autonomous-run controls via Upstash Redis.

Two guards, both keyed per space:

  - Daily token budget. Each space gets a rolling daily cap; once it is
    spent the agent skips inference for that space until midnight UTC.
  - Run lock. One autonomous run per space at a time — stops concurrent
    runs from double-drafting and from racing the budget check.

Keys:
  agent:budget:{space_id}:{YYYY-MM-DD}  →  tokens_used (int, expires in 48h)
  agent:runlock:{space_id}              →  run_id      (auto-expires)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from upstash_redis.asyncio import Redis

from config import settings

logger = logging.getLogger(__name__)

_redis: Redis | None = None


def _get_redis() -> Redis | None:
    global _redis
    if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
        return None
    if _redis is None:
        _redis = Redis(url=settings.kv_rest_api_url, token=settings.kv_rest_api_token)
    return _redis


def _today_key(space_id: str) -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"agent:budget:{space_id}:{date}"


async def check_budget(space_id: str, daily_limit: int) -> bool:
    """Return True if the space has budget remaining for today.

    Fails OPEN on a Redis error so a transient Upstash outage doesn't crash
    every autonomous run. The per-space run lock still caps concurrency to
    one run, so the over-spend during an outage stays bounded.
    """
    r = _get_redis()
    if r is None:
        return True  # No Redis configured — allow (dev / test)
    key = _today_key(space_id)
    try:
        used = await r.get(key)
    except Exception as exc:
        logger.warning(
            "check_budget_redis_error space=%s error=%s — failing open",
            space_id, str(exc)[:200],
        )
        return True
    used_int = int(used) if used else 0
    if used_int >= daily_limit:
        logger.warning("agent_budget_exhausted space=%s used=%d limit=%d", space_id, used_int, daily_limit)
        return False
    return True


async def record_usage(space_id: str, tokens: int) -> int:
    """Increment token counter. Returns new total. Expires key after 48 h."""
    r = _get_redis()
    if r is None:
        return tokens
    key = _today_key(space_id)
    new_total = await r.incrby(key, tokens)
    # EXPIRE on every write — idempotent, and the first-write heuristic
    # (new_total == tokens) misses when two runs race the first INCRBY,
    # leaving a key with no TTL that lingers past its day.
    await r.expire(key, 172_800)  # 48 hours
    return new_total


# ---------------------------------------------------------------------------
# Per-space run lock — one autonomous run per space at a time
# ---------------------------------------------------------------------------

# TTL sits above Modal's 600s function timeout: a crashed run's lock always
# clears on its own, so a crash can never wedge a space shut.
_RUN_LOCK_TTL_S = 660


def _run_lock_key(space_id: str) -> str:
    return f"agent:runlock:{space_id}"


async def acquire_run_lock(space_id: str, run_id: str) -> bool:
    """Claim the single-run slot for a space. Returns False when another run
    already holds it.

    SET NX EX is one atomic op, so two runs starting together cannot both
    win the slot. Fails OPEN on a Redis error — a rare outage must not halt
    every autonomous run — but logs it.
    """
    r = _get_redis()
    if r is None:
        return True  # No Redis (dev / test) — don't block runs.
    try:
        ok = await r.set(_run_lock_key(space_id), run_id, nx=True, ex=_RUN_LOCK_TTL_S)
        return bool(ok)
    except Exception as exc:
        logger.warning("acquire_run_lock_failed space=%s error=%s", space_id, str(exc)[:200])
        return True


async def release_run_lock(space_id: str, run_id: str) -> None:
    """Release the run lock — but only if this run still owns it.

    Modal hard-kills a function at 600s, below the 660s TTL, so a run cannot
    outlive its own lock; the ownership check is belt-and-suspenders.
    """
    r = _get_redis()
    if r is None:
        return
    try:
        key = _run_lock_key(space_id)
        if await r.get(key) == run_id:
            await r.delete(key)
    except Exception as exc:
        logger.warning("release_run_lock_failed space=%s error=%s", space_id, str(exc)[:200])
