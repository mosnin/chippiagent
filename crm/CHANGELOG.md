# Changelog

Chronological record of features, fixes, and changes in Chippi. Most recent first.

Use this to understand what changed, when, and why — so fixes don't conflict with or revert prior work.

---

## 2026-04-24

### Documentation

- **Docs: canonical AI agent reference** — Added `docs/AI_AGENT_SPEC.md` as the single source of truth for the on-demand agent: tool-use loop, SSE protocol, approval gates, sub-agents, and the [tools.usage] observability contract (`cc1f11d`).
- **Docs: Brokerage feature spec** — Landed `docs/BROKERAGE_SPEC.md` in four chunks covering concepts + permissions + data model, feature map for BP1–BP7 and linear steps 1–3, and the full route inventory + audit-logging notes (`b680f91`, `02e2b5b`, `14cedb5`, `491a103`).
- **Docs: repo truth pass** — Reconciled stale claims across `README.md`, `AGENTS.md`, `API_CONTRACTS.md`, `SECURITY.md`, `ENVIRONMENT.md`, `TESTING.md`, and `ARCHITECTURE.md` so the root docs match what actually ships (`e9a2c1a`).

---

## 2026-04-22

### On-demand AI agent + tool catalogue + sub-agents

Replaced the legacy `/api/ai/chat` stub with a real tool-using agent shipped in seven phases. See `docs/AI_AGENT_SPEC.md` for the full contract.

- **Phase 1 — foundations** — Tool registry + zod schemas + auth context (`7ae3b06`), typed SSE event protocol (`43eaad4`), first `search_contacts` tool (`9083ee1`), `Message.blocks` column + block types (`e376ab0`), zod → OpenAI tool-format converter (`2e33e9f`), `executeTool()` orchestration (`660feb4`), and system prompt + message persistence (`d8857d8`).
- **Phase 2 — streaming loop** — `/api/ai/task` streaming endpoint (`4b9a8f9`), three more read-only tools (`98357a9`), loop pauses at mutating tools (`547624a`), and multi-parallel-tool-call coverage (`465d6f0`).
- **Phase 3 — approval gates** — Redis-backed pending-approval store (`bb81163`), `/approve` endpoint + `continueTurn()` resume (`08dd0f4`), `send_email` tool wired end-to-end (`708739f`), plus audit fixes (`fa0edbb`).
- **Phase 4 — chat UI** — Block renderers + Transcript orchestrator (`3beb6ab`), ChatInterface wired onto `/api/ai/task` (`a23aefb`), always-allow-for-this-chat auto approval (`ff37a06`), immediate denial block on Deny (`9d395f7`), and audit fixes (`c1f8926`).
- **Phase 5 — tool catalogue expansion** — Added six new mutating tools to the catalogue (`d7dd474`).
- **Phase 6 — hardening** — Per-tool `summariseCall` + rateLimit + `[tools.usage]` observability + dead-code purge (`4ff6a77`), with a normalised log shape across success/error/abort (`90dc260`).
- **Phase 7 — sub-agents** — Skill pattern plus `contact_researcher`, `pipeline_analyst`, and the `delegate_to_subagent` tool for context-rot prevention (`bd709db`).
- **Post-phase audits** — Two more rounds closing the remaining phase-7 + e2e UX audit items (`95ba883`, `c770d0b`).

### Brokerage tier (BP1–BP7)

Broker-side features delivered in seven phases. See `docs/BROKERAGE_SPEC.md` for the full feature map.

- **BP1 — agent offboarding** — Atomic RPC transfers contacts/deals/tours when removing a realtor; dialog wired + vitest coverage (`6db1e83`, `345e46d`).
- **BP2 — commission ledger** — Schema + APIs plus UI that reads the ledger (`f964404`, `2bc9167`); hardening pass across BP1 + BP2 (`7c7abf2`).
- **BP3 — seat billing** — Seat-limit schema + invite enforcement, Stripe routing + seat usage UI, helper + cap test coverage, and hardening pass (`79582a2`, `4f40323`, `54cec7f`, `19e383c`).
- **BP4 — deal-at-risk dashboard** — Risk view on the broker pipeline with colourblind-safe dots and a healthy-state strip (`b721de9`, `3417eb1`).
- **BP5 — review requests** — Schema + flag UI + first two APIs, then review detail APIs + broker queue UI, API coverage, clickable "Review pending" chip, and offboarding gate + notify enrichment (`a72e108`, `c1507c0`, `1463ed4`, `cd6c99b`, `6d05915`).
- **BP6 — template versioning** — Brokerage templates schema + magic-Note extraction, GET/POST rewrite, `[id]` routes + tests, UI rewrite onto the new API, and security/correctness fixes (`46612ab`, `3246091`, `3e9196b`, `2571397`, `e274236`).
- **BP7 — lead routing** — Auto-routing schema on `Brokerage`, routing engine + settings wiring + tests, plus a no-mutate fix on Supabase responses (`d3176d4`, `511adb5`, `380fd83`).

### Linear steps 1–3

- **Step 1 — Realtor reviews** — New realtor-side "My reviews" page surfacing the broker's review requests (`b524072`).
- **Step 2 — Audit-log viewer** — Broker audit-log viewer that preserves the team-activity feed (`733f4a5`).
- **Step 3 — Routing rules v2** — Lead-routing rules v2 with a sidebar nav entry (`a643658`).
- **Audit fixes** — Security + correctness pass across steps 1–3 (`4e3fc5e`).

### UX polish

