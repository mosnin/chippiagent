"""Autonomous agent runs.

An autonomous run is kicked off three ways, all landing in
`run_agent_for_space`:
  - the 4-hour cron sweep (`vercel.json` → `/api/cron/agent-sweep`),
  - the "Run now" button,
  - an event trigger drained from the Redis list (`/api/agent/trigger`
    pushes a new lead, a tour completed, a deal stage changed, etc.).

When the trigger list is empty the prompt puts Chippi in sweep mode — look
for stale leads / stalled deals on its own.

Runs are skipped when the agent is disabled for the space or its daily
token budget is exhausted. Every contact-facing action drafts; nothing is
sent without the realtor's approval — that draft-only boundary is the
trust model, so there is no separate pre-run approval gate.

Security: spaceId is set once in AgentContext and flows through
RunContextWrapper. No tool ever accepts spaceId as an argument.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

import structlog
from agents import InputGuardrailTripwireTriggered, ModelSettings, RunConfig, Runner
from openai import APIStatusError, RateLimitError
from openai.types.shared import Reasoning

from config import settings
from db import supabase
from memory.store import format_memories_for_prompt, load_memories, prune_expired, save_memory
from schemas import AgentSettings, Space
from security.budget import acquire_run_lock, check_budget, record_usage, release_run_lock
from security.context import AgentContext
from chippi import load_ai_profile, make_chippi_agent
from llm import extract_usage, fallback_models, resolve_chat_model
from tools.streaming import publish_event
from tools.base import result_is_ok
from trajectories import normalize_tool_call, record_trajectory

# ---------------------------------------------------------------------------
# Model fallback list — fall through these on 429s.
# ---------------------------------------------------------------------------

_FALLBACK_MODELS = fallback_models()

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Per-tool stream-event translator.
#
# Mirrors the translate() in modal_app.py:chat_turn — same SDK events, but
# instead of yielding SSE we hand the caller a {message, metadata} dict so
# the autonomous runner can publish each tool call/result to Redis. This is
# the legibility lift: the previous autonomous path logged the whole run as
# one opaque step, so a sweep that failed at the 4th tool gave the broker
# zero information about which tool failed.
# ---------------------------------------------------------------------------

def _translate_tool_event(event: object) -> dict | None:
    """Map an Agents SDK stream event to a publishable payload, or None.

    Skips token deltas, reasoning deltas, and any other event that isn't a
    tool call or tool result — those are noise for the autonomous trace.
    """
    if type(event).__name__ != "RunItemStreamEvent":
        return None
    it = getattr(event, "item", None)
    if it is None:
        return None
    ev_name = getattr(event, "name", "") or ""
    item_type = getattr(it, "type", "") or type(it).__name__

    if ev_name == "tool_called" or item_type in ("tool_call_item", "ToolCallItem"):
        tool_name = (
            getattr(it, "tool_name", None)
            or getattr(getattr(it, "raw_item", None), "name", None)
            or "tool"
        )
        raw_args = getattr(getattr(it, "raw_item", None), "arguments", None)
        args_str = str(raw_args) if raw_args else ""
        if len(args_str) > 200:
            args_str = args_str[:199] + "…"
        return {
            "message": f"Calling {tool_name}",
            "metadata": {"tool": tool_name, "phase": "start", "args": args_str},
        }

    if ev_name == "tool_output" or item_type in ("tool_call_output_item", "ToolCallOutputItem"):
        tool_name = (
            getattr(it, "tool_name", None)
            or getattr(getattr(it, "raw_item", None), "name", None)
            or "tool"
        )
        output = getattr(it, "output", None)
        summary = "" if output is None else str(output)
        if len(summary) > 300:
            summary = summary[:299] + "…"
        ok = result_is_ok(output)
        return {
            "message": f"{tool_name} done" if ok else f"{tool_name} failed",
            "metadata": {"tool": tool_name, "phase": "complete", "ok": ok, "summary": summary},
        }

    return None


# ---------------------------------------------------------------------------
# Model-fallback runner.
#
# Streams the run via Runner.run_streamed (same path chat_turn uses) so the
# orchestrator can publish per-tool events live. The on_event callback is
# fire-and-forget per event so a slow Redis push never throttles the agent.
# ---------------------------------------------------------------------------

async def _run_with_fallback(
    agent,
    input_data,
    run_config: RunConfig,
    context,
    on_event=None,
) -> object:
    """Run the agent, falling back through _FALLBACK_MODELS on 429/404 errors.

    The agent's model attribute is patched per attempt. Fallback stops the
    moment a tool executes — re-running the agent after a committed side
    effect would duplicate it (a second draft, a second write) — so a
    mid-run error past that point surfaces instead of retrying. On
    exhaustion raises RuntimeError so the caller can surface a clean error.
    `on_event` receives each SDK stream event; it should not raise.
    """
    last_exc: Exception | None = None
    # Once any tool has executed, its side effects are committed; a model
    # fallback would replay the whole run and re-fire them. Past that point
    # an error must surface, not retry.
    tools_ran = False
    # Try the workspace's picked model first (whatever make_chippi_agent
    # built the agent with), then the OpenRouter fallback chain.
    models = [agent.model, *(m for m in _FALLBACK_MODELS if m != agent.model)]
    for i, model in enumerate(models):
        try:
            agent.model = model
            result = Runner.run_streamed(
                agent, input=input_data, run_config=run_config, context=context
            )
            async for event in result.stream_events():
                if not tools_ran and _translate_tool_event(event) is not None:
                    tools_ran = True
                if on_event is not None:
                    try:
                        on_event(event)
                    except Exception:
                        # Telemetry must never break the run.
                        pass
            return result
        except (RateLimitError, APIStatusError) as exc:
            status = getattr(exc, "status_code", None)
            err_str = str(exc)
            lower = err_str.lower()
            # Fall through on a 429 (rate limit) OR a 404/model-not-found — a
            # stale model slug must not hard-fail the whole run.
            should_fallback = (
                isinstance(exc, RateLimitError)
                or status in (429, 404)
                or "429" in err_str
                or "model_not_found" in lower
                or "does not exist" in lower
            )
            if should_fallback and not tools_ran and i < len(models) - 1:
                next_model = models[i + 1]
                logger.warning(
                    "model_falling_back",
                    model=model,
                    next_model=next_model,
                    attempt=i + 1,
                )
                await asyncio.sleep(2)
                last_exc = exc
                continue
            raise
        except Exception as exc:
            err_str = str(exc)
            lower = err_str.lower()
            should_fallback = (
                "429" in err_str
                or "rate_limit" in lower
                or "model_not_found" in lower
                or "does not exist" in lower
            )
            if should_fallback and not tools_ran and i < len(models) - 1:
                next_model = models[i + 1]
                logger.warning(
                    "model_falling_back",
                    model=model,
                    next_model=next_model,
                    attempt=i + 1,
                )
                await asyncio.sleep(2)
                last_exc = exc
                continue
            raise
    raise RuntimeError("All models exhausted") from last_exc


async def pop_triggers(space_id: str) -> list[dict]:
    """Pop pending event triggers for this space from Redis.

    Triggers are pushed by POST /api/agent/trigger when events happen in
    the workspace. The agent gets them in its opening prompt so it can act
    on each one.
    """
    try:
        from upstash_redis.asyncio import Redis
        if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
            return []
        r = Redis(url=settings.kv_rest_api_url, token=settings.kv_rest_api_token)
        key = f"agent:triggers:{space_id}"
        # Atomically pop up to 10 from the head. LPOP-with-count is a single
        # Redis op, so two concurrent runs for the same space can't both read
        # the same items — the lrange+ltrim it replaced was two ops and
        # double-processed triggers whenever runs overlapped.
        items = await r.lpop(key, 10)
        parsed = []
        for item in (items or []):
            try:
                obj = json.loads(item) if isinstance(item, str) else item
                if not isinstance(obj, dict) or "event" not in obj:
                    logger.warning("trigger_malformed", item=str(item)[:100])
                    continue
                parsed.append(obj)
            except Exception:
                logger.warning("trigger_parse_error", item=str(item)[:100])
        return parsed
    except Exception as exc:
        # A Redis outage here is otherwise indistinguishable from "no
        # triggers" — the run would silently drop into sweep mode and
        # never process the queued lead/tour/stage events. Log it.
        logger.warning("pop_triggers_failed", space_id=space_id, error=str(exc)[:200])
        return []


async def requeue_triggers(
    space_id: str, triggers: list[dict], *, increment_attempts: bool
) -> None:
    """Push triggers back onto the queue when a run didn't process them.

    A crashed run would otherwise drop the realtor's events silently. When
    `increment_attempts` is set (a genuine failure) a per-trigger counter
    caps retries — a poison trigger is dropped after 3 attempts rather than
    looping forever; a deferral (guardrail block) re-queues without counting.
    """
    if not triggers:
        return
    try:
        from upstash_redis.asyncio import Redis

        if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
            return
        r = Redis(url=settings.kv_rest_api_url, token=settings.kv_rest_api_token)
        key = f"agent:triggers:{space_id}"
        survivors: list[str] = []
        for t in triggers:
            if increment_attempts:
                attempts = int(t.get("_attempts", 0)) + 1
                if attempts > 3:
                    logger.warning(
                        "trigger_dropped_after_retries",
                        space_id=space_id,
                        event=t.get("event"),
                    )
                    continue
                t["_attempts"] = attempts
            survivors.append(json.dumps(t))
        if survivors:
            # LPUSH to the head so the retry is the next run's first work.
            await r.lpush(key, *reversed(survivors))
    except Exception as exc:
        logger.warning("requeue_triggers_failed", space_id=space_id, error=str(exc)[:200])


def _build_opening_prompt(
    space: Space,
    memory_context: str,
    triggers: list[dict],
    instruction: str | None = None,
) -> str:
    """Frame the autonomous run for Chippi.

    The opening message either carries a routine's standing instruction,
    lists the triggers to act on, or asks for a sweep when nothing fired.
    """
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y at %H:%M UTC")

    if instruction:
        triggers_block = (
            "ROUTINE — a standing instruction the realtor saved for Chippi "
            "to run on a schedule. This run exists to carry it out:\n\n"
            f'"{instruction}"\n\n'
            "Do what it asks, now. If it means reaching out to someone, "
            "DRAFT the message — never send. Finish with log_activity_run "
            "summarising what the routine did."
        )
    elif triggers:
        known = {
            "new_lead",
            "tour_completed",
            "deal_stage_changed",
            "application_submitted",
            "inbound_message",
            "goal_completed",
        }
        lines = []
        for t in triggers:
            event = t.get("event", "")
            # run_now is a bare wake signal (the "Run now" button and its
            # Modal-down fallback). It carries no specific action — drained so
            # the queue empties, then the run falls through to sweep mode.
            if not event or event == "run_now":
                continue
            # An unrecognised event is still a real workspace event — surface
            # it rather than silently dropping it (it was already consumed
            # from Redis). Just flag the producer/consumer drift.
            if event not in known:
                logger.warning("trigger_unknown_event", event=event, space_id=space.id)
            parts = [f"- {event}"]
            if t.get("contactId"):
                parts.append(f"contactId: {t['contactId']}")
            if t.get("dealId"):
                parts.append(f"dealId: {t['dealId']}")
            lines.append("  ".join(parts))
        triggers_block = (
            "Active triggers (act on each one):\n" + "\n".join(lines)
            if lines
            else "Sweep mode — look for stale leads, stalled deals, and deals closing soon."
        )
    else:
        triggers_block = (
            "Sweep mode — no specific trigger fired. Look for stale leads "
            "(7+ days quiet, no follow-up scheduled), stalled deals (no update "
            "in 14+ days), and active deals closing within 14 days. Act on at "
            "most three things."
        )

    # Order optimized for OpenAI implicit prompt caching. Cache hits on the
    # longest common prefix, so anything that changes per-run (current time,
    # triggers) moves to the BOTTOM of the user message. Everything above
    # that line caches across runs of the same space — including the memory
    # block, which is the biggest payload that's stable run-to-run.
    static_header = (
        "AUTONOMOUS RUN\n"
        "Take action where it's warranted. Draft, set follow-ups, store facts. "
        "Don't reply with chat text — log_activity_run with a one-line summary "
        "at the end."
    )
    return (
        f"{static_header}\n\n"
        f"Workspace: {space.name}\n\n"
        f"{memory_context}\n\n"
        f"---\n"
        f"Current time: {now}\n\n"
        f"{triggers_block}"
    ).strip()


async def run_agent_for_space(
    space: Space,
    agent_settings: AgentSettings,
    instruction: str | None = None,
) -> None:
    """Execute one autonomous run for a space.

    Called from Modal `run_now_webhook` (manual "Run now", trigger-queue
    drain, or a routine) and the 4-hour cron sweep. Skips if the agent is
    disabled or the space's daily token budget is exhausted.

    Parameters
    ----------
    space:
        The workspace to run against.
    agent_settings:
        Per-space agent configuration including the enabled flag and the
        daily token budget.
    instruction:
        A routine's standing instruction, when this run was fired by the
        routines cron. When set, the run focuses solely on that instruction
        and leaves the trigger queue untouched for a trigger-driven run.
    """
    # Respect the on/off switch. The realtor can pause Chippi from the
    # header; an autonomous run must honour that.
    if not agent_settings.enabled:
        logger.bind(space_id=space.id, space_slug=space.slug).info("agent_run_skipped_disabled")
        return

    # One autonomous run per space at a time. Two concurrent runs would both
    # sweep the same stale leads and draft the same follow-ups — duplicate
    # drafts in the realtor's inbox — and would both pass the daily-budget
    # check before either recorded usage, overspending the cap. The lock
    # closes both holes and auto-expires past Modal's timeout, so a crash
    # can't wedge the space.
    run_id = str(uuid.uuid4())
    if not await acquire_run_lock(space.id, run_id):
        logger.bind(space_id=space.id, run_id=run_id).info("agent_run_skipped_concurrent")
        return
    try:
        await _run_locked(space, agent_settings, run_id, instruction)
    finally:
        await release_run_lock(space.id, run_id)


async def _run_locked(
    space: Space,
    agent_settings: AgentSettings,
    run_id: str,
    instruction: str | None,
) -> None:
    """Execute one autonomous run with the per-space run lock held.

    Always invoked by `run_agent_for_space`, which owns the lock's
    lifecycle — never call this directly.
    """
    started_at = datetime.now(timezone.utc)
    # Tool-call accumulator for the trajectory record written at end-of-run.
    # Filled by on_event below; passed to record_trajectory on every exit
    # path (success, error, guardrail-blocked). See agent/trajectories.py
    # for why this materialized record exists alongside the per-system logs.
    trajectory_tool_calls: list[dict] = []
    log = logger.bind(space_id=space.id, space_slug=space.slug, run_id=run_id)

    if not await check_budget(space.id, agent_settings.daily_token_budget):
        log.warning("agent_run_skipped_budget_exhausted")
        return

    pruned = await prune_expired(space.id)
    if pruned:
        log.info("memories_pruned", count=pruned)

    space_memories = await load_memories(
        space_id=space.id,
        entity_type="space",
        entity_id=space.id,
        limit=15,
    )
    memory_context = await format_memories_for_prompt(
        space_memories, max_chars=settings.memory_chars_budget
    )

    ctx = AgentContext.from_settings(agent_settings, run_id=run_id, space_name=space.name)
    # A routine run is scoped to its instruction — don't drain the trigger
    # queue out from under a trigger-driven run.
    triggers = [] if instruction else await pop_triggers(space.id)
    if triggers:
        log.info("triggers_found", count=len(triggers), events=[t.get("event") for t in triggers])

    log.info("agent_run_started", trigger_count=len(triggers), routine=bool(instruction))
    await publish_event(
        ctx, "info",
        f"Starting run for '{space.name}'"
        + (" — routine" if instruction else f" — {len(triggers)} trigger(s)" if triggers else " — sweep"),
        agent_type="chippi",
    )

    # Load AI profile for personalization
    db = await supabase()
    ai_profile = await load_ai_profile(space.id, db)

    # Autonomous runs have no "current user" — the workspace OWNER's
    # Clerk userId is the entity whose Composio connections we use.
    # Solo realtors: this is them. Brokerages: it's the broker_owner.
    # Empty list when owner has no integrations or Composio is down.
    integration_tools: list = []
    try:
        from integrations import load_integration_tools, resolve_owner_user_id

        owner_clerk_id = await resolve_owner_user_id(space.id)
        if owner_clerk_id:
            integration_tools = await load_integration_tools(space.id, owner_clerk_id)
    except Exception as ie:  # noqa: BLE001
        log.warning("autonomous_load_integration_tools_failed", error=str(ie)[:200])

    # Workspace info — mirrors the chat path so autonomous drafts include
    # the realtor's intake URL where it's useful.
    _app_url = (settings.app_url or "").rstrip("/")
    # A localhost app_url (NEXT_PUBLIC_APP_URL missing from the Modal secret)
    # must never become a customer-facing intake link in a drafted message.
    if "localhost" in _app_url or "127.0.0.1" in _app_url:
        _app_url = ""
    intake_url = f"{_app_url}/apply/{space.slug}" if _app_url and space.slug else ""
    workspace_info = (
        "# Your workspace\n"
        f"- Workspace: {space.name} (slug: {space.slug})\n"
        f"- Intake link (share with new leads): {intake_url}\n"
        "- Include the intake link in any contact-facing draft where it"
        " makes sense — when reaching out to a fresh lead, when asking a"
        " prospect to qualify, when nudging someone who never finished"
        " applying. Use the full URL verbatim; no shortening."
    ) if intake_url else None

    chippi = make_chippi_agent(
        ai_profile_text=ai_profile,
        extra_tools=integration_tools,
        workspace_info=workspace_info,
        model=resolve_chat_model(agent_settings.chat_model),
    )
    prompt = _build_opening_prompt(space, memory_context, triggers, instruction)

    run_config = RunConfig(
        max_turns=settings.coordinator_max_turns,
        # Tracing exports only reach OpenAI's backend; disable on a pure-
        # OpenRouter deploy, which may carry no OpenAI key at all.
        tracing_disabled=bool(settings.openrouter_api_key),
        model_settings=ModelSettings(
            max_tokens=settings.max_output_tokens,
            truncation="auto",
            # Parity with the chat path. Autonomous runs make unsupervised
            # judgement calls — they need reasoning effort at least as much
            # as chat, where it was already set to "medium".
            reasoning=Reasoning(effort="medium"),
        ),
    )

    total_tokens = 0
    final_summary: str | None = None

    # Per-tool stream emitter — publishes each tool call/result to Redis so
    # the realtor's activity feed and the broker dashboard see what Chippi
    # actually did, not just one opaque "I ran a sweep" summary. Fire-and-
    # forget so the HTTP round-trip never throttles the SDK loop.
    #
    # Also captures the tool call into the trajectory accumulator. The two
    # paths share the same _translate_tool_event payload so the realtor's
    # live view and the offline trajectory record stay in lockstep.
    # Tasks are kept in `publish_tasks` and drained in the finally below — a
    # bare un-referenced create_task can be garbage-collected mid-flight, and
    # the Modal container can tear down before the last events flush.
    publish_tasks: list[asyncio.Task] = []

    def on_event(event: object) -> None:
        payload = _translate_tool_event(event)
        if payload is None:
            return
        trajectory_tool_calls.append(normalize_tool_call(payload))
        publish_tasks.append(
            asyncio.create_task(
                publish_event(
                    ctx,
                    "action",
                    payload["message"],
                    metadata=payload["metadata"],
                    agent_type="chippi",
                )
            )
        )

    try:
        # Run with automatic fallback through cheaper models on a 429.
        # Streaming mode so on_event fires per tool call / result.
        result = await _run_with_fallback(chippi, prompt, run_config, ctx, on_event=on_event)

        _, _, total_tokens = extract_usage(result)
        ctx.tokens_used = total_tokens

        final_output = getattr(result, "final_output", None)
        if isinstance(final_output, str):
            final_summary = final_output[:280]

        log.info("agent_run_completed", total_tokens=total_tokens, model_used=chippi.model)

    except InputGuardrailTripwireTriggered as exc:
        info = exc.guardrail_result.output.output_info or {}
        pending = info.get("pending_drafts", "?")
        log.info("agent_run_blocked_input_guardrail", pending_drafts=pending)
        # Deferred, not failed — re-queue the triggers (no attempt increment)
        # so the events still get processed once the drafts are reviewed.
        await requeue_triggers(space.id, triggers, increment_attempts=False)
        await publish_event(
            ctx, "info",
            f"Run skipped — {pending} draft(s) awaiting review. Review your inbox first.",
            agent_type="chippi",
        )
        await record_trajectory(
            run_id=run_id,
            space_id=space.id,
            started_at=started_at,
            status="guardrail_blocked",
            trigger=(triggers[0] if triggers else None),
            model=chippi.model,
            total_tokens=total_tokens,
            tool_calls=trajectory_tool_calls,
            extra={"pending_drafts": pending},
        )
        return

    except Exception as exc:
        log.exception("agent_run_failed")
        # Re-queue so a crashed run doesn't silently drop the realtor's
        # events; the per-trigger attempt cap stops a poison trigger looping.
        await requeue_triggers(space.id, triggers, increment_attempts=True)
        await publish_event(ctx, "error", f"Agent error: {exc}", agent_type="chippi")
        # Make the failure visible. A swallowed error leaves the realtor's
        # activity feed blank with no signal that a run even happened.
        try:
            await save_memory(
                space_id=space.id,
                entity_type="space",
                entity_id=space.id,
                memory_type="observation",
                content=(
                    "Autonomous run failed on "
                    f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}: "
                    f"{str(exc)[:200]}"
                ),
                importance=0.3,
            )
        except Exception:
            log.warning("agent_run_failure_memory_write_failed")
        await record_trajectory(
            run_id=run_id,
            space_id=space.id,
            started_at=started_at,
            status="error",
            trigger=(triggers[0] if triggers else None),
            model=chippi.model,
            total_tokens=total_tokens,
            tool_calls=trajectory_tool_calls,
            extra={"error": str(exc)[:500]},
        )
        return
    finally:
        # Drain the fire-and-forget publish tasks so the realtor's activity
        # feed gets every tool event before the Modal container exits.
        if publish_tasks:
            await asyncio.gather(*publish_tasks, return_exceptions=True)

    if total_tokens > 0:
        memory_content = (
            final_summary
            or f"Run on {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — {total_tokens:,} tokens used."
        )
        await save_memory(
            space_id=space.id,
            entity_type="space",
            entity_id=space.id,
            memory_type="observation",
            content=memory_content,
            importance=0.25,
        )
        await record_usage(space.id, total_tokens)

    await publish_event(
        ctx, "complete",
        f"Run complete — {total_tokens:,} tokens used",
        metadata={"totalTokens": total_tokens},
    )
    await record_trajectory(
        run_id=run_id,
        space_id=space.id,
        started_at=started_at,
        status="completed",
        trigger=(triggers[0] if triggers else None),
        model=chippi.model,
        total_tokens=total_tokens,
        tool_calls=trajectory_tool_calls,
        final_summary=final_summary,
    )
    log.info("agent_run_finished", total_tokens=total_tokens)
