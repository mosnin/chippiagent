# ENVIRONMENT.md

Configuration and external service reference for Chippi. Based on actual repository code.

---

## 1. Environment variables

All variables found or inferable from code usage:

| Variable | Used by | What it powers | Criticality | Failure symptom if missing |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | Supabase project endpoint for all DB operations | **Critical** | All DB operations fail; app crashes on any data access |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.ts` | Server-side Supabase service role (bypasses RLS) | **Critical** | All DB operations fail |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk SDK (client-side) | Auth UI components (sign-in, sign-up) | **Critical** | Auth pages fail to render; sign-in/sign-up broken |
| `CLERK_SECRET_KEY` | Clerk SDK (server-side) | Server-side auth verification, middleware | **Critical** | All protected routes fail; API auth returns errors |
| `OPENAI_API_KEY` | `lib/lead-scoring.ts`, `lib/embeddings.ts`, `lib/ai.ts` | Lead scoring, text embeddings, AI assistant | **High** | Scoring fails (fallback to unscored); embeddings and vector sync fail; assistant returns error message |
| `KV_REST_API_URL` | `lib/redis.ts` | Upstash Redis endpoint | **Medium** | Legacy admin path and slug metadata fail |
| `KV_REST_API_TOKEN` | `lib/redis.ts` | Upstash Redis authentication | **Medium** | Same as `KV_REST_API_URL` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `lib/utils.ts` | Public URL/domain construction for intake links | **Medium** | Falls back to `workflowrouting.com` (prod) or `localhost:3000` (dev); intake link URLs may be wrong if not set correctly |
| `NEXT_PUBLIC_APP_URL` | `lib/email.ts` | Base URL for links in notification emails (e.g. `https://app.yourdomain.com`) | **Medium** | Email links fall back to `https://app.yourdomain.com` placeholder |
| `RESEND_API_KEY` | `lib/email.ts`, `lib/tour-emails.ts` | Resend API key for sending all transactional emails (leads, tours, invitations) | **Medium** | Email notifications silently skipped; leads still saved normally |
| `RESEND_FROM_EMAIL` | `lib/email.ts`, `lib/tour-emails.ts` | Sender address for notification emails (must be verified in Resend) | **Medium** | Falls back to `notifications@updates.yourdomain.com`; must be set to a verified domain |
| `TELNYX_API_KEY` | `lib/sms.ts` | Telnyx API key for SMS notifications and the `send_sms` AI tool | **Medium** | SMS notifications silently skipped; `send_sms` tool returns an error |
| `TELNYX_FROM_NUMBER` | `lib/sms.ts` | Telnyx phone number to send SMS from (E.164 format, validated `^\+\d{10,15}$`) | **Medium** | SMS notifications silently skipped |
| `STRIPE_PRICE_STARTER` | `app/api/billing/checkout/route.ts` | Stripe price ID for the Starter brokerage plan | **Medium** | Starter plan checkout cannot be created |
| `STRIPE_PRICE_TEAM` | `app/api/billing/checkout/route.ts` | Stripe price ID for the Team brokerage plan | **Medium** | Team plan checkout cannot be created |
| `STRIPE_PRICE_ENTERPRISE` | `app/api/billing/checkout/route.ts` | Stripe price ID for the Enterprise brokerage plan | **Medium** | Enterprise plan checkout cannot be created |
| `COMPOSIO_API_KEY` | `lib/integrations/composio.ts`, `agent/integrations.py` | Composio API key for loading the realtor's connected toolkits (Gmail, Slack, HubSpot, etc.) into the chat agent AND autonomous runs | **High (when integrations used)** | Connections show "Connected" in /settings but Chippi can't see them as tools. **Must be set in BOTH Vercel env AND the Modal `chippi-secrets` secret** so chat (Modal) and the Next.js callback both work. |
| `NODE_ENV` | `lib/utils.ts` | Protocol selection (http vs https) | **Auto-set** | Set automatically by Next.js; do not override manually |

### Clerk-specific variables

Clerk requires additional environment variables that are standard for `@clerk/nextjs`. These are not explicitly referenced in application code but are required by the SDK:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Required for client-side Clerk components |
| `CLERK_SECRET_KEY` | Required for server-side auth verification |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional; defaults to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional; defaults to `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Optional; defaults to `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Optional; defaults to `/dashboard` |

---

## 2. What each service powers

