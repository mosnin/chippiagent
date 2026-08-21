# AI Agent Runtime

> The core agent runtime that turns a realtor's natural-language request into a
> streamed sequence of tool calls that execute immediately — Chippi sends email
> and SMS, writes CRM records, and reports back — all persisted as a typed
> `MessageBlock[]` so conversations survive reload and broker-review.

A realtor types `"email Jane about the tour Friday"`; the server opens an SSE
stream, the model plans a `send_email` call, Chippi sends the email, and a
`ToolCallBlock` lands in the transcript. This doc is the reference for every
contract that makes that flow work: the SSE event union, the persisted block
shape, the tool registry, and the sub-agent ("Skill") pattern layered on top.

**Runtime status (May 2026).** Chat turns run inside a **Modal sandbox** (`agent/modal_app.py`) via the **OpenAI Agents SDK** Python package (`openai-agents`), using **gpt-5-mini** with `reasoning_effort="medium"` enabled. The Next.js layer in `POST /api/ai/task` proxies SSE events from Modal, translates them to the standard `AgentEvent` wire format, and persists the turn on completion. Reasoning tokens stream to the browser as `reasoning_delta` events and surface in the collapsible "Thinking" UI. Background, event-driven autonomous activation is handled by Redis + Modal webhook triggers in `POST /api/agent/trigger` (policy controlled by `AGENT_IMMEDIATE_EVENTS`: `all` by default, or a comma-separated subset of event names; invalid values fail safe to `all`). Set `CHIPPI_CHAT_RUNTIME=ts` to fall back to the in-process TypeScript runtime for local development without a Modal deployment.

**Table of contents**

