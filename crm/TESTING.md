# TESTING.md

Manual validation playbook for Chippi.

No automated test framework is currently configured in this repository. All validation is manual. This playbook defines what to check after changes.

---

## 1. Local setup requirements

| Requirement | Details |
|---|---|
| Node.js | 18+ |
| Package manager | pnpm (v10.12 configured in `package.json`) |
| Database | Supabase project (PostgreSQL) with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` configured |
| Schema | Run `supabase/schema.sql` in the Supabase SQL Editor (enable the `vector` extension first) |

### Basic run flow

```bash
pnpm install
# Apply supabase/schema.sql via the Supabase SQL Editor
pnpm dev
```

Dev server runs at `http://localhost:3000` with Turbopack.

### Optional services for full functionality

| Service | Required for | Env vars |
|---|---|---|
| OpenAI | Lead scoring, embeddings, AI assistant | `OPENAI_API_KEY` |
| Supabase pgvector | Vector search (RAG context) — same Supabase project; enable `vector` extension and run `supabase/schema.sql` | (none beyond Supabase) |
| Upstash Redis | Rate limiting, pending-approval state for the AI agent, legacy admin/slug path | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| Resend | Transactional emails | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Telnyx | SMS notifications + `send_sms` AI tool | `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER` |
| Stripe | Brokerage billing (`/api/billing/*`) | `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_ENTERPRISE` (+ the Stripe secret/webhook vars) |

---

## 2. Smoke test checklist

Run these after any change to confirm nothing is fundamentally broken:

- [ ] `pnpm dev` starts without crashing
- [ ] Landing page loads at `/`
- [ ] Sign-up page loads at `/sign-up`
- [ ] Sign-in page loads at `/sign-in`
- [ ] Authenticated user hitting `/dashboard` is routed correctly (to workspace or onboarding)
- [ ] `/onboarding` route is accessible for authenticated users
- [ ] Workspace route `/s/[slug]` resolves for valid slug

---

## 3. Core workflow tests

### A. Onboarding

- [ ] New user is redirected to `/onboarding` from `/dashboard`
- [ ] Step 1 (Welcome) renders and "Get started" advances to step 2
- [ ] Step 2 (Profile) saves name, phone, business name
- [ ] Step 3 (Intake link) creates Space + slug, slug validation works, taken slugs are rejected
- [ ] Step 4 (Application flow) informational screen renders
- [ ] Step 5 (Notifications) saves notification preferences
- [ ] Step 6 (CRM preview) renders mock lead card
- [ ] Step 7 (Go live) shows intake link, copy button works, "Go to my CRM" completes onboarding and redirects to `/s/[slug]`
- [ ] `User.onboardingCompletedAt` is set after completion
- [ ] Returning to `/dashboard` after completion redirects to workspace

### B. Intake link and application submission

- [ ] Public apply page loads at `/apply/[valid-slug]`
- [ ] Public apply page returns 404 for invalid slug
- [ ] Form requires name and phone (cannot submit without)
- [ ] Successful submission shows confirmation with scoring result
- [ ] Submission creates a Contact in the correct Space
- [ ] Contact has `tags: ['application-link', 'new-lead']`
- [ ] Contact has `type: QUALIFICATION`
- [ ] Rapid duplicate submission (same name + phone within 2 min) does not create a second Contact
- [ ] Budget is parsed as float when provided

### C. Lead scoring

- [ ] Successful submission with valid `OPENAI_API_KEY` produces scored result (score, label, summary)
- [ ] Score label matches threshold rules: hot (75-100), warm (45-74), cold (0-44)
- [ ] Missing `OPENAI_API_KEY` results in `scoringStatus: 'failed'`, `scoreLabel: 'unscored'`
- [ ] Invalid API key results in fallback unscored state
- [ ] Scoring failure does **not** prevent Contact creation — lead is always saved
- [ ] Fallback summary text: "Scoring unavailable right now. Lead saved successfully."

### D. CRM rendering and actions

- [ ] Leads page (`/s/[slug]/leads`) shows intake-sourced contacts
- [ ] Leads page clears `new-lead` tag from contacts on page load
- [ ] Unread count badge decrements after viewing leads
- [ ] Score, budget, timeline, areas, notes render correctly on lead cards
- [ ] Contacts page (`/s/[slug]/contacts`) loads and shows all contacts
- [ ] Contact creation via CRM form works (CRUD)
- [ ] Contact type filter (QUALIFICATION, TOUR, APPLICATION) works
- [ ] Contact search by name/email/phone/preferences works
- [ ] Deals page (`/s/[slug]/deals`) loads with kanban board
- [ ] Deals can be created with stage assignment
- [ ] Deal drag-and-drop reorders within and across stages
- [ ] Deal stage CRUD works (create, update, delete)

