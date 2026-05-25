# ARCHITECTURE.md

System map for Chippi. Based on actual repository contents.

---


## 0. Non-negotiable runtime invariants

1. **Slug-only identity**: Workspace identity is slug-only in runtime (`/s/:slug`, `/apply/:slug`). Never derive workspace identity from host/hostname/header parsing.
2. **Canonical onboarding completion**: Onboarding completion is determined only by `User.onboard`, via `lib/onboarding.ts` helpers.
3. **Canonical intake submission pipeline**: Public intake submissions must go through `app/api/public/apply/route.ts` with `publicApplicationSchema` validation and idempotency safeguards.
4. **DB naming safety**: Runtime field is `Space.slug` maps directly to the `slug` column in Supabase; do not perform destructive column renames without an explicit expand/contract plan.

---

## 1. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router, Turbopack dev) | `next@^15.3.6` |
| Language | TypeScript 5.8 | Build errors currently ignored via `next.config.ts` |
| UI | React 19, Tailwind 4, Radix/shadcn-style components | framer-motion + GSAP for animations |
| Auth | Clerk (`@clerk/nextjs@^7.0.1`) | Middleware-based route protection |
| Database | Supabase PostgreSQL (`@supabase/supabase-js@^2.99.1`) | Service-role key, server-side only |
| AI - scoring | OpenAI (`openai@^6.26.0`) | `gpt-4o-mini`, structured JSON output (scoring only) |
| AI - assistant | OpenAI Agents SDK (Python `agents` + TS `@openai/agents`) running in **Modal sandbox** | `gpt-5-mini` with reasoning, tool-calling loop, fallback chain |
| AI - embeddings | OpenAI `text-embedding-3-small` | 1536-dim vectors |
| Vector DB | Supabase pgvector (`DocumentEmbedding` table) | Per-space rows, HNSW index, COSINE metric via `match_documents` RPC |
| Cache/legacy | Upstash Redis (`@upstash/redis@^1.34.9`) | Slug metadata, admin path |
| Forms | react-hook-form + zod validation | |
| Charts | recharts | |
| Drag/drop | @dnd-kit | Deals kanban board |
| Package manager | pnpm 10.12 | |
| Deployment target | Vercel | Analytics + Speed Insights packages present |

---

## 2. Directory map

```
realestatecrm/
├── app/                        # Next.js App Router pages, layouts, API routes
│   ├── (auth)/                 # Sign-in / sign-up (Clerk hosted components)
│   ├── admin/                  # Admin dashboard (legacy Redis-based)
│   ├── api/
│   │   ├── ai/task/            # On-demand agent streaming endpoint (+ approve/[requestId])
│   │   ├── contacts/           # Contact CRUD + [id] routes
│   │   ├── deals/              # Deal CRUD + [id] + reorder routes
│   │   ├── onboarding/         # Onboarding wizard API (multi-action POST)
│   │   ├── public/apply/       # Public intake form submission (unauthenticated)
│   │   ├── spaces/             # Workspace CRUD
│   │   ├── stages/             # Deal stage CRUD + [id] routes
│   │   └── vectorize/sync/     # Vector sync trigger
│   ├── apply/[slug]/      # Public intake page (prospect-facing)
│   ├── dashboard/              # Routing gate → redirects to workspace or onboarding
│   ├── header/                 # Landing page header
│   ├── legal/                  # Terms, privacy, cookies
│   ├── onboarding/             # 7-step onboarding wizard
│   ├── s/[slug]/          # Authenticated workspace (CRM)
│   │   ├── ai/                 # AI assistant page
│   │   ├── contacts/           # Contacts list + [id] detail
│   │   ├── deals/              # Deals kanban board
│   │   ├── leads/              # Intake leads list
│   │   ├── profile/            # User profile
│   │   └── settings/           # Workspace settings
│   ├── actions.ts              # Server actions (legacy space creation/deletion)
│   ├── layout.tsx              # Root layout (Clerk provider, theme, fonts)
│   └── page.tsx                # Landing page
├── components/
│   ├── ai/                     # Chat interface, message bubble
│   ├── contacts/               # Contact table, form
│   ├── dashboard/              # Sidebar, header, mobile nav
│   ├── deals/                  # Kanban board, column, card, form
│   └── ui/                     # shadcn-style primitives
├── lib/
│   ├── ai.ts                   # AI assistant logic (provider routing, RAG, streaming)
│   ├── embeddings.ts           # OpenAI text-embedding-3-small
│   ├── lead-scoring.ts         # Lead scoring (OpenAI gpt-4o-mini, structured JSON)
│   ├── nav-links.ts            # Landing page nav config
│   ├── redis.ts                # Upstash Redis client
│   ├── space.ts                # Space lookup helpers
│   ├── slugs.ts                # Legacy slug helpers (Redis-based)
│   ├── supabase.ts             # Supabase client singleton (service-role)
│   ├── types.ts                # TypeScript model types (hand-written; Prisma is not in use)
│   ├── utils.ts                # cn(), protocol, rootDomain
│   ├── vectorize.ts            # Contact/deal → vector sync
│   └── zilliz.ts               # Vector storage (Supabase pgvector, interface unchanged)
├── supabase/
│   └── schema.sql              # Full database schema (tables + pgvector + RPC)
├── scripts/
├── middleware.ts               # Clerk auth middleware + route protection
├── next.config.ts              # Next.js config (TS/ESLint errors ignored)
└── package.json                # Dependencies, scripts
```

