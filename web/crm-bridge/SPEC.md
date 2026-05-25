# SPEC — Option (b): CRM calls the chippi-agent gateway

Concrete contract for the day someone rewires `crm/app/api/ai/task/route.ts` to talk to the chippi-agent framework's HTTP gateway instead of Modal. This is a spec, not an implementation plan; nothing in this repo reads it yet.

Read `README.md` first for the why and when. This doc covers the what and how.

---

## 1. Endpoint choice

**Use `POST /v1/responses` on `gateway/platforms/api_server.py`.** Default port `8642` (overridable via `API_SERVER_PORT`).

Rationale:

- `/v1/responses` is stateful via `previous_response_id`, which maps cleanly to the CRM's `conversationId` (Next.js owns the durable conversation thread; the gateway only needs to chain a single previous turn).
- `/v1/chat/completions` is stateless and re-sends full history every turn — workable but wastes bytes the Next.js layer already has.
- `/v1/runs` is reserved for **autonomous** workspace runs (the future analog of `run_now_webhook` and `run_swarm_endpoint`), where the lifecycle, approval, and stop semantics matter. The chat surface doesn't need them.

Gateway base URL is supplied via a new env var on the Next.js side:

```
CHIPPI_GATEWAY_URL=https://chippi-gateway.internal/v1/responses
```

`MODAL_CHAT_URL` continues to work; `chatRuntime()` gets a third value (`gateway`) alongside the existing `modal` (default) and `ts` (in-process).

---

## 2. Request shape

Today's Modal payload (from `crm/app/api/ai/task/route.ts`, the `payload` object passed to `fetch(modalChatUrl, …)`):

```jsonc
{
  "secret": "<AGENT_INTERNAL_SECRET>",   // shared-secret auth
  "space_id": "<uuid>",                  // tenant scope
  "user_id":  "<clerk_user_id>",         // Composio entity scope
  "message":  "<sanitized user text>",
  "history":  [{ "role": "user|assistant", "content": "…" }],  // capped at 20
  "conversation_id": "<uuid>",
  "attachments": [
    { "id": "…", "filename": "…", "mime_type": "…",
      "extracted_text": "…|null", "public_url": "…" }
  ]
}
```

The framework-native shape POSTed to `/v1/responses`:

```jsonc
{
  "model": "chippi-agent",
  "input":  "<sanitized user text>",                    // string or input-item array
  "previous_response_id": "<gateway response id|null>", // chains prior turn
  "stream": true,
  "metadata": {
    "workspace_id":   "<space_id>",
    "user_id":        "<clerk_user_id>",
    "conversation_id":"<crm_conversation_id>",
    "attachments":    [ /* same shape as today */ ]
  }
}
```

Mapping rules:

| Modal field        | Gateway field                                     | Notes |
|--------------------|---------------------------------------------------|-------|
| `secret`           | `Authorization: Bearer <API_SERVER_KEY>`          | See §3. |
| `space_id`         | `metadata.workspace_id` + `X-Chippi-Session-Key`  | Header scopes long-term memory per workspace. |
| `user_id`          | `metadata.user_id`                                | Required for Composio toolkit loading. |
| `message`          | `input` (string)                                  | When attachments include images, send the multimodal input-item array shape that `_normalize_multimodal_content` in `api_server.py` already accepts. |
| `history`          | none after first turn                             | Gateway chains via `previous_response_id`. Send `history` only on the first turn of a conversation that pre-exists Next.js's switch to the gateway (one-time backfill). |
| `conversation_id`  | `metadata.conversation_id` + `X-Chippi-Session-Id`| Header opts into session continuity inside the gateway. |
| `attachments`      | `metadata.attachments`                            | The framework agent loop reads them like Chippi does today. |

The Next.js side stores `gateway_response_id` on the CRM's `Message` row (new column, or stuffed into existing `metadata` JSONB). Next turn sends it as `previous_response_id`. No history array in steady state.

---

## 3. Auth

Three layers, in order:

1. **Transport.** TLS, gateway behind the same private network or VPC as the Next.js deployment. Public-internet exposure of `/v1/responses` is out of scope for option (b) v1.
2. **Gateway API key.** `API_SERVER_KEY` env var on the gateway side enables Bearer-token enforcement (`api_server.py` lines 824–846). Next.js sends `Authorization: Bearer $CHIPPI_GATEWAY_API_KEY`. This replaces the current `AGENT_INTERNAL_SECRET` shared-secret-in-body pattern.
3. **Tenant scoping.** Until the gateway grows true multi-tenant auth (currently single-tenant — see open question 2 in the README), the workspace boundary is **enforced upstream** by the Next.js route. The gateway trusts whatever `metadata.workspace_id` it receives. Do not expose the gateway to anything other than the Next.js proxy.

When the gateway adds workspace auth later: a `X-Workspace-Id` header validated against a per-tenant signing key, terminating the shared-key model. Out of scope for v1 of option (b).