### E. AI assistant (on-demand agent)

Exercises `POST /api/ai/task` (streaming SSE, `lib/ai-tools/loop.ts`) and `POST /api/ai/task/approve/[requestId]` (`lib/ai-tools/continue-turn.ts`). Each bullet should be verifiable in the network panel — watch for the `event: <type>` SSE frames defined in `lib/ai-tools/events.ts`.

- [ ] Assistant page (`/s/[slug]/ai`) loads
- [ ] Sending a message opens a `text/event-stream` response and `text_delta` events arrive incrementally (visible in DevTools → Network → EventStream)
- [ ] A read-only prompt such as "summarise my pipeline" emits `tool_call_start` for `pipeline_summary`, then `tool_call_result` with `ok: true`, then text, then `turn_complete { reason: 'complete' }` — no permission prompt
- [ ] A prompt that triggers a mutating tool (e.g. "send Jane an email asking for her lease end date") emits `permission_required` for `send_email` and the stream closes with `turn_complete { reason: 'paused' }`; no `Message` is sent
- [ ] Approving via `POST /api/ai/task/approve/[requestId]` with `{ "decision": "approved" }` opens a second SSE stream: `permission_resolved`, `tool_call_start` → `tool_call_result` for `send_email`, optional follow-up text, `turn_complete`
- [ ] Denying with `{ "decision": "denied" }` records a `PermissionBlock` (`decision: 'denied'`) in the persisted transcript; on a multi-call batch, the `otherPendingCalls` listed in the original `permission_required` event cascade to `PermissionBlock`s without re-prompting
- [ ] A research prompt like "tell me about Jane Doe" triggers a `tool_call_start` for `delegate_to_subagent` (the orchestrator's handle on the skill registry — see `lib/ai-tools/tools/delegate-to-subagent.ts` and `lib/ai-tools/skills/contact-researcher.ts`); the sub-agent's raw tool calls do NOT appear as orchestrator tool calls, only the summarised `tool_call_result`
- [ ] Each turn writes a new `Message` row: `role: 'user'` with plain `content`, then `role: 'assistant'` with `blocks: MessageBlock[]` (text / tool_call / permission blocks per `lib/ai-tools/blocks.ts`). Tool-only turns still get a content placeholder (`(tool-only turn)`)
- [ ] Missing `OPENAI_API_KEY` returns `503 { error: '...' }` before the stream opens (`MissingOpenAIKeyError` in `lib/ai-tools/openai-client.ts`)
- [ ] Exceeding the task rate limit (31st task inside the hour on a fresh key) returns `429 { error: 'Rate limit exceeded (30 tasks/hour). Please wait.' }`
- [ ] RAG context enrichment works when `DocumentEmbedding` has vectors for the space (verify assistant references CRM records); the assistant still answers when the table is empty (RAG failure is silent)

### F. Auth checks

- [ ] Unauthenticated user accessing `/dashboard` is redirected to `/sign-in`
- [ ] Unauthenticated user accessing `/s/[slug]` is redirected to `/sign-in`
- [ ] Unauthenticated user accessing `/onboarding` is redirected to `/sign-in`
- [ ] Authenticated user can access all intended routes
- [ ] `/apply/[slug]` is accessible without auth (public)
- [ ] API routes return 401 for unauthenticated requests (except `/api/public/apply`)

### G. Settings

- [ ] Settings page (`/s/[slug]/settings`) loads with current values
- [ ] Saving settings persists changes
- [ ] Workspace deletion works and redirects to `/`

### H. Billing checks

- [ ] Current status: Stripe flow not confirmed in code
- [ ] Billing settings field in Settings does not break on save
- [ ] No billing-related errors on page load

---

## 4. Regression checklist

Run these after any change to verify workflow boundaries are intact:

- [ ] Onboarding completion state is unaffected by intake submissions
- [ ] Intake submission state is unaffected by onboarding progress
- [ ] CRM state updates do not alter scoring prompt logic
- [ ] Auth/middleware changes do not break public `/apply` route
- [ ] No schema/migration files changed unless explicitly required
- [ ] Protected systems (see AGENTS.md section 5) unchanged unless explicitly required
- [ ] Leads page still filters by `application-link` tag
- [ ] Scoring still produces `hot/warm/cold/unscored` labels

---

## 5. Workflow boundary validation (required after cross-system changes)

Explicitly verify that onboarding and application are separate states:

| Check | Expected |
|---|---|
| Onboarding completion uses | `User.onboardingCompletedAt` (user-level field) |
| Application submission creates | `Contact` record (per-lead, per-space) |
| Shared completion flag | Must **not** exist |
| Completing onboarding | Does not create contacts |
| Submitting application | Does not affect onboarding state |

If any of these checks fail after a change, the change has introduced cross-workflow coupling and must be reverted or fixed.
