"""Top-down swarm orchestrator.

Called by the Modal run_swarm endpoint. Given a goal and optional custom agents,
it plans, executes in parallel, audits, and writes results to Supabase.
All progress is written to SwarmEvent for SSE consumption.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from agents import Agent, ModelSettings, Runner
from openai import AsyncOpenAI

from config import settings
from db import supabase as get_supabase
from llm import configure_agents_sdk, get_llm_client, openai_model, resolve_chat_model

logger = structlog.get_logger(__name__)


async def emit_event(db, swarm_run_id: str, event_type: str, data: dict, member_id: str | None = None) -> None:
    """Write an event row — consumed by the SSE endpoint."""
    row: dict[str, Any] = {"swarmRunId": swarm_run_id, "type": event_type, "data": data}
    if member_id:
        row["memberId"] = member_id
    await db.table("SwarmEvent").insert(row).execute()


async def plan_swarm(goal: str, custom_agents: list[dict], client: AsyncOpenAI) -> dict:
    """Ask GPT-4o to decompose the goal into parallel sub-tasks. Returns a plan dict."""
    agent_roster = "\n".join(
        f"- Agent {i}: {a['name']} — {a.get('systemPrompt', '')[:200]}"
        for i, a in enumerate(custom_agents)
    ) if custom_agents else "No custom agents specified — use general-purpose sub-agents."

    prompt = f"""You are a planning AI for a real estate agent's swarm system.

Goal: {goal}

Available agents:
{agent_roster}

Decompose this goal into 2-6 parallel sub-tasks. Each task should be independent enough to run in parallel.

Return ONLY valid JSON in this exact format:
{{
  "tasks": [
    {{
      "name": "Task name",
      "role": "One-line role description",
      "task": "Specific task instructions (2-4 sentences)",
      "agentIndex": 0,
      "wave": 1
    }}
  ],
  "rationale": "Why these tasks"
}}

Rules:
- Keep tasks focused and achievable
- Each task should contribute uniquely to the goal
- Use agentIndex to map to a custom agent (0-based), or -1 to auto-assign
- wave=1 for first-wave parallel tasks, wave=2 for tasks that depend on wave-1 results
"""
    response = await client.chat.completions.create(
        model=openai_model("gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
    )
    plan_text = response.choices[0].message.content or "{}"
    return json.loads(plan_text)


async def run_member(db, swarm_run_id: str, member: dict, space_id: str) -> None:
    """Run a single sub-agent and persist its output."""
    member_id = member["id"]

    await db.table("SwarmMember").update({
        "status": "running",
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }).eq("id", member_id).execute()

    await emit_event(db, swarm_run_id, "agent_started", {
        "name": member["name"],
        "role": member.get("role", ""),
        "task": member["task"],
    }, member_id)

    try:
        system_prompt = member.get("systemPrompt") or (
            f"You are {member['name']}, a real estate AI assistant. {member.get('role', '')}. "
            "Be concise, accurate, and helpful. Focus on the specific task assigned."
        )

        agent = Agent(
            name=member["name"],
            instructions=system_prompt,
            model=resolve_chat_model(settings.worker_model),
            model_settings=ModelSettings(max_tokens=2048),
        )

        # Emit thinking event
        await emit_event(db, swarm_run_id, "agent_thinking", {
            "message": f"{member['name']} is working on: {member['task'][:100]}..."
        }, member_id)

        result = await Runner.run(agent, member["task"], max_turns=8)
        output = result.final_output or "No output produced."

        await db.table("SwarmMember").update({
            "status": "completed",
            "output": output,
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }).eq("id", member_id).execute()

        await emit_event(db, swarm_run_id, "agent_completed", {
            "name": member["name"],
            "output": output,
        }, member_id)

    except Exception as exc:
        logger.error("swarm_member_failed", member_id=member_id, error=str(exc))
        await db.table("SwarmMember").update({
            "status": "failed",
            "output": f"Error: {exc}",
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }).eq("id", member_id).execute()
        await emit_event(db, swarm_run_id, "agent_failed", {
            "name": member["name"],
            "error": str(exc),
        }, member_id)


async def audit_results(goal: str, members: list[dict], client: AsyncOpenAI) -> str:
    """Synthesize sub-agent outputs into a final answer."""
    results_text = "\n\n".join(
        f"**{m['name']}** ({m.get('role', 'agent')}):\n{m.get('output', 'No output')}"
        for m in members
    )

    prompt = f"""You are a quality auditor synthesizing results from a swarm of AI agents.