---

## 3. Major systems and locations

| System | Primary files | Description |
|---|---|---|
| Auth + route protection | `middleware.ts`, `app/(auth)/*` | Clerk middleware protects `/dashboard`, `/s/*`, `/onboarding` |
| Onboarding UI | `app/onboarding/page.tsx`, `wizard-client.tsx` | 7-step wizard: welcome → profile → intake link → app flow → notifications → CRM preview → go live |
| Onboarding API | `app/api/onboarding/route.ts` | Multi-action POST: `start`, `save_step`, `save_profile`, `create_space`, `save_notifications`, `complete`, `check_slug` |
| Public intake form | `app/apply/[slug]/page.tsx`, `application-form.tsx` | Prospect-facing form: name (req), phone (req), email, budget, timeline, areas, notes |
| Intake ingestion | `app/api/public/apply/route.ts` | Creates Contact, deduplicates within 2min window, triggers scoring |
| Lead scoring | `lib/lead-scoring.ts` | OpenAI gpt-4o-mini (scoring only — not the agent) |
| CRM workspace | `app/s/[slug]/*` | Leads list, contacts CRUD, deals kanban, AI assistant, settings, profile |
| Contacts API | `app/api/contacts/route.ts`, `[id]/route.ts` | CRUD with search/filter, async vector sync on create |
| Deals API | `app/api/deals/route.ts`, `[id]/route.ts`, `reorder/route.ts` | CRUD with stage association, position ordering, async vector sync |
| Stages API | `app/api/stages/route.ts`, `[id]/route.ts` | Deal stage CRUD |
| AI assistant | `app/api/ai/task/route.ts`, `app/api/ai/task/approve/[requestId]/route.ts`, `lib/ai-tools/loop.ts`, `lib/ai.ts` | SSE-streamed on-demand agent with a tool-use loop, approval-gated mutations, sub-agent delegation, RAG context from Supabase pgvector, and `Message.blocks` persistence |
| Vector system | `lib/embeddings.ts`, `lib/zilliz.ts`, `lib/vectorize.ts`, `app/api/vectorize/sync/route.ts` | OpenAI embeddings → Supabase `DocumentEmbedding` table, `match_documents` RPC |
| Data model | `supabase/schema.sql` | User, Space, SpaceSetting, Contact, Deal, DealStage, DealContact, Message, DocumentEmbedding |
| Dashboard gate | `app/dashboard/page.tsx` | Redirects to workspace if onboarding complete, or to `/onboarding` |
| Admin (legacy) | `app/admin/*` | Redis-based admin dashboard, legacy path |
| Server actions (legacy) | `app/actions.ts` | `createSlugAction`, `deleteSlugAction` — older space creation path using Redis |

