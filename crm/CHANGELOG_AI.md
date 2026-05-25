# CHANGELOG_AI.md

Ledger for AI-assisted changes in this repository.

Use this file to keep a consistent, auditable record of all AI-authored work. Both AI agents and human contributors should log entries here after AI-assisted changes.

---

## How to use this file

1. Add a new entry at the top of the log section (most recent first).
2. Fill in all required fields.
3. Be specific about files touched and why.
4. Include test evidence — what was checked and what the result was.
5. If a change is risky or touches a protected system, note that explicitly.

---

## Entry template

Copy this template for each new entry:

```md
## [YYYY-MM-DD] <short task name>

- **Task**: <what was requested>
- **Summary**: <what changed, in plain language>
- **Files touched**:
  - `<path>` — <why this file was changed>
  - `<path>` — <why this file was changed>
- **Reason**: <why the change was needed>
- **Risks**: <possible side effects, or "None identified">
- **Manual tests**:
  - <what was checked> — <result>
  - <what was checked> — <result>
- **Rollback notes**: <how to revert safely, e.g. "Revert commit <hash>" or "Delete file X">
```

### Required fields

| Field | Description |
|---|---|
| Date | YYYY-MM-DD format |
| Task | What was requested |
| Summary | What changed |
| Files touched | Each file path + reason for change |
| Reason | Why the change was needed |
| Risks | Side effects or "None identified" |
| Manual tests | What was verified and result |
| Rollback notes | How to undo the change |

---

## Log

### [PLACEHOLDER] Example entry — replace with real entries

## [2026-04-24] Add AI_AGENT_SPEC.md

- **Task**: Write a canonical reference document for the on-demand agent so future changes have a single source of truth.
- **Summary**: Added `docs/AI_AGENT_SPEC.md` covering the tool-use loop, SSE event protocol, MessageBlock persistence model, approval gates (including always-allow-for-this-chat), the full tool catalogue after Phase 5, the `[tools.usage]` observability contract, and the Phase 7 sub-agent / skill pattern.
- **Files touched**:
  - `docs/AI_AGENT_SPEC.md` — new canonical spec (commit `cc1f11d`)
- **Reason**: Phases 1–7 shipped incrementally; without a consolidated spec, agents were reading seven commit messages and inferring invariants. The doc pins the contract down.
- **Risks**: Doc drift if the agent implementation evolves without updating the spec.
- **Manual tests**:
  - Cross-read spec against `app/api/ai/task/route.ts` and the tool registry — protocol + tool list match shipped code.
  - Verified block-type catalogue matches the `Message.blocks` union.
- **Rollback notes**: Delete `docs/AI_AGENT_SPEC.md` or revert commit `cc1f11d`.

## [2026-04-22] On-demand AI agent — Phases 1–7

- **Task**: Replace the legacy `/api/ai/chat` stub with a real tool-using agent: streaming tool-use loop, approval gates for mutating actions, persisted transcripts, observability, and sub-agents to contain context growth.
- **Summary**: Shipped the agent in seven phases over a single sweep.
  - **Phase 1 — foundations**: tool registry + zod schemas + auth context, typed SSE event protocol, first read-only tool (`search_contacts`), `Message.blocks` column + block-type union, zod → OpenAI tool-format converter, `executeTool()` orchestration, system prompt + transcript persistence.
  - **Phase 2 — streaming loop**: `/api/ai/task` streaming endpoint, three more read-only tools, loop pauses on the first mutating tool call, multi-parallel-tool-call test coverage.
  - **Phase 3 — approval gates**: Redis-backed pending-approval store, `/approve` endpoint + `continueTurn()` resume, first mutating tool (`send_email`) wired end-to-end.
  - **Phase 4 — chat UI**: block renderers + Transcript orchestrator, ChatInterface wired onto `/api/ai/task`, always-allow-for-this-chat auto approval, immediate denial block on Deny.
  - **Phase 5 — tool catalogue**: six new mutating tools added to the catalogue.
  - **Phase 6 — hardening**: per-tool `summariseCall` + rateLimit + `[tools.usage]` structured logging + dead-code purge; log shape normalised across success/error/abort.
  - **Phase 7 — sub-agents**: Skill pattern plus `contact_researcher`, `pipeline_analyst`, and a `delegate_to_subagent` tool so long-horizon research does not pollute the main transcript.
