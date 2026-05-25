"""
Composio integration loader for the Modal agent.

Mirrors the TypeScript-side wiring in `lib/ai-tools/sdk-chat.ts` →
`loadIntegrationTools(ctx)`. Without this, the production Modal runtime
has no awareness of the realtor's connected toolkits — every chat and
every autonomous run starts with zero integration tools regardless of
how many apps the realtor has connected.

Contract:
- `entity_id` is the realtor's Clerk userId. Composio scopes connections
  per entity, and our `IntegrationConnection` table also indexes by
  `userId` (Clerk). The Next.js callback persists with the Clerk userId,
  so this side reads with the same key.
- `space_id` is the workspace. We read active toolkits from the
  workspace + user pair so a brokerage with multiple realtors loads the
  right one's connections.
- Auth-error reconcile: when Composio reports `CONNECTED_ACCOUNT_*` /
  401 / 403 for a specific toolkit, we flip our row to `expired` so the
  /settings panel shows amber + Reconnect on the next visit. Mirrors
  `markExpiredByToolkit` in TypeScript.

Returns a list of agent tools ready to be passed into
`Agent(tools=[...])`. Empty list on any failure — chat keeps working
on the native catalog. A Composio outage must not take down chat.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

import structlog

from db import supabase

logger = structlog.get_logger()


def composio_configured() -> bool:
    """True when COMPOSIO_API_KEY is set. Modal secret must include it."""
    return bool(os.environ.get("COMPOSIO_API_KEY"))


async def active_toolkits(space_id: str, user_id: str) -> list[str]:
    """Toolkit slugs the realtor has connected and our DB has marked active."""
    db = await supabase()
    res = await (
        db.table("IntegrationConnection")
        .select("toolkit")
        .eq("spaceId", space_id)
        .eq("userId", user_id)
        .eq("status", "active")
        .execute()
    )
    rows = res.data or []
    return [r["toolkit"] for r in rows if r.get("toolkit")]


async def mark_expired_by_toolkit(
    space_id: str, user_id: str, toolkit: str, reason: str
) -> None:
    """Flip the row to 'expired' so /settings shows amber + Reconnect."""
    db = await supabase()
    try:
        # Find the active row for this triple.
        find_res = await (
            db.table("IntegrationConnection")
            .select("id,status")
            .eq("spaceId", space_id)
            .eq("userId", user_id)
            .eq("toolkit", toolkit)
            .eq("status", "active")
            .maybe_single()
            .execute()
        )
        row = find_res.data
        if not row:
            return  # already gone or already expired
        await (
            db.table("IntegrationConnection")
            .update(
                {
                    "status": "expired",
                    "lastError": reason[:500],
                    "updatedAt": "now()",
                }
            )
            .eq("id", row["id"])
            .execute()
        )
        logger.info(
            "integration_marked_expired_from_modal",
            space_id=space_id,
            toolkit=toolkit,
            reason=reason[:200],
        )
    except Exception as err:  # noqa: BLE001 - best-effort write
        logger.warning(
            "integration_mark_expired_failed",
            space_id=space_id,
            toolkit=toolkit,
            error=str(err)[:200],
        )


def _is_auth_like_error(err: Exception) -> bool:
    """Match Composio's auth-failure shapes. Mirrors isAuthLikeError() in TS."""
    name = type(err).__name__
    if name == "ComposioConnectedAccountNotFoundError":
        return True
    msg = str(err).lower()
    if "connected_account" in msg:
        return True
    # HTTP status sometimes appears on the exception attrs
    status = getattr(err, "status_code", None) or getattr(err, "statusCode", None)
    if status in (401, 403):
        return True
    return False


def _wrap_for_logging(tool: Any, *, space_id: str, toolkit: str) -> None:
    """Replace tool.on_invoke_tool with a logging wrapper.

    Composio's provider returns FunctionTool instances whose on_invoke_tool
    is the raw execute callable. We swap it for a coroutine that logs the
    input, the result preview, and any exception at info level so we can
    diagnose integration failures from Modal logs without having to enable
    SDK debug logging.
    """
    original = getattr(tool, "on_invoke_tool", None)
    name = getattr(tool, "name", "?")
    if not callable(original):
        return

    async def logged(ctx: Any, payload: Any) -> Any:
        preview_in = (str(payload) or "")[:300]
        logger.info(
            "integration_tool_invoked",
            space_id=space_id,
            toolkit=toolkit,
            tool=name,
            input_preview=preview_in,
        )
        try:
            result = await original(ctx, payload)
        except Exception as err:  # noqa: BLE001
            logger.warning(
                "integration_tool_failed",
                space_id=space_id,
                toolkit=toolkit,
                tool=name,
                error=str(err)[:500],
            )
            raise
        preview_out = (str(result) or "")[:400]
        logger.info(
            "integration_tool_returned",
            space_id=space_id,
            toolkit=toolkit,
            tool=name,
            output_preview=preview_out,
            output_len=len(str(result)) if result is not None else 0,
        )
        return result

    tool.on_invoke_tool = logged