---

## 4. Data flow overview

```
1. User signs in via Clerk
2. /dashboard checks onboarding state
   → If no space: redirect to /onboarding
   → If space exists: redirect to /s/[slug]
3. Onboarding wizard (7 steps):
   → Creates User record (upsert from Clerk)
   → Creates Space + SpaceSetting + default DealStages
   → Sets onboardingCompletedAt on User
4. Intake link: /apply/[slug]
   → Public form → POST /api/public/apply
   → Creates Contact with tags ['application-link', 'new-lead']
   → Calls scoreLeadApplication (OpenAI)
   → Updates Contact with score fields
   → On failure: persists fallback unscored state
5. CRM workspace views:
   → Leads page: reads contacts with 'application-link' tag
   → Contacts page: full CRUD with type filter
   → Deals page: kanban with stages and drag/reorder
6. AI assistant:
   → Streams response via OpenAI
   → Enriches with vector context from Supabase pgvector (scoped to caller's spaceId)
   → Persists messages to Message table
```

---

## 5. Auth flow

- **Middleware** (`middleware.ts`): Clerk middleware protects `/dashboard`, `/s/*`, `/onboarding`. Unauthenticated users are redirected to `/sign-in` with `redirect_url`.
- **Public routes**: `/`, `/sign-in`, `/sign-up`, `/admin`, `/apply/*`, `/legal/*` are accessible without auth.
- **Onboarding guard**: `/dashboard` page and `/s/[slug]/layout.tsx` both check `onboardingCompletedAt` or space existence. Legacy accounts with space but no completion timestamp are auto-healed.
- **API auth**: Protected API routes call `auth()` from Clerk and return 401 if no `userId`.
- **Public API**: `/api/public/apply` does **not** require auth (prospect-facing).

---

## 6. Onboarding flow

7-step wizard persisted via `User.onboardingCurrentStep`:

| Step | Name | What happens |
|---|---|---|
| 1 | Welcome | Intro screen, no data saved |
| 2 | Profile basics | Saves name, phone, business name to User + SpaceSetting |
| 3 | Public intake link | Creates Space with slug, SpaceSetting, default DealStages (New, Reviewing, Showing, Applied, Approved, Declined) |
| 4 | Application flow | Informational — shows what the intake form collects |
| 5 | Notifications | Saves email notification preference and default submission status |
| 6 | CRM preview | Informational — shows mock lead card |
| 7 | Go live | Shows intake link, copy button, test submit. Marks `onboardingCompletedAt`. |

Completion sets `onboardingCurrentStep = 7` and `onboardingCompletedAt = now()`.

---

## 7. Application submission flow

1. Public page at `/apply/[slug]` resolves Space by slug.
2. Form collects: name (required), phone (required), email, budget, timeline, preferred areas, notes.
3. POST to `/api/public/apply` with JSON payload.
4. API validates required fields (`slug`, `name`, `phone`).
5. Deduplication: checks for same name + normalized phone + `application-link` tag within last 2 minutes.
6. Creates Contact with `type: QUALIFICATION`, `tags: ['application-link', 'new-lead']`, `scoringStatus: 'pending'`.
7. Calls `scoreLeadApplication` → updates Contact with score fields.
8. Returns 201 with contact ID and scoring result.
9. On scoring failure: Contact still persisted with `scoringStatus: 'failed'`, `scoreLabel: 'unscored'`.

---

## 8. Scoring flow

- **Function**: `scoreLeadApplication` in `lib/lead-scoring.ts`
- **Model**: OpenAI `gpt-4o-mini`, temperature 0 (lead-scoring only; chat agent uses `gpt-5-mini`)
- **Format**: Structured JSON output via `response_format.json_schema`
- **Input**: name, email, phone, budget, timeline, preferredAreas, notes
- **Output contract** (`LeadScoringResult`):
  - `scoringStatus`: `scored` | `failed` | `pending`
  - `leadScore`: 0-100 or null
  - `scoreLabel`: `hot` (75-100) | `warm` (45-74) | `cold` (0-44) | `unscored`
  - `scoreSummary`: explainable text, max 300 chars
