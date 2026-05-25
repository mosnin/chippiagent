# Real Estate Skill

Skill descriptor that wraps the Chippi CRM agent for use from the top-level
chippi-agent. The CRM is a Next.js + Python real-estate workspace; this skill
points the chippi agent at it and documents the 34 native tools the CRM agent
ships with.

This is a **descriptor**, not a runnable package. The tool implementations live
in `crm/agent/tools/`. The CRM agent is constructed in
`crm/agent/chippi.py::make_chippi_agent` and runs against a Supabase-backed
workspace scoped by `spaceId` (always pulled from `AgentContext`).

## At a Glance

| | |
|---|---|
| **Source agent** | `crm/agent/chippi.py` |
| **Tool implementations** | `crm/agent/tools/*.py` |
| **Pydantic schemas** | `crm/agent/schemas.py` |
| **Guardrail** | `crm/agent/security/guardrails.py::pending_drafts_guardrail` |
| **Surface area** | 34 native tools, two run modes (CHAT, AUTONOMOUS) |
| **Backing store** | Supabase (per-realtor `spaceId`) |
| **Required env** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` |

## Files

- `SKILL.md` — frontmatter + canonical skill descriptor (load this when the
  agent decides to use the skill). Lists every tool, the modes the CRM agent
  supports, and the operating procedure.
- `tools.json` — machine-readable manifest mapping each tool to its source file.
  Useful for tooling that needs to enumerate the surface without parsing
  `SKILL.md`.
- `README.md` — this file. Human onboarding for engineers extending the
  wrapper.

## What the skill does NOT do

This wrapper does NOT bridge the CRM tools into the chippi-agent runtime as
callable functions. The CRM agent is built on the OpenAI Agents SDK
(`from agents import Agent, function_tool`) and assumes a long-lived Supabase
session + an `AgentContext` carrying `space_id`. Wiring those into the
chippi-agent tool registry is a much larger job — a future skill or plugin
should:

1. Spawn the CRM agent in-process or out-of-process when the skill is loaded.
2. Forward the active realtor's `space_id` (from session metadata or the
   gateway platform adapter) into `AgentContext`.
3. Surface the CRM tool calls back to the parent chippi agent so they appear
   in the activity feed.

Until then, this skill exists so the top-level chippi agent KNOWS the
capabilities exist, can describe them to the realtor, and can route a realtor
into the CRM agent (via `crm/agent/orchestrator.py` / `modal_app.py`) when the
request matches.

## Tool Categories

| Category | Source | Tools |
|---|---|---|
| Contacts | `crm/agent/tools/contacts.py` | 4 |
| Deals + lifecycle | `crm/agent/tools/deals.py` | 5 |
| Tours | `crm/agent/tools/tours.py` | 1 |
| Routing (brokerages) | `crm/agent/tools/routing.py` | 1 |
| Properties | `crm/agent/tools/properties.py` | 2 |
| Memory | `crm/agent/tools/memory_tools.py` | 2 |
| Goals | `crm/agent/tools/goals.py` | 1 |
| Routines | `crm/agent/tools/routines.py` | 1 |
| Drafts | `crm/agent/tools/drafts.py` | 1 |
| Outcomes | `crm/agent/tools/outcome.py` | 1 |
| Insights | `crm/agent/tools/portfolio.py`, `crm/agent/tools/priority.py` | 2 |
| I/O | `crm/agent/tools/inbound.py`, `crm/agent/tools/attachments.py` | 2 |
| Asking | `crm/agent/tools/questions.py` | 1 |
| Audit | `crm/agent/tools/activities.py` | 1 |
| App help | `crm/agent/tools/docs.py` | 1 |
| Planning | `crm/agent/tools/plan.py` | 1 |
| Intake form | `crm/agent/tools/intake_form.py` | 5 |
| Studio (content gen) | `crm/agent/tools/studio.py` | 2 |
| **Total** | | **34** |

See `SKILL.md` and `tools.json` for the per-tool breakdown.

## Two Execution Modes

The CRM agent has no internal state machine for picking a mode — it reads the
opening message and behaves accordingly.

### CHAT

The realtor sent a message via the web UI (`/api/ai/task` → Modal `chat_turn`).
Identify the real job, run tools, answer in chat. Short for simple questions;
structured for synthesis. Contact-facing output goes through `draft_message`
(never sends — returns a draft id).

### AUTONOMOUS

Woken by a trigger or periodic sweep:

| Trigger | Fired when… |
|---|---|
| `application_submitted` | A lead returns a completed intake form |
| `tour_completed` | A tour event closes |
| `new_lead` | A new contact is created from an external source |
| `deal_stage_changed` | A deal moves between pipeline stages |
| `inbound_message` | A reply arrives from a contact |
| `goal_completed` | An `AgentGoal` flips to `completed` |
| sweep (no trigger) | Periodic stalled-lead / stalled-deal / closing-soon check |

In autonomous mode there is no chat reply — the agent takes actions and stops.
Every autonomous run ends with `log_activity_run` so the realtor has an audit
trail.

## Hooking This Skill Up

The top-level chippi agent loads skills from `skills/<category>/<name>/`. When
the realtor's request touches the real-estate surface, the agent loads
`SKILL.md` and uses its prose to decide which CRM tool to call.

For the actual runtime integration (when someone is ready to do it), the entry
points are:

- `crm/agent/chippi.py::make_chippi_agent(ai_profile_text, extra_tools, workspace_info, model)`
  — constructs the OpenAI Agents SDK `Agent` with all 34 tools wired in.
- `crm/agent/orchestrator.py` — the per-run orchestrator that sets up the
  `AgentContext`, runs the agent, and handles trajectories.
- `crm/agent/modal_app.py` — the Modal deployment used by the web UI's
  `/api/ai/task` route for chat turns.

The native CRM tools are decorated with `@function_tool` from the OpenAI
Agents SDK. Each one takes `ctx: RunContextWrapper[AgentContext]` as its
first argument and reads `ctx.context.space_id` to scope its Supabase
queries.

## Related

- `crm/CLAUDE.md` — operating instructions for working in the CRM.
- `crm/agent/pyproject.toml` — Python deps for the CRM agent.
- `skills/domain/DESCRIPTION.md` — what the `domain` skill category is for.
