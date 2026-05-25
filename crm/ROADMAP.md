# ROADMAP.md

What's being built now, what's next, and what's deliberately not started — so work doesn't collide or fix things about to change.

Current as of 2026-05. Read alongside `PRODUCT_SCOPE.md` (what the product is) and `AGENTS.md` (how to work in this repo).

---

## Current phase

Chippi is well past initial build. The CRM substrate, public intake, lead scoring, tours, the brokerage tier, and the autonomous agent are all shipped and in use.

Current work is **depth, not breadth**: making the agent more capable and more reliable, hardening the integrations layer, extending Studio, and bringing usage-based billing to GA. Forward priorities past the active list below are set by the product owner — this file records them once decided; it does not invent them.

---

## 1. Active work (in progress)

Grounded in open PRs and recent branch history. If a change touches these areas, assume the surrounding code is not final.

| Area | What's happening |
|------|------------------|
| Autonomous agent | Reliability and depth on the Modal agent runtime — event triggers, sweeps, draft quality, tool coverage |
| Studio | AI content surface — image/video generation, brand kit, compose, schedule/publish — actively being extended |
| Integrations | Composio toolkits as agent tools (Gmail, HubSpot, Slack, Calendar); Chippi exposed as an MCP server |
| Chat / cockpit UX | The realtor's chat surface — live status, tool-call rendering, the instrument/cockpit pass |
| Billing & usage | Per-seat brokerage billing is in place; usage metering and plan enforcement for the agent are being built |

**Rule**: If a fix touches an active area, apply a minimal fix and coordinate — don't assume the current code is final.

---

## 2. Next up (planned)

| Item | Notes |
|------|-------|
| Usage-based billing GA | Finish metering, plan caps, and enforcement on top of the per-seat billing already in place |
| Test coverage depth | CI runs typecheck + lint + unit + contract tests; expand coverage as agent surfaces grow |

Beyond this, forward priorities are owner-set. Don't infer a roadmap from this file's silence.

---

## 3. Not started — needs explicit go-ahead

Real candidates, not forbidden — but **do not build speculatively.** Each needs explicit product sign-off before any code (per `AGENTS.md` §3 and §8).

- MLS integration
- Document e-signature
- Native mobile app (a PWA manifest exists; a native app does not)

**Rule**: If a bug fix would be obsoleted by one of these, note it and fix minimally. Don't build toward them without a go-ahead.

---

## 4. Technical debt

| Item | Severity | Where | Notes |
|------|----------|-------|-------|
| Build error suppression | Medium | `next.config.ts` | TypeScript and ESLint errors are ignored at build time. CI catches them on PRs; the build itself does not. |
| Dual agent runtimes | Medium | `lib/ai-tools/*` (TS) vs `agent/*` (Python) | Production chat runs the Python/Modal agent; the TS runtime is a fallback. Two hand-maintained tool catalogs — a new agent verb must be added in both. |
| Legacy Redis slug path | Medium | `app/actions.ts`, `lib/slugs.ts` | Slug metadata in Redis can diverge from Supabase, the source of truth. |
| Two space-creation paths | Low | `app/api/onboarding/route.ts` vs `app/actions.ts` | Different default stage names. Consolidate to the onboarding API. |
| Onboarding auto-heal duplication | Low | `app/dashboard/page.tsx`, `app/s/[slug]/layout.tsx` | Both carry legacy-account backfill logic. |

**Rule**: Tech-debt cleanup is lower priority than active work. Don't refactor debt as a side effect of an unrelated fix.

---

## 5. How to use this file

1. **Before starting work** — check whether your area is in active work (§1). If so, coordinate; the code is moving.
2. **Before fixing a bug** — if the affected code is about to change, apply a minimal fix.
3. **Before building anything in §3** — stop. Get explicit product sign-off first.
4. **After completing work** — update this file if the roadmap state changed.
5. **AI agents** — read this and `PRODUCT_SCOPE.md` before changes that span multiple systems.