| Service | Role in Chippi | Key integration files |
|---|---|---|
| **Clerk** | Authentication, session management, route protection | `middleware.ts`, `app/(auth)/*`, all API routes using `auth()` |
| **Supabase** | Source-of-truth for all app data (users, spaces, contacts, deals, stages, messages, embeddings) | `lib/supabase.ts`, `supabase/schema.sql` |
| **OpenAI** | Lead scoring (gpt-4o-mini), text embeddings (text-embedding-3-small), AI assistant primary provider | `lib/lead-scoring.ts`, `lib/embeddings.ts`, `lib/ai.ts` |
| **Supabase pgvector** | Vector storage and similarity search for RAG-enriched AI assistant context, scoped per workspace | `lib/zilliz.ts`, `lib/vectorize.ts`, `supabase/schema.sql` (`DocumentEmbedding` table + `match_documents` RPC) |
| **Resend** | Transactional email — sends lead notifications, tour confirmations/reminders/follow-ups, brokerage invitations, follow-up digests, and CRM emails | `lib/email.ts`, `lib/tour-emails.ts`, `app/api/public/apply/route.ts` |
| **Telnyx** | SMS notifications — sends text messages to workspace owners for new leads, tour bookings, and deals (opt-in per workspace via settings) | `lib/sms.ts`, `lib/notify.ts` |
| **Upstash Redis** | Rate limiting (`lib/rate-limit.ts`), pending-approval state for the AI agent (`lib/ai-tools/pending-approvals.ts`), legacy slug metadata + admin dashboard | `lib/redis.ts`, `lib/rate-limit.ts`, `lib/ai-tools/pending-approvals.ts`, `lib/slugs.ts`, `app/actions.ts` |
| **Stripe** | Brokerage seat-based billing checkout/portal/webhook | `lib/stripe.ts`, `app/api/billing/checkout/route.ts`, `app/api/billing/portal/route.ts`, `app/api/billing/cancel/route.ts` |
| **Vercel** | Deployment target, analytics, speed insights | `@vercel/analytics`, `@vercel/speed-insights` packages |

---

## 3. Critical vs optional variables

### Must have for app to function

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No data access without it |
| `SUPABASE_SERVICE_ROLE_KEY` | No data access without it |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth UI won't render |
| `CLERK_SECRET_KEY` | Server auth fails |

### Must have for core features

| Variable | Why |
|---|---|
| `OPENAI_API_KEY` | Lead scoring, embeddings, and AI assistant all require it. Vector sync requires embeddings. |

### Nice to have / optional

| Variable | Why |
|---|---|
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Legacy admin path. Core CRM works without it. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Falls back to defaults. Set for correct intake link URLs. |
| `NEXT_PUBLIC_APP_URL` | For correct contact links in notification emails. |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | Required for lead notification emails. Notifications are silently skipped if unset. |
| `TELNYX_API_KEY` + `TELNYX_FROM_NUMBER` | Required for SMS notifications and the `send_sms` AI tool. SMS silently skipped if unset. Users must enable SMS in workspace settings. |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_TEAM` / `STRIPE_PRICE_ENTERPRISE` | Required to initiate brokerage checkout sessions at each tier. Billing flow fails without the tier's price ID. |

---

## 4. Local vs production notes

| Aspect | Local (development) | Production |
|---|---|---|
| Protocol | `http` (derived from `NODE_ENV`) | `https` |
| Default domain | `localhost:3000` | `workflowrouting.com` |
| Build pipeline | `pnpm dev` (Turbopack) | `pnpm build` (`next build`) |
| TS/ESLint errors | Visible in dev | Ignored during build (`next.config.ts`) |

### `.env` files

All `.env*` files are gitignored. Create a `.env.local` file locally with the required variables.

---

## 5. Third-party services map

| Service | Present in code | Package | Status |
|---|---|---|---|
| Clerk | Yes | `@clerk/nextjs@^7.0.1` | Core auth, fully integrated |
| Supabase | Yes | `@supabase/supabase-js@^2.99.1` | Core database, fully integrated |
| OpenAI | Yes | `openai@^6.26.0` | Scoring + embeddings + assistant, fully integrated |
| Supabase pgvector | Yes (via Supabase) | Built into `@supabase/supabase-js` | Vector search for AI RAG context, optional |
| Upstash Redis | Yes | `@upstash/redis@^1.34.9` | Legacy metadata path |
| Vercel | Yes (packages) | `@vercel/analytics@^1.5.0`, `@vercel/speed-insights@^1.2.0` | Deployment target |
| Resend | Yes | `resend@^4.8.0` | All transactional emails (leads, tours, invitations, digests), fully integrated |
| Telnyx | Yes | `telnyx@^6.26.0` | SMS notifications for leads, tours, and deals, plus the `send_sms` AI tool |
| Stripe | Yes | `stripe@^20.4.1` | Brokerage seat-based billing (checkout, portal, cancel). Requires `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_TEAM` / `STRIPE_PRICE_ENTERPRISE` <!-- TODO: verify full list of Stripe secrets (webhook secret, API key) — not inspected in this pass --> |

---

## 6. Per-workspace configuration

The `SpaceSetting` model stores per-workspace configuration:

| Field | Purpose |
|---|---|
| `aiPersonalization` | AI personalization preferences (tone, style) |
| `billingSettings` | Billing preferences (string, not yet functional) |
| `phoneNumber` | Realtor's phone number |
| `businessName` | Business or brand name |
| `intakePageTitle` | Title shown on public intake form |
| `intakePageIntro` | Intro text on public intake form |
| `notifications` | Email notification preference (boolean) |
| `smsNotifications` | SMS notification preference (boolean, default false) |
| `myConnections` | Partner connections / default submission status (JSON string) |

---

## 7. Supabase setup checklist

Before the vector search features work, run the following in the Supabase SQL Editor:

1. **Enable pgvector extension**: Dashboard → Database → Extensions → search "vector" → enable
2. **Run `supabase/schema.sql`**: Creates all tables including `DocumentEmbedding`, the HNSW index, and the `match_documents` RPC function
3. The AI assistant will automatically embed and index contacts/deals as they are created or updated
4. Use `POST /api/vectorize/sync` (with `{ slug }` payload) to back-fill existing records