Original goal: {goal}

Sub-agent results:
{results_text}

Synthesize these results into a clear, comprehensive final answer.
- Highlight key findings
- Note any conflicts or gaps
- Provide actionable recommendations
- Be concise but complete

Format with markdown headers for readability."""

    response = await client.chat.completions.create(
        model=openai_model("gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    return response.choices[0].message.content or "No synthesis produced."


async def run_swarm(payload: dict) -> None:
    """Main entry point called by the Modal endpoint."""
    configure_agents_sdk()
    swarm_run_id: str = payload["swarmRunId"]
    goal: str = payload["goal"]
    space_id: str = payload["spaceId"]
    custom_agents: list[dict] = payload.get("customAgents", [])

    db = await get_supabase()
    client = get_llm_client()

    try:
        # Planning phase
        await db.table("SwarmRun").update({"status": "planning"}).eq("id", swarm_run_id).execute()
        await emit_event(db, swarm_run_id, "swarm_planning", {"message": "Analyzing goal and creating execution plan..."})

        plan = await plan_swarm(goal, custom_agents, client)

        await db.table("SwarmRun").update({
            "plan": plan,
            "status": "running",
        }).eq("id", swarm_run_id).execute()
        await emit_event(db, swarm_run_id, "plan_created", {"plan": plan, "taskCount": len(plan.get("tasks", []))})

        # Create SwarmMember rows
        members = []
        for task_def in plan.get("tasks", []):
            agent_index = task_def.get("agentIndex", -1)
            agent_config = (
                custom_agents[agent_index]
                if 0 <= agent_index < len(custom_agents)
                else None
            )
            member_row = {
                "swarmRunId": swarm_run_id,
                "customAgentId": agent_config["id"] if agent_config else None,
                "name": task_def.get("name", "Agent"),
                "role": task_def.get("role", ""),
                "systemPrompt": agent_config["systemPrompt"] if agent_config else "",
                "task": task_def.get("task", goal),
                "wave": task_def.get("wave", 1),
                "status": "queued",
            }
            result = await db.table("SwarmMember").insert(member_row).execute()
            members.append(result.data[0])

        # Run wave 1 in parallel. return_exceptions=True so one member whose
        # DB write escapes run_member's own handler can't cancel its siblings
        # mid-flight — each sub-agent stands or falls on its own.
        wave_1 = [m for m in members if m.get("wave", 1) == 1]
        await asyncio.gather(
            *[run_member(db, swarm_run_id, m, space_id) for m in wave_1],
            return_exceptions=True,
        )

        # Run wave 2 if any (sequential after wave 1)
        wave_2 = [m for m in members if m.get("wave", 1) == 2]
        if wave_2:
            await emit_event(db, swarm_run_id, "wave_2_starting", {"agentCount": len(wave_2)})
            await asyncio.gather(
                *[run_member(db, swarm_run_id, m, space_id) for m in wave_2],
                return_exceptions=True,
            )

        # Audit phase
        await db.table("SwarmRun").update({"status": "auditing"}).eq("id", swarm_run_id).execute()
        await emit_event(db, swarm_run_id, "audit_started", {"message": "Synthesizing results..."})

        # Reload members with outputs
        members_result = await db.table("SwarmMember").select("name,role,output,status").eq("swarmRunId", swarm_run_id).execute()
        final_result = await audit_results(goal, members_result.data or [], client)

        # Complete
        await db.table("SwarmRun").update({
            "status": "completed",
            "result": final_result,
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }).eq("id", swarm_run_id).execute()
        await emit_event(db, swarm_run_id, "swarm_completed", {"result": final_result})

    except Exception as exc:
        logger.error("swarm_failed", swarm_run_id=swarm_run_id, error=str(exc))
        await db.table("SwarmRun").update({
            "status": "failed",
            "errorMessage": str(exc),
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }).eq("id", swarm_run_id).execute()
        await emit_event(db, swarm_run_id, "swarm_failed", {"error": str(exc)})
