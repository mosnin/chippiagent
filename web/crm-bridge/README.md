# CRM ↔ chippi-agent bridge

This directory documents how the two halves of this repository connect:

- **`crm/`** — a Next.js real-estate CRM (mosnin/realestatecrm). Its chat surface ships with its own Python agent (`crm/agent/`) hosted on Modal.
- **Repo root** — the **chippi-agent** Python framework (formerly Nous Research's hermes-agent, renamed `hermes → chippi`). Exposes the agent via the `gateway/` and `web/` surfaces. Today this is a separate runtime — no live integration with the CRM exists.

This is a **docs-and-spec deliverable**, not runtime code. Nothing here is imported by the Next.js app or the framework.

---

## The two halves today

### CRM agent (`crm/agent/`)

Definition: `crm/agent/chippi.py` — a single OpenAI Agents SDK agent ("Chippi") with ~33 tools wired to the CRM's Postgres / Supabase / Composio integrations.

Runtime: `crm/agent/modal_app.py` — deployed to Modal as `chippi-agent`, exposing three `@modal.fastapi_endpoint` POSTs:

- `chat_turn` — interactive chat (called by `crm/app/api/ai/task/route.ts`)
- `run_now_webhook` — autonomous run for one space
- `run_swarm_endpoint` — swarm execution (called by `/api/swarm`)

The Next.js route `crm/app/api/ai/task/route.ts` is a streaming proxy: auth, rate-limit, persist message, `fetch(MODAL_CHAT_URL)`, translate Modal SSE events into the browser's event format, persist the assistant turn. The model loop itself runs entirely on Modal.

### chippi-agent framework (repo root)

Definition: the AIAgent + tool/skill/memory system in `agent/`, `tools/`, `skills/`, `providers/`.

Runtime surfaces (see `gateway/platforms/`):

- **`api_server.py`** — OpenAI-compatible HTTP server (default `127.0.0.1:8642`). Endpoints include `POST /v1/chat/completions` (with SSE streaming + optional session continuity), `POST /v1/responses` (stateful via `previous_response_id`), `POST /v1/runs` (async jobs with `/events` SSE), and `/v1/models`, `/v1/capabilities`, `/health`.
- **`webhook.py`** — generic webhook receiver (HMAC-secured) on `:8644`, transforms third-party events into agent prompts.
- Twenty-odd messaging platform adapters (Telegram, Slack, WhatsApp, Signal, Matrix, email, etc.).

The framework is what the user runs from the CLI (`chippi`), from a TUI (`ui-tui/`), from a desktop pairing flow (`web/`), or behind an OpenAI-compatible reverse proxy.

---

## Two possible bridge shapes

### Option (a) — Parallel runtimes. **Recommended for now.**

Keep `crm/app/api/ai/task/route.ts` pointed at `MODAL_CHAT_URL` exactly as it is today. The chippi-agent framework lives alongside the CRM as a **developer-facing CLI / gateway** — useful for local iteration on tools, for the desktop pairing UX in `web/`, and for the OpenAI-compatible adapters that let external chat frontends talk to the agent.

Why this is the right move now:

- **Zero risk to a shipping product.** The CRM agent runs in customer hands today. Modal is a known-good substrate; the `chat_turn` SSE protocol is wired end-to-end including persistence, plan cards, tool-call correlation, and mid-turn error recovery. Replacing the transport buys nothing the user sees.
- **The two runtimes diverge on purpose.** The CRM agent is purpose-built (CRM-specific tools, Supabase, Composio, Clerk userId scoping). The framework is a general OpenAI-compatible agent host. Fusing them prematurely pays integration tax without unlocking a feature.
- **No shared deploy surface yet.** The framework's `gateway/` is meant for a local/self-hosted runtime, not a multi-tenant SaaS. Pointing the CRM at it would require it to grow workspace auth, per-tenant rate limits, billing-aware token caps, and the AGENT_INTERNAL_SECRET handshake — all of which Modal + the Next.js proxy already give us.

What we get under (a):

- The CRM keeps calling `chat_turn` on Modal. No code in `crm/` moves.
- The framework keeps shipping its own surfaces (`chippi` CLI, gateway adapters, web pairing).
- Engineers iterating on agent behavior can use the framework's hot-reload CLI loop locally; production traffic continues to hit the Modal-deployed `crm/agent/`.
- Cross-pollination (tool patterns, prompt techniques, memory shapes) happens by hand at the code-review level, not via a live network hop.

### Option (b) — CRM calls the framework's gateway. **Future target.**

Rewire `crm/app/api/ai/task/route.ts` to POST to one of the framework's `gateway/platforms/api_server.py` endpoints instead of Modal. The agent loop runs inside the framework runtime, hosted wherever we choose (self-hosted, Fly, Modal, bare metal — the framework doesn't care).

When option (b) becomes worth doing:

- We want a single agent runtime serving both the CRM chat surface **and** other channels (Telegram, Slack, WhatsApp) for the same workspace, with one shared conversation state.
- The framework's session/run/event model (with `/v1/runs/{id}/stop` for interruption) becomes load-bearing for CRM UX that the Modal proxy can't deliver as cleanly.
- Operational cost or reliability of Modal swings hard enough that re-platforming pays for itself (see the audit note in `modal_app.py` — currently Modal Standard is the right call).

The concrete contract for option (b) is in **`SPEC.md`** — endpoint, request/response shapes, auth, streaming, the exact mapping from today's Modal `chat_turn` payload to a framework-native call.

---

## Open questions

These need a human decision before option (b) can be picked up:

1. **Which endpoint?** `POST /v1/responses` (stateful, matches the CRM's per-conversation persistence) or `POST /v1/runs` (async, lifecycle events, stop). The spec leans toward `/v1/responses` for the chat surface and reserves `/v1/runs` for autonomous workspace runs.
2. **Multi-tenant auth.** The framework's gateway today assumes single-tenant (a developer running their own chippi). Option (b) requires either a tenant-scoping header convention (`X-Workspace-Id` + a shared secret) or a real auth middleware that resolves a workspace before the agent loop runs.
3. **Tool loading per workspace.** The CRM dynamically loads each realtor's Composio toolkits at turn start (Gmail, Slack, HubSpot etc., scoped by Clerk `user_id`). The framework loads tools at agent build time. Option (b) requires the framework to either accept a per-request `extra_tools` payload or expose a "build agent for workspace" hook the gateway can call.
4. **Persistence boundary.** Today the Next.js proxy owns persistence (Supabase `Conversation` / `Message` / `Attachment` tables). The framework owns its own session/response stores. Option (b) needs a clear answer: does Next.js stay the source of truth and the framework is stateless, or does the framework become the source of truth and Next.js becomes a thin reader?