- **Validation**: Zod schema validates parsed JSON
- **Fallback**: On any failure (missing key, empty response, invalid JSON, schema failure, provider error), returns `{ scoringStatus: 'failed', leadScore: null, scoreLabel: 'unscored', scoreSummary: 'Scoring unavailable right now. Lead saved successfully.' }`

---

## 9. CRM flow

- **Leads page** (`app/s/[slug]/leads/page.tsx`): Filters contacts by `application-link` tag. Clears `new-lead` tag on page load. Shows score, budget, timeline, areas, notes, scoring summary.
- **Contacts page** (`app/s/[slug]/contacts/page.tsx`): Full CRUD. Lifecycle types: `QUALIFICATION`, `TOUR`, `APPLICATION`. Search by name/email/phone/preferences.
- **Deals page** (`app/s/[slug]/deals/page.tsx`): Kanban board with DealStages. Drag-and-drop via @dnd-kit. Position-based ordering.
- **Contact detail** (`app/s/[slug]/contacts/[id]/page.tsx`): Individual contact view.
- **AI assistant** (`app/s/[slug]/ai/page.tsx`): Chat interface with streaming responses and message history.

---

## 10. Billing flow

- **Current state**: `SpaceSetting.billingSettings` field exists as a string column.
- **Settings UI** shows a billing settings input field.
- **No Stripe package** in dependencies. No Stripe-related API routes.
- **Intended pricing** (per product context, not confirmed in code): $97/month, 7-day free trial.
- **Status**: Billing is boundary-sensitive. Treat as not yet implemented.

---

## 11. Deployment notes

- **Build command**: `next build`
- **`next.config.ts`**: ignores TypeScript and ESLint build errors (`ignoreBuildErrors: true`, `ignoreDuringBuilds: true`)
- **Vercel packages**: `@vercel/analytics`, `@vercel/speed-insights` present
- **Domain handling**: `NEXT_PUBLIC_ROOT_DOMAIN` env var, falls back to `workflowrouting.com` (prod) or `localhost:3000` (dev). Protocol derived from `NODE_ENV`.

---

## 12. Known risks, coupling points, unclear areas

1. **Legacy Redis path**: `app/actions.ts` and `lib/slugs.ts` use Upstash Redis for slug metadata. The admin dashboard also relies on Redis. Potential for state divergence with Supabase as source of truth.
2. **Build error suppression**: TypeScript and ESLint errors are ignored during build. Type and lint issues can accumulate silently.
3. **Billing not implemented**: Field and UI exist but no payment processing. Enabling billing will require Stripe integration and careful boundary work.
4. **Tenant isolation**: API routes check auth and all vector queries are scoped by `spaceId`, but workspace ownership verification in other routes varies. Sensitive area for security review.
5. **Onboarding auto-heal**: Both `/dashboard` and `/s/[slug]/layout.tsx` contain onboarding completion auto-heal logic for legacy accounts. Duplicated logic.
6. **Two space creation paths**: `app/api/onboarding/route.ts` (create_space action) and `app/actions.ts` (createSlugAction) both create spaces with different default stage names.
7. **Vector dependency optional**: pgvector/embeddings failures are silently caught — assistant works without RAG. But scoring requires OpenAI.
8. **pgvector setup**: The `vector` extension and `DocumentEmbedding` table must be created in Supabase before vector sync works. Run the additions in `supabase/schema.sql` via the Supabase SQL Editor.

---

## 13. Multi-Account Role & Organization System

Added in migration `20260314000003_org_system.sql`.

### Roles