`X-Chippi-Session-Key` (the framework's long-term memory scope header) requires the API key be configured (`api_server.py` line 884). Set it to `wsp_<workspace_id>` so each CRM workspace gets its own memory bucket. Without this, every workspace shares one bucket — silent cross-tenant memory leak.

---

## 4. Streaming

The gateway emits OpenAI Responses-API SSE events on the wire (`api_server.py:_write_responses_stream`, starting line 1597). The Next.js proxy must translate these into the CRM's browser event format — same job `proxyModalStream` does today, different source vocabulary.

### Event mapping

| Gateway SSE `type`                          | Browser event (`crm/app/api/ai/task/route.ts`) |
|---------------------------------------------|------------------------------------------------|
| `response.output_text.delta`                | `text_delta`        (`delta` passthrough)      |
| `response.reasoning_text.delta`             | `reasoning_delta`                              |
| `response.function_call.added` *(or equiv.)*| `tool_call_start`   (extract `name`, `args`, `call_id`) |
| `response.function_call_output.added`       | `tool_call_result`  (extract `name`, summary, `ok`, `call_id`) |
| `response.completed`                        | `turn_complete`     (+ persist assistant message) |
| `response.error` / `response.failed`        | `error`             (+ persist whatever streamed) |

Plan-card translation (`create_plan` → `plan_created`) stays in the Next.js proxy exactly as it does for Modal today — it is a CRM-UI concern, not a gateway concern.

### Persistence rules (unchanged from today)

- Persist assistant message **exactly once** — on `turn_complete`, on `error`, or in the `finally` after the stream drops. The `persisted` flag pattern from `proxyModalStream` ports over unchanged.
- Persist whatever streamed before a mid-stream `error` so a gateway failure doesn't erase the assistant turn the user already saw.
- Save `previous_response_id` (extracted from `response.created` or the final `response.completed` envelope) onto the assistant `Message` row. The next turn reads it.

### Timeouts

Gateway long-running runs can exceed 60s easily. Match today's bounds:

- Next.js: `export const maxDuration = 300;`
- Gateway runtime: configure agent timeout per-deploy; 600s ceiling matches Modal's `chat_turn` today.
- Use an `AbortController` on the Next.js fetch and forward client disconnects to `POST /v1/runs/{run_id}/stop` only if the chat surface later migrates to `/v1/runs`. For `/v1/responses`, dropping the upstream connection is sufficient.

---

## 5. Per-workspace tool loading

The Modal `chat_turn` calls `load_integration_tools(space_id, user_id)` at turn start to attach the realtor's Composio toolkits (Gmail, Slack, HubSpot, …) before building the agent. The framework today loads tools at agent build time, not per-request.

Two viable paths — pick one before implementation:

- **(i) `extra_tools` in the request.** Next.js looks up the workspace's connected integrations from Supabase, includes a `metadata.toolkits: ["gmail", "slack", …]` list, gateway side has a hook that resolves toolkit names → tool callables and merges them into the agent for that turn. Stateless, simple, fits the current gateway shape.
- **(ii) "Build agent for workspace" hook.** Gateway grows a `workspace_id → Agent` cache; first request for a new workspace runs an init hook that calls into the framework's tool loader. Faster steady-state, more state to manage, requires cache invalidation when the realtor connects a new integration.

Option (i) is recommended for v1 — it preserves the "Next.js owns the workspace state, gateway is stateless about tenancy" boundary that keeps option (b) reversible. Option (ii) becomes interesting once integration count per workspace makes per-turn loading expensive (>200ms).

---

## 6. Persistence boundary

**Next.js stays the source of truth.** The gateway's response store (`api_server.py:_ResponseStore` around line 351, SQLite) is convenience cache only — it lets `previous_response_id` chain a turn without re-sending history, and it backs `GET /v1/responses/{id}`. The CRM's Supabase `Conversation` / `Message` / `Attachment` tables remain the durable record.

This means:

- The gateway's response store can be wiped without losing CRM data (rebuilds itself from `previous_response_id` history on next turn).
- The CRM never reads from `GET /v1/responses/{id}` in steady state — it reads from Supabase.
- TTL on the gateway response store should be ≥ the longest plausible time between turns in one conversation (default to 30 days; configurable).

If a future feature needs the gateway to be the source of truth (e.g. cross-channel conversation continuity across Telegram + CRM-web + Slack for one workspace), revisit. Not for v1.

---

## 7. Error / fallback model

Today's Modal `chat_turn` has a built-in model fallback chain (OpenRouter → next model on 429 / 404). The framework gateway has its own model resolution stack (`gateway/platforms/api_server.py` reads `_resolve_runtime_agent_kwargs`). Decision: **let the gateway own model fallback.** The Next.js proxy treats the gateway as a single logical model surface and only surfaces a user-visible error if the gateway returns a final `error` event.

The TS in-process fallback (`CHIPPI_CHAT_RUNTIME=ts`) stays as a local-dev escape hatch. The decision tree on the Next.js side becomes:

```
chatRuntime() === 'ts'      → streamTsChatTurn(...)
chatRuntime() === 'gateway' → fetch CHIPPI_GATEWAY_URL  (new)
default                     → fetch MODAL_CHAT_URL      (unchanged)
```

Switching production traffic to `gateway` is a single env-var flip per deploy.

---

## 8. What this spec does NOT cover

- The autonomous-run surface (`run_now_webhook`, `run_swarm_endpoint`). Those map to `POST /v1/runs` and deserve their own spec when option (b) for chat is proven out.
- Voice (`/api/ai/transcribe`, `/api/ai/speak`, `/api/ai/realtime-session`). Outside the agent loop — no change needed for option (b).
- Multi-tenant gateway auth. Open question 2 in the README; until resolved, the gateway must remain private to the Next.js proxy.
- Migration of in-flight conversations from Modal to gateway. One-time backfill of `gateway_response_id` is null for legacy threads; the first post-cutover turn sends a one-shot `history` array, the gateway issues a `response_id`, normal chaining resumes from turn two.
