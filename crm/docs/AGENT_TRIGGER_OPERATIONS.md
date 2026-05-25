# Agent Trigger Operations

Operational runbook for the Redis-backed agent runtime trigger pipeline.

## Endpoints

- `POST /api/agent/trigger`
  - Queues trigger to `agent:triggers:<spaceId>`
  - Applies dedupe window (`AGENT_TRIGGER_DEDUPE_WINDOW_S`)
  - Optionally immediate-fires Modal based on `AGENT_IMMEDIATE_EVENTS`

- `GET /api/agent/trigger/config`
  - Returns effective runtime config for current space user

- `GET /api/agent/trigger/events?limit=<n>&offset=<n>&status=<status>`
  - Returns recent trigger outcomes
  - `status`: `queued`, `queued_modal`, `deduped`, `replayed`

- `DELETE /api/agent/trigger/events`
  - Clears recent trigger event log for current space

- `GET /api/agent/trigger/events/summary?limit=<n>`
  - Returns counts, rates, and health signal for recent window

- `GET /api/agent/trigger/health`
  - Returns lightweight health snapshot for dashboards/checks

- `POST /api/agent/trigger/replay`
  - Requeues event from log by `offset`
  - Supports `idempotencyKey`
  - Rejects replaying `status: replayed` unless `allowReplayOfReplay=true`

## Environment variables

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `MODAL_WEBHOOK_URL`
- `AGENT_INTERNAL_SECRET`
- `AGENT_IMMEDIATE_EVENTS` (`all` or comma-separated subset)
- `AGENT_TRIGGER_DEDUPE_WINDOW_S`
- `AGENT_TRIGGER_OPS_ENABLED` (feature flag for ops endpoints; defaults to enabled)

## Suggested alerts

- Trigger summary `health = warn`
- `dedupeRate` sustained above your threshold
- `modalRate` sustained below your threshold
- Replay endpoint 409/429 spikes

## Recovery workflow

1. Check `GET /api/agent/trigger/config` for effective runtime state.
2. Inspect `GET /api/agent/trigger/events` filtered by `status`.
3. Check aggregate shape via `GET /api/agent/trigger/events/summary`.
4. Replay specific events with `POST /api/agent/trigger/replay` + `idempotencyKey`.
5. Clear noisy logs with `DELETE /api/agent/trigger/events` if needed.
6. (Optional) Clear ops audit rows with `DELETE /api/agent/trigger/ops`.

- `GET /api/agent/trigger/ops?limit=<n>&offset=<n>&action=<action>`
  - Returns trigger operations audit rows (`clear_events`, `replay_event`).

- `DELETE /api/agent/trigger/ops`
  - Clears ops audit rows for current space.

## Ops endpoint auth

When `AGENT_TRIGGER_OPS_SECRET` is set, all trigger ops endpoints require one of:

- `x-agent-ops-secret: <secret>`
- `Authorization: Bearer <secret>`

If missing/incorrect, endpoints return `403`.