- **Files touched** (high level — exhaustive list is in the commits below):
  - `app/api/ai/task/route.ts` — streaming loop, SSE protocol, approval pause/resume
  - `app/api/ai/approve/route.ts` — mutating-tool approval endpoint
  - `agent/tools/*` — tool registry, zod schemas, read-only and mutating tool implementations
  - `agent/subagents/*` — `contact_researcher`, `pipeline_analyst`, skill pattern
  - `components/ai/*` — block renderers, Transcript, ChatInterface, approval UI
  - `lib/ai/*` — zod→OpenAI converter, rate-limit helpers, `[tools.usage]` logger
  - `supabase/migrations/*` — `Message.blocks` column
- **Commits**: `7ae3b06`, `43eaad4`, `9083ee1`, `e376ab0`, `2e33e9f`, `660feb4`, `d8857d8`, `4b9a8f9`, `98357a9`, `547624a`, `465d6f0`, `bb81163`, `08dd0f4`, `708739f`, `fa0edbb`, `3beb6ab`, `a23aefb`, `ff37a06`, `9d395f7`, `c1f8926`, `d7dd474`, `4ff6a77`, `90dc260`, `bd709db`, `95ba883`, `c770d0b`.
- **Reason**: The old `/api/ai/chat` route was a non-tool-using LLM call that could not take action on behalf of the realtor. The new agent can search, draft, and execute with an approval gate on every mutating step, while sub-agents stop read-heavy investigations from poisoning the main context window.
- **Risks**:
  - Mutating tools now have real side effects; approval gates + `summariseCall` previews are the safety net. A miswritten approval flow could allow silent execution.
  - Rate limits are per-tool per-user; a new tool that forgets to register a limit bucket defaults to unlimited.
  - Sub-agents are invoked via `delegate_to_subagent`; if a skill prompt is lax, the sub-agent can waste tokens. Monitor via `[tools.usage]` logs.
- **Manual tests**:
  - Happy-path: ask the agent to search contacts, draft an email, approve — email sent, transcript block sequence matches spec.
  - Denial path: reject a mutating call — denial block renders immediately (`9d395f7`); continuation suppresses the tool result.
  - Parallel tool calls (phase 2d): two `search_contacts` calls dispatched concurrently return in order.
  - Sub-agent path: `contact_researcher` completes, main transcript gets a single summary block rather than the sub-agent's full trace.
  - Observability: `[tools.usage]` log line emitted for each tool invocation with the same keys across success/error/abort (`90dc260`).
- **Rollback notes**: Phases are additive but interdependent; the cleanest revert is to restore the pre-`7ae3b06` `/api/ai/chat` route and drop the `Message.blocks` column migration. Rolling back any single phase mid-stack will leave the UI and server out of sync.

## [2026-03-10] Create documentation stack

- **Task**: Create comprehensive project documentation for safe AI-assisted development
- **Summary**: Created 9 documentation files (AGENTS.md, ARCHITECTURE.md, PRODUCT_SCOPE.md, CHANGELOG_AI.md, DECISIONS.md, TESTING.md, ENVIRONMENT.md, PROMPTS_AND_SCORING.md, WORKFLOW_BOUNDARIES.md) covering project architecture, product scope, agent operating rules, testing playbook, environment config, AI behavior contracts, and workflow boundaries.
- **Files touched**:
  - `AGENTS.md` — AI agent operating manual
  - `ARCHITECTURE.md` — System map and technical architecture
  - `PRODUCT_SCOPE.md` — Product truth doc and scope guardrails
  - `CHANGELOG_AI.md` — This file; AI change ledger
  - `DECISIONS.md` — Decision log with templates
  - `TESTING.md` — Manual validation playbook
  - `ENVIRONMENT.md` — Environment variables and services reference
  - `PROMPTS_AND_SCORING.md` — AI prompt and scoring behavior documentation
  - `WORKFLOW_BOUNDARIES.md` — Workflow separation guide
- **Reason**: Establish governance docs for safe AI-assisted development
- **Risks**: Documentation drift if code changes are not reflected in docs
- **Manual tests**:
  - Verified all referenced file paths exist in repository
  - Confirmed technical details match actual codebase
- **Rollback notes**: Revert the commit to restore previous documentation versions
