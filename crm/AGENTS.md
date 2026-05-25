# AGENTS.md

Operating manual for AI coding agents working in the Chippi repository.

All AI agents must read and follow this file before making any changes.

---

## 1. Project summary

Chippi is an **agentic operating system for U.S. real estate agents and brokerages.** The realtor's book of business — contacts, deals, stages, tours, applications — is the workspace; Chippi is an autonomous agent that works inside it on the realtor's behalf, with sign-off only where it's needed. The launch wedge is solo realtors handling renter and leasing leads; the product emphasizes speed, clarity, and a polished brand experience.

CRM-style data structures (contacts, deals, pipelines) are the substrate, not the product. New work should make Chippi do **more** on the realtor's behalf — not add more configuration surfaces the realtor has to operate themselves.

**Stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind 4, Supabase (PostgreSQL, accessed via `@supabase/supabase-js` with the service-role key; schema lives in `supabase/schema.sql`), Clerk (auth), OpenAI (scoring + embeddings + assistant), Supabase pgvector (vector search via the `DocumentEmbedding` table and `match_documents` RPC — see `lib/zilliz.ts` for the pgvector wrapper), Upstash Redis (legacy metadata + rate limiting + pending-approval state), Resend (email), Telnyx (SMS), Stripe (billing), Vercel (deployment target). Prisma is **not** in use — there is no `prisma/schema.prisma`, no `prisma.config.ts`, and `@prisma/client` is not imported anywhere in the codebase.

**AI agent runtime**: Interactive chat turns run via the **OpenAI Agents SDK** (`openai-agents` Python package) inside a **Modal sandbox** (`agent/modal_app.py`), deployed with `modal deploy agent/modal_app.py`. The model is **gpt-5-mini** with `reasoning_effort="medium"`. The Next.js layer (`app/api/ai/task/route.ts`) proxies SSE from Modal and handles auth, rate-limiting, and persistence. Set `CHIPPI_CHAT_RUNTIME=ts` to fall back to the in-process TypeScript runtime for local development. Do **not** reference or revert to the TypeScript-only runtime as the primary path — Modal is the mandatory runtime.

---

## 2. Current wedge (must protect)

The launch wedge is narrow and intentional:

- **Who**: new solo realtors in the U.S.
- **What**: renter and leasing lead qualification
- **How**: fast setup, intake link activation, explainable AI-assisted scoring, an agent that actually does the work
- **Activation event**: intake link generation
- **Retention signal**: completed applications and repeated workflow use

Do **not** treat this repo as a generic CRM expansion project. The agentic OS positioning means new work should make Chippi act on the realtor's behalf, not add configuration surfaces the realtor has to operate themselves.

---

## 3. In-scope vs out-of-scope behavior

### In scope by default

- Small, targeted bug fixes
- Copy and text updates
- Scoped UI fixes within existing components
- Documentation updates
- Narrow improvements to existing surfaces when explicitly requested

### Out of scope by default

- New feature development
- Broad refactors or architecture rewrites
- Changing product direction or scope
- Adding libraries or dependencies
- Any edits to protected systems (see section 5) without explicit instruction

---

## 4. Safe workflow for AI agents

Follow this order for every task:

1. **Read** relevant files first. Understand the current state.
2. **Map** the code path and system boundary. Identify which workflow(s) are involved.
3. **Diagnose** before editing. Explain the root cause or plan.
4. **Edit** only what the task requires. No cleanup, no drive-by refactors.
5. **Validate** with commands, manual checks, or build verification.
6. **Report** exact files changed, why each changed, and how changes were tested.

### Pre-edit checklist

- [ ] Read all files that will be modified
- [ ] Confirmed the change stays within one workflow boundary
- [ ] Confirmed no protected system is touched unless task requires it
- [ ] Confirmed the change does not introduce new dependencies or features

---

## 5. Protected areas (explicit)

Do **not** modify these unless the task explicitly requires it:

| # | Protected system | Key files |
|---|---|---|
| 1 | Onboarding logic | `app/onboarding/*`, `app/api/onboarding/route.ts` |
| 2 | Application flow logic | `app/apply/*`, `app/api/public/apply/route.ts` |
| 3 | AI prompts | `lib/ai.ts` (system prompt, provider routing) |
| 4 | Scoring logic | `lib/lead-scoring.ts` (prompt, schema, thresholds, fallback) |
| 5 | OpenAI / model configuration | Model names, temperature, response format in `lib/lead-scoring.ts` and `lib/ai.ts` |
| 6 | Workspace state (contacts, deals, stages) | `app/api/contacts/*`, `app/api/deals/*`, `app/api/stages/*` |
| 7 | Auth | `middleware.ts`, `app/(auth)/*`, Clerk configuration |
| 8 | Billing | `SpaceSetting.billingSettings`, any future Stripe routes |
| 9 | Database schema and migrations | `supabase/schema.sql`, `supabase/migrations/*` |
| 10 | Deployment configuration | `next.config.ts`, `package.json` scripts, `scripts/*` |
| 11 | Core routing and middleware | `middleware.ts`, route matchers, redirect logic |
| 12 | Environment variable handling | `lib/utils.ts` (protocol/domain), `lib/supabase.ts`, `lib/redis.ts` |
| 13 | AI tool registry | `lib/ai-tools/tools/index.ts` (source-of-truth list of every agent-callable tool), `lib/ai-tools/registry.ts`, individual `lib/ai-tools/tools/*.ts` files (each ships its own `requiresApproval` + `rateLimit` contract) |
| 14 | Broker permission helpers | `lib/permissions.ts` (`requireBroker`, `getBrokerContext`, `getBrokerMemberContext`, role predicates) and `lib/api-auth.ts` (`requireAuth`, `requireSpaceOwner`, `requireContactAccess`). Never bypass these with raw `auth()` or ad-hoc role checks. |

---

## 6. Expected output format by task type

### Bugfix tasks

```
- Root cause: <what caused the bug>
- Files changed: <list>
- Why fix is minimal/safe: <explanation>
- Validation: <steps taken + results>
- Risks: <side effects or none>
- Rollback: <how to revert>
```

### Audit / orientation tasks

```
- Current behavior map: <what exists>
- Gaps or risks: <what's missing or fragile>
- Unknowns: <what could not be confirmed>
- No-change confirmation: <confirm nothing was modified>
```

### Feature tasks (only when explicitly requested)

```
- Scope boundaries: <what this feature touches>
- Affected systems: <list of workflows impacted>
- Safety checks: <migration impact, protected system overlap>
- Test plan: <how to verify>
- Rollback plan: <how to undo>
```

---

## 7. Definition of done for AI tasks

A task is done only when:

- [ ] Requested scope is fully addressed
- [ ] Unrelated files are untouched
- [ ] Protected systems unchanged unless explicitly required
- [ ] Verification has been run and reported
- [ ] Final report includes: files touched, reason for each change, and validation evidence

---

## 8. Hard rules

1. **Never** edit AI prompts, scoring logic, or model configuration unless explicitly told.
2. **Never** add features unless explicitly told.
3. **Never** refactor unrelated code while doing targeted work.
4. **Never** modify database schema or migrations unless explicitly told.
5. **Preserve** existing behavior unless behavior change is specifically requested.
6. **Prefer** minimal, scoped edits over cleanup or improvement.
7. **Keep** changes within a single workflow boundary whenever possible.
8. **Report** all files touched and why after every task.
9. **Read** before writing. Always.