- **Feature: Follow-up snooze defaults** — Smarter snooze defaults plus quick-buttons on contact detail (`9cf343c`).
- **Feature: Fuzzy contact search** — Multi-token, multi-field matching on the contacts API (`c607cb2`).
- **Feature: Contacts UX parity** — Mobile controls, skeleton parity, and context-aware empty states (`49e0c6e`).
- **Feature: Kanban drop-zone affordance** — Deal board drop-zone cue plus actionable error toasts (`6fe9e83`).
- **Fix: Inline-edit error toasts** — Deal inline-edit fields surface actionable error toasts on failure (`9670438`).
- **Feature: Permission prompt human preview** — Approval blocks now render human-readable previews for each mutating tool call (part of the phase 6 hardening in `4ff6a77`).

---

## 2026-03-24

### Onboarding & Auth Fixes

- **Fix: Onboarding no longer gets stuck on slug step** — When a slug is taken between the availability check and workspace creation (race condition), users now see a clear "That slug was just taken" message and can pick a different one instead of being stuck with a generic error. Applied to both the inline onboarding flow and the /setup page.
- **Feature: Skip onboarding** — Users can now click "Skip for now" on any onboarding step to bypass setup. They'll be redirected to `/setup` where they can complete workspace creation later at their own pace. New `skip` action added to the onboarding API.
- **Fix: Clerk login page no longer clips on desktop** — Changed `overflow-hidden` to `overflow-y-auto` on the auth page layout container, preventing Clerk UI elements (dropdowns, social buttons, etc.) from being cut off or appearing rounded.
- **Fix: Complete handler updates accountType on re-call** — When a skipped user later completes setup, the `accountType` is now properly saved even if `onboard` was already true.

### Notification System

- **Feature: Resend email notifications for tours** — All tour emails (confirmation, reminder, follow-up, agent notification) migrated from SMTP/Nodemailer to Resend, matching the design language of lead notification emails (dark header, detail boxes, CTA buttons).
- **Feature: Telnyx SMS notifications** — New SMS integration (`lib/sms.ts`) for real-time text notifications:
  - New lead applications → agent SMS with lead name, phone, and score
  - Tour bookings → guest confirmation SMS + agent alert SMS
  - New deals created → agent SMS with deal title and value
  - Follow-up reminders → per-contact agent SMS via cron
- **Feature: Deal email notification** — New `sendNewDealNotification()` email template for deal creation with title, value, address, priority, and linked contacts.
- **Feature: Unified notification dispatcher** (`lib/notify.ts`) — Single entry point for all notifications. Checks both channel preferences (email on/off, SMS on/off) and per-event preferences before dispatching. Functions: `notifyNewLead`, `notifyNewTour`, `notifyNewDeal`, `notifyNewContact`.
- **Feature: Per-event notification toggles** — Users can independently enable/disable notifications for each event type: new leads, tour bookings, new deals, follow-up reminders. These work as a second layer alongside the channel toggles.
- **Feature: Notification settings UI redesign** — Settings page now shows:
  - Delivery channels section displaying the user's actual email address and phone number
  - SMS toggle automatically disabled when no phone number is set
  - Event types section with 4 toggles (only shown when at least one channel is enabled)
- **Fix: Duplicate lead email in /api/public/apply** — Was sending the lead notification email twice (once directly via `sendNewLeadNotification`, once via `notifyNewLead`). Consolidated into a single `notifyNewLead()` call.
- **Fix: SMS template showed agent phone instead of lead phone** — `newLeadSMS` was using the `phone` param (destination) in the message body. Added separate `leadPhone` param so the SMS correctly shows the lead's contact number.

### Broker Dashboard Enhancements

- **Enhancement: Dashboard redesign** — Aligned broker dashboard with realtor dashboard design patterns:
  - Time-aware greeting ("Good morning/afternoon/evening")
  - 6-column stat card grid replacing the old gradient hero card layout
  - Table headers with uppercase tracking-wide pattern
  - Improved empty states with icons, guidance text, and CTAs
  - Max-width 1120px constraint matching realtor dashboard
- **Feature: Broker onboarding checklist** — 4-step guided setup (invite realtors, configure settings, review performance, export report) with progress bar and localStorage-persisted dismissal.
- **Feature: Team activity feed** — New `TeamActivityFeed` component + `/api/broker/activity` API route showing recent leads, deals, and tours across all team members in a colored-dot timeline.
- **Feature: Search on realtors page** — Client-side search input filtering realtors by name or email.
- **Feature: Search on members page** — New `MembersSearch` client component wrapping the server-rendered members list with name/email filtering.
- **Feature: Global search for broker users** — `GlobalSearch` and `NotificationCenter` now visible for all users with a workspace slug, including broker users.

### Schema Changes

New `SpaceSetting` columns (all with ALTER TABLE IF NOT EXISTS migrations):
- `smsNotifications` boolean (default false) — master SMS toggle
- `notifyNewLeads` boolean (default true)
- `notifyTourBookings` boolean (default true)
- `notifyNewDeals` boolean (default true)
- `notifyFollowUps` boolean (default true)

### New Files

- `lib/sms.ts` — Telnyx SMS integration with E.164 formatting and 6 pre-built templates
- `lib/notify.ts` — Unified notification dispatcher
- `components/broker/onboarding-checklist.tsx` — Broker onboarding checklist
- `components/broker/team-activity-feed.tsx` — Team activity timeline
- `components/broker/members-search.tsx` — Members page search wrapper
- `app/api/broker/activity/route.ts` — Broker team activity API

### Dependencies

- Added `telnyx` package for SMS notifications

### Documentation

- Rewrote `README.md` from multi-tenant template to Chippi-specific documentation covering features, tech stack, project structure, and setup
- Updated `ENVIRONMENT.md` with Telnyx and Resend service documentation
- Updated `.env.example` with Resend and Telnyx configuration variables
- Created this `CHANGELOG.md`