| Level | How determined | Access |
|---|---|---|
| **Realtor** | Default for all users | Own workspace only |
| **Broker** | Has `BrokerageMembership` with `role IN (broker_owner, broker_admin)` | `/broker` dashboard + member oversight |
| **Platform Admin** | `User.platformRole = 'admin'` OR Clerk `publicMetadata.role = 'admin'` | `/admin` + all management |

Grant platform admin via DB: `UPDATE "User" SET "platformRole" = 'admin' WHERE "clerkId" = '...';`

### Organization Model

```
User (1) → Space (1, realtor workspace, optional Brokerage FK)
         → BrokerageMembership (0..n)

Brokerage (1) → BrokerageMembership (n) → User
             → Invitation (n)
```

Key constraints:
- One `Space` per `User` — `UNIQUE(Space.ownerId)`
- One `Brokerage` per owner — `UNIQUE INDEX ON Brokerage(ownerId)`
- One membership per user per brokerage — `UNIQUE(brokerageId, userId)`
- Realtor workspace stays fully independent even when linked to a brokerage

### Permission Helpers (`lib/permissions.ts` + `lib/api-auth.ts`)

Four helpers gate every API route and server component. They all share an **offboarding hard-stop**: if the caller's `User.status === 'offboarded'`, the helper rejects (or returns `null`) even when Clerk auth is otherwise valid — a broker-initiated offboarding has to lock the user out of the API immediately, before their Clerk session naturally expires. The check is wrapped in a try/catch so a missing `status` column (pre-BP1a migration) falls through as active.

| Helper | Module | Returns | Use when |
|---|---|---|---|
| `requireAuth()` | `lib/api-auth.ts` | `{ userId }` or a `401`/`403` `NextResponse` | Default on every protected API route — gates on Clerk session + `User.status != 'offboarded'` |
| `requireBroker()` | `lib/permissions.ts` | `{ brokerage, membership, dbUserId }` — throws `Forbidden: broker access required` otherwise | Routes restricted to `broker_owner` or `broker_admin` (loads `BrokerageMembership` after the shared auth + offboarding check) |
| `getBrokerContext()` | `lib/permissions.ts` | Same shape as `requireBroker` **or `null`** | Server components / pages that want to redirect instead of 500 on non-brokers (e.g. `app/broker/activity/page.tsx`) |
| `getBrokerMemberContext()` | `lib/permissions.ts` | Same shape as `getBrokerContext`, including `realtor_member` | Broker-scoped pages that need to be reachable by any brokerage member, not just admins/owners |

Supporting helpers: `isPlatformAdmin()` + `requirePlatformAdmin()` for `/admin` routes, `getCurrentDbUser()` for resolving Clerk `userId` → internal `User` row, and role predicates `canManageLeads` / `canEditSettings` / `canManageRoles` / `canChangeRole`.

**Dual-auth pattern** — `POST /api/broker/reviews/[id]/comments` (`app/api/broker/reviews/[id]/comments/route.ts`) accepts **either** a broker member of the review's brokerage **or** the requesting agent who opened the review. This is the canonical template for "a broker OR the involved agent can do X" endpoints: call `requireAuth()` first, load the resource, then allow access if the caller is in the brokerage (via `getBrokerMemberContext` / direct membership lookup) OR if `resource.requestingUserId === dbUser.id`.

### Invitation Lifecycle

```
pending → accepted   (user clicks accept, creates BrokerageMembership)
pending → expired    (expiresAt < now, auto-marked on accept attempt)
pending → cancelled  (future: admin cancels)
```

Invitation token is a 64-char hex string generated by DB (`encode(gen_random_bytes(32), 'hex')`).

### Broker Dashboard (`/broker`)

- Overview: member count, pending invites, leads needing follow-up, applications received
- Members: roster with activation status and workspace slug
- Invitations: sent list + inline send form

### Self-serve Brokerage Creation

Realtors create a brokerage from **Configure → Brokerage** in their workspace. This calls `POST /api/broker/create`, creates a `Brokerage` + `BrokerageMembership (broker_owner)`, and redirects to `/broker`.