async def load_integration_tools(space_id: str, user_id: str) -> list[Any]:
    """
    Fetch the realtor's connected-toolkit tools as agent-ready Tool objects.

    Returns [] on any failure path so the agent always has SOMETHING to
    work with. A Composio outage degrades the experience (no integrations
    that turn) but never takes chat down.
    """
    if not composio_configured():
        return []

    try:
        toolkits = await active_toolkits(space_id, user_id)
    except Exception as err:  # noqa: BLE001
        logger.warning(
            "active_toolkits_lookup_failed",
            space_id=space_id,
            user_id=user_id,
            error=str(err)[:200],
        )
        return []

    if not toolkits:
        return []

    # Lazy-import — Composio packages are heavy and we don't want them
    # loaded for runs that have no integrations.
    try:
        from composio import Composio
        from composio_openai_agents import OpenAIAgentsProvider
    except ImportError as err:
        logger.error(
            "composio_import_failed",
            error=str(err),
            hint="ensure composio and composio-openai-agents are in agent/pyproject.toml",
        )
        return []

    # to_thread — the Composio client is synchronous; constructing it (and
    # especially tools.get below) does blocking network I/O that would
    # otherwise stall the whole event loop for every chat and autonomous run.
    composio = await asyncio.to_thread(
        Composio,
        api_key=os.environ["COMPOSIO_API_KEY"],
        provider=OpenAIAgentsProvider(),
    )

    # Per-toolkit load so a single dead connection doesn't poison the
    # batch. Mirrors the TypeScript loop. N is small (typically 2-5
    # connected apps per realtor).
    collected: list[Any] = []
    for toolkit in toolkits:
        try:
            # limit=1000 (server max) — without it, Composio's /api/v3/tools
            # endpoint defaults to 20 items per page and the SDK doesn't
            # paginate. That cap silently truncated HubSpot to its
            # alphabetically-first 20 actions (archive/association only),
            # making the realtor's 100+ enabled slugs invisible to the
            # agent. Mirrors the same fix on lib/integrations/composio.ts.
            tools = await asyncio.to_thread(
                composio.tools.get, user_id, toolkits=[toolkit], limit=1000
            )
            if tools:
                # Wrap each tool's on_invoke_tool to surface inputs/outputs
                # at info level. Without this, integration tool calls are
                # invisible in Modal logs and any failure looks like the
                # model fumbling.
                for t in tools:
                    _wrap_for_logging(t, space_id=space_id, toolkit=toolkit)
                collected.extend(tools)
        except Exception as err:  # noqa: BLE001
            if _is_auth_like_error(err):
                # Await it: a bare asyncio.create_task can be garbage-
                # collected before it runs, and a short-lived Modal
                # container may tear down first. This is a rare error
                # path — the extra single-row write is negligible.
                await mark_expired_by_toolkit(
                    space_id, user_id, toolkit, str(err)[:500]
                )
                logger.warning(
                    "integration_auth_failed_marked_expired",
                    space_id=space_id,
                    toolkit=toolkit,
                    error=str(err)[:200],
                )
            else:
                logger.warning(
                    "integration_tools_load_failed_skipping",
                    space_id=space_id,
                    toolkit=toolkit,
                    error=str(err)[:200],
                )
            # In all error cases, drop this toolkit's tools and keep going.

    if collected:
        logger.info(
            "integration_tools_loaded",
            space_id=space_id,
            user_id=user_id,
            toolkit_count=len(toolkits),
            tool_count=len(collected),
            toolkits=toolkits,
            tool_slugs=[getattr(t, "name", "?") for t in collected],
        )

    return collected


async def resolve_owner_user_id(space_id: str) -> str | None:
    """
    For autonomous runs (no user in the request), the workspace OWNER is
    the entity whose connections we use. Returns the owner's Clerk userId
    or None if the chain (Space → User → clerkId) is broken.
    """
    db = await supabase()
    try:
        sp = await (
            db.table("Space")
            .select("ownerId")
            .eq("id", space_id)
            .maybe_single()
            .execute()
        )
        if not sp.data:
            return None
        owner_db_id = sp.data.get("ownerId")
        if not owner_db_id:
            return None
        u = await (
            db.table("User")
            .select("clerkId")
            .eq("id", owner_db_id)
            .maybe_single()
            .execute()
        )
        return (u.data or {}).get("clerkId")
    except Exception as err:  # noqa: BLE001
        logger.warning(
            "resolve_owner_user_id_failed",
            space_id=space_id,
            error=str(err)[:200],
        )
        return None