1. [Architecture](#1-architecture)
2. [Wire protocol](#2-wire-protocol)
3. [MessageBlock types](#3-messageblock-types)
4. [Tools](#4-tools)
5. [Autonomous execution](#5-autonomous-execution)
6. [Sub-agents (Skills)](#6-sub-agents-skills)
7. [Observability](#7-observability)
8. [Deprecated / removed](#8-deprecated--removed)
9. [Appendix: event + error code tables](#appendix-event--error-code-tables)

---

## 1. Architecture

```
ChippiWorkspace (components/chippi/chippi-workspace.tsx)
   │  useAgentTask hook  (components/ai/hooks/use-agent-task.ts)
   ▼
POST /api/ai/task  (app/api/ai/task/route.ts)
   │  resolveToolContext → auth + space scope
   │  loadHistory (20 messages)
   │  saveUserMessage
   │  POST → Modal chat_turn endpoint
   ▼
Modal sandbox  (agent/modal_app.py)
   │  OpenAI Agents SDK Python (`openai-agents`)
   │  gpt-5-mini  •  reasoning_effort="medium"
   │  ┌─ response.output_text.delta → token events
   │  ├─ response.reasoning_text.delta → reasoning_delta events
   │  └─ tool_call_item / tool_call_output_item → tool events
   ▼
proxyModalStream()  (app/api/ai/task/route.ts)
   │  token           → text_delta
   │  reasoning_delta → reasoning_delta  (streams to "Thinking" UI)
   │  tool_call_start → tool_call_start  (with fresh callId)
   │  tool_call_result → tool_call_result
   │  done            → saveAssistantMessage + turn_complete
   ▼
Browser SSE client
   │  text_delta      → append to streaming text block
   │  reasoning_delta → accumulate in streamingReasoning (collapsible)
   │  tool_call_*     → tool call block in transcript
   └─ turn_complete   → mark turn settled, clear streamingReasoning
```

**Execution.** When the model emits a tool call, the loop validates args and
invokes `executeTool` in the same stream. Write and send tools (`send_email`,
`send_sms`, CRM mutations) run immediately — Chippi sends and acts. The
stream stays open through tool results and any follow-on model turns until
`turn_complete.reason = 'complete'`. There is no human-in-the-loop pause,
draft-for-approval, pending-review, or wait-for-human step.

**Persistence.** Every assistant turn is persisted to the `Message` table
with a `blocks JSONB` column (added in
`supabase/migrations/20260426000000_message_blocks.sql`). Legacy rows
pre-dating the block schema fall back to `blocksFromLegacyContent` which
wraps the old `content` text in a single `TextBlock` (blocks.ts:63).

---

## 2. Wire protocol

### `POST /api/ai/task`

Starts (or continues) a conversation.

- **Auth**: `resolveToolContext` — Clerk session + workspace-owner check +
  offboarding gate (inherits from `requireAuth`). See
  `lib/api-auth.ts` and `lib/permissions.ts`.
- **Rate limit**: **30 per hour per user**, keyed `ai:task:{userId}`
  (route.ts:136).
- **Body**:
  ```ts
  { spaceSlug: string; conversationId?: string | null; message: string }
  ```
  `message` is capped at 8000 chars (route.ts:122).
- **Response**: `text/event-stream` with `X-Accel-Buffering: no`. Events are
  instances of `AgentEvent` (events.ts:17) encoded one-per-frame.

### Frame format

Each SSE frame is:

```
event: <AgentEvent.type>
data: <JSON serialisation of the event>

```

`encodeEvent` (events.ts:139) produces this; `SSEParser`
(lib/ai-tools/client/parse-sse.ts) consumes it on the client side and
tolerates CRLF endings, `:comment` heartbeat lines, partial chunks
straddling frame boundaries, and malformed JSON payloads (dropped silently).

---

## 3. MessageBlock types

The persisted form of a turn. Client renders via `Transcript`
(components/ai/blocks/transcript.tsx), which dispatches on
`block.type`.

| Type | Shape (blocks.ts) | When emitted |
|---|---|---|
| `text` | `{ type: 'text', content: string }` | Default assistant reply; accumulated from `text_delta` events |
| `tool_call` | `{ type: 'tool_call', callId, name, args, result?, status: 'complete' \| 'error', display? }` | A tool ran in-stream (read, write, or send) |

**coalesceTextBlocks** (blocks.ts:72) collapses adjacent text blocks at
save-time so many tiny `text_delta` fragments become one block in the DB.

**blocksFromLegacyContent** (blocks.ts:63) wraps a legacy `content` string
as `[{ type: 'text', content }]` for rows that predate the JSONB column.

---

## 4. Tools

### Anatomy

`ToolDefinition` (lib/ai-tools/types.ts) fields:

| Field | Purpose |
|---|---|
| `name` | snake_case identifier exposed to the model (unique across the registry) |
| `description` | One-sentence description for the model |
| `parameters` | Zod schema — validated in `executeTool` before the handler runs |
| `summariseCall?` | `(args) => string` — the one-line "what happened / will happen" blurb shown in the transcript. **Mandatory** for write/send tools or the realtor sees generic JSON |
| `rateLimit?` | `{ max: number; windowSeconds: number }` — per-user per-tool cap enforced in `executeTool` |
| `handler` | `async (args, ctx) => ToolResult` |

Every tool is declared via `defineTool(...)` which preserves
`z.infer<TSchema>` for the handler's `args` type.

### Read vs write/send

Every registered tool runs in the same streaming response and lands a
`ToolCallBlock` when it finishes. Read tools return data. Write and send
tools change the workspace or the outside world immediately — Chippi
sends the email, sends the SMS, updates the contact, books the tour.
Rate limits are the execution cap, not a human gate. See §5.

### Registry

`ALL_TOOLS` (lib/ai-tools/tools/index.ts) is the domain tool list. The
`delegate_to_subagent` meta-tool is combined in at the `registry.ts:20`
layer — **intentionally NOT in `ALL_TOOLS`** so that `validateSkill`
(called with `ALL_TOOLS`) can't allow a skill to nest another
`delegate_to_subagent`. Combined list:

| Tool | Executes | Rate limit | Notes |
|---|---|---|---|
| `search_contacts` | in-stream | none | Space-scoped ILIKE search |
| `search_deals` | in-stream | none | Same, joins DealStage |
| `get_contact` | in-stream | none | Single contact + linked deals + recent tours |
| `pipeline_summary` | in-stream | none | Classifies deals via `lib/deals/health.ts` |
| `send_email` | in-stream — Chippi sends | **50/hr** (send-email.ts:76) | Sends via `sendEmailFromCRM`; logs `ContactActivity` |
| `send_sms` | in-stream — Chippi sends | **30/hr** (send-sms.ts:63) | Telnyx; logs ContactActivity as `type:'note', metadata.channel:'sms'` |
| `update_contact` | in-stream | **100/hr** (update-contact.ts:68) | Fires `syncContact` for search reindex |
| `advance_deal_stage` | in-stream | **60/hr** (advance-deal-stage.ts:48) | Writes `stage_change` DealActivity + `syncDeal` |
| `create_deal` | in-stream | **30/hr** (create-deal.ts:62) | Mirrors POST /api/deals including buyer-pipeline auto-routing |
| `schedule_tour` | in-stream | **30/hr** (schedule-tour.ts:70) | Accepts contactId OR walk-in guest fields |
| `add_checklist_item` | in-stream | **60/hr** (add-checklist-item.ts:62) | Single item; seeding templates is explicit, not a tool |
| `delegate_to_subagent` | in-stream | **20/hr** (delegate-to-subagent.ts:63) | Meta-tool; dispatches to Skills (see §6) |

Rate limits are per **user + tool** (executeTool keys with
`ai:tool:${tool.name}:${ctx.userId}`).

---

## 5. Autonomous execution

Chippi is autonomous. When the model plans a write or send, the loop runs
it. The realtor sees what Chippi did in the transcript. There is no draft
queue, pending-review step, or optional-approval leftover.

### Same-stream execution

1. The model emits one or more tool calls.
2. `executeTool` validates args, enforces the tool's `rateLimit`, and
   invokes the handler.
3. The stream emits `tool_call_start` then `tool_call_result`.
4. The model continues with those results until it produces final text.
5. The route persists `Message.blocks` and closes with
   `turn_complete.reason = 'complete'`.

Background activation (`POST /api/agent/trigger`) uses the same contract:
event-woken runs send and write without waiting for a human.

### What stops a send

Rate limits, auth/space scope, missing credentials, and handler errors.
Not a human gate.

### Skills stay read-only

Sub-agents (§6) may only call read tools. The orchestrator owns send and
write. That split is about context-rot prevention, not human gates.

---

## 6. Sub-agents (Skills)

Motivation: **context-rot prevention.** A long conversation that accumulates
many tool-call outputs bloats the main loop's context. Skills let the
orchestrator delegate a focused read-only sub-task to a dedicated
`runSubAgent` instance that returns only a short summary.

### Skill type

`Skill` (lib/ai-tools/skills/types.ts:29):

```ts
{
  name: string;              // snake_case
  description: string;       // for the orchestrator
  systemPrompt: string;      // focused persona
  toolAllowlist: string[];   // MUST be read-only tool names only
  maxRounds?: number;        // cap on sub-agent loop iterations
}
```

### validateSkill

Runs at module load (skills/types.ts:69). Rejects a skill if:
1. Any `toolAllowlist` name is in `SKILL_FORBIDDEN_TOOLS` (currently just
   `delegate_to_subagent` — prevents sub-agent recursion; types.ts:65).
2. Any allowlisted tool isn't in the registry.
3. Any allowlisted tool is a write/send tool (skills are read-only).

### runSubAgent

(lib/ai-tools/skills/run-sub-agent.ts:101) Non-streaming. Each round calls
OpenAI with the skill's `systemPrompt` + `toolAllowlist`, executes any tool
calls via the same `executeTool`, and stops when the model produces text.
Budget: `skill.maxRounds ?? DEFAULT_MAX_ROUNDS = 4`
(run-sub-agent.ts:57, 103). When the budget is exhausted, a final
tools-disabled round requests a best-effort summary.

**AbortController.** The orchestrator's `ctx.signal` is threaded into every
`openai.chat.completions.create(...)` call so an abort propagates into the
HTTP layer and cancels the in-flight request immediately — not just between
rounds.

### Registered skills

Each is a single file; each is validated at module load.

| Skill | Allowlist | `maxRounds` |
|---|---|---|
| `contact_researcher` (lib/ai-tools/skills/contact-researcher.ts) | `search_contacts`, `get_contact`, `search_deals` | 4 |
| `pipeline_analyst` (lib/ai-tools/skills/pipeline-analyst.ts) | `search_deals`, `pipeline_summary` | 5 |

### The `delegate_to_subagent` meta-tool

lib/ai-tools/tools/delegate-to-subagent.ts — the orchestrator calls this
to dispatch to a Skill. Args `{ skill: enum, task: string }`. Runs
`runSubAgent`, returns its summary as a plain `ToolResult`. Rate limited
at 20/hr/user.

---

## 7. Observability

Every tool execution emits a structured log from `execute.ts`:

```
logger.info('[tools.usage]', {
  tool: string,
  userId: string,
  spaceId: string,
  ok: boolean,
  errorCode?: 'rate_limited' | 'handler_error' | 'aborted' | ...,
  display?: 'success' | 'error' | 'warning' | 'contacts' | 'deals' | ...,
  durationMs: number,
});
```

Fields are consistent across success / abort / error paths (hardened in
the Phase 6 audit follow-up). Downstream aggregators can chart p95
duration and error rate per tool without per-tool instrumentation.

Sub-agent runs emit the parallel `[skill.usage]` (run-sub-agent.ts) with
`skill`, `reason: 'complete' | 'max_rounds' | 'aborted' | 'error'`,
`toolCalls`, `durationMs`.

Rate-limit hits log separately:
`logger.warn('[tools.execute] rate limit hit', {...})`
(execute.ts:123).

---

## 8. Deprecated / removed

| Gone | Removed in | Notes |
|---|---|---|
| `POST /api/ai/chat` | Phase 4b (a23aefb) | Replaced by `/api/ai/task` — the old route used a pre-tool-use completion shape |
| `POST /api/ai/action` | Phase 6e (4ff6a77) | Legacy draft-card flow from the Phase 13 deals redesign, superseded by in-stream tool-use |
| `POST /api/ai/task/approve/[requestId]` | 2026-08-21 product contract | Legacy human-in-the-loop resume. Not the product. Do not document or reintroduce as a realtor step |
| Pending-approval Redis store | 2026-08-21 product contract | Legacy pause/resume stash. Chippi sends in the original stream |
| `permission_required` / `permission_resolved` events | 2026-08-21 product contract | Legacy pause/resume wire. Current turns emit tool events and complete |
| `requiresApproval` / `shouldApprove` tool fields | 2026-08-21 product contract | Leftover registry fields. Product contract is execute + `rateLimit` |
| `components/ai/message-bubble.tsx` | Phase 6e (4ff6a77) | Rendered the legacy string-content messages with ACTION blocks |
| `components/ai/action-card.tsx` | Phase 6e (4ff6a77) | Action-card UI for the pre-BP6e flow |

Any reference to these in older docs is wrong; see
`docs/AI_AGENT_SPEC.md` (this file), `API_CONTRACTS.md`, or the commits
cited above.

---

## Appendix: event + error code tables

### Table 1 — `AgentEvent` variants (events.ts:17)

| `type` | Fields beyond `{seq, ts}` | Emitted when |
|---|---|---|
| `text_delta` | `delta: string` | Every text chunk streamed by OpenAI |
| `reasoning_delta` | `delta: string` | Model reasoning token chunk; accumulated in `streamingReasoning` for the collapsible "Thinking" UI; never stored in `MessageBlock[]` |
| `tool_call_start` | `callId, name, args, display?` | Loop has validated args and is about to invoke `executeTool` |
| `tool_call_result` | `callId, ok, summary, data?, error?` | `executeTool` returned (success or handled failure) |
| `turn_complete` | `reason: 'complete' \| 'aborted'` | Terminal event; always last in a stream |
| `error` | `message, code?: 'rate_limited' \| 'quota' \| 'internal' \| 'auth'` | Unrecoverable turn failure (distinct from a tool failure, which keeps the turn alive) |

### Table 2 — `ToolExecutionError.code` (execute.ts:20)

| Code | Meaning |
|---|---|
| `unknown_tool` | Model hallucinated a name not in the registry |
| `invalid_args` | Zod `safeParse` failed; `issues[]` attached |
| `rate_limited` | Tool's `rateLimit` was exceeded for this user in the window |
| `aborted` | `ctx.signal` fired before or during handler |
| `handler_error` | Handler threw; message carries the thrown error's text |

Model-facing text for a failure is `executionToModelMessage` (execute.ts:204)
— `ERROR (<code>): <message>` — designed to give the model enough context
to self-correct on the next round.

---

## Client surface (brief)

The `useAgentTask` hook (components/ai/hooks/use-agent-task.ts) is the
single entry point for UI code. It exposes:

| Return value | Purpose |
|---|---|
| `messages` | `UiMessage[]` — each has id, role, blocks, streaming? |
| `isStreaming` | Whether any fetch is in flight |
| `liveCallIds` | `Set<string>` of tool-call ids currently in-flight (for status-overrides in ToolCallBlockView) |
| `error` | User-facing error string or null |
| `send(text)` | Start a new turn. Write/send tools run in that turn. |
| `abort()` | Cancel the current stream |

Rendering is delegated to block views under
`components/ai/blocks/` (Text, ToolCall) orchestrated by `Transcript`.
Tests live under `tests/lib/ai-tools-*.test.ts`.
