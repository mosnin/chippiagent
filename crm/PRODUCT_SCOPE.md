# PRODUCT_SCOPE.md

What Chippi is, who it serves, and the guardrails that keep new work on-product.

Current as of 2026-05. Read alongside `AGENTS.md` §1–2 (the canonical definition) and `ROADMAP.md` (what's being built now). If this file disagrees with `AGENTS.md`, `AGENTS.md` wins.

---

## 1. What Chippi is

Chippi is an **agentic operating system for U.S. real estate agents and brokerages.**

A realtor's book of business — contacts, leads, deals, tours, properties, applications — is the workspace. Chippi is an autonomous AI agent that works *inside* that workspace on the realtor's behalf: it qualifies inbound leads, drafts and sends follow-up, schedules tours, advances deals, produces marketing content, and surfaces what needs attention — taking sign-off only where a human decision is genuinely required.

**The product is the agent.** The CRM-style data structures underneath it — contacts, deals, pipelines — are *substrate, not the product*. Chippi is not a database the realtor maintains; it is an operator that maintains it for them. It runs two ways:

- **On request** — the realtor talks to Chippi in chat; it does the job and reports back.
- **On its own** — workspace events (new lead, application submitted, tour completed, deal stage change, inbound message) and scheduled sweeps wake Chippi to act in near real-time, without being asked.

Two principles follow, and they govern every scope decision:

1. **New work should make Chippi do more on the user's behalf** — not add a surface the user operates themselves.
2. **A configuration screen is a last resort.** "We'll add a setting" usually means the agent didn't do its job. Decide it, or teach the agent to.

---

## 2. Who it serves

- **Solo and independent realtors** — Chippi runs the lead pipeline end to end.
- **Brokerages** — broker owners and admins oversee a team of agents: lead routing, commissions, deal review, performance. The brokerage tier is *part of one product*, not a separate one — an operating system for real estate spans the individual agent and the firm they belong to.
- **Broker-only users** — oversee a team without running a personal lead workspace.

---

## 3. The launch wedge — the way in, not the ceiling

The product is broad. The **go-to-market entry point is deliberately narrow.** The wedge is how Chippi lands a first user and proves itself fast; it is not a cap on what Chippi is.

- **Who**: new solo realtors in the U.S.
- **What**: renter and leasing lead qualification
- **Why this wedge**: it's the shortest path to a realtor *feeling* the agent do real work — minimal setup, one shareable intake link, an explainable score, follow-up that happens without being asked
- **Activation event**: intake link generated
- **Retention signal**: applications flowing in, and the realtor returning to act on what Chippi surfaced

"Protect the wedge" means: keep the **first-run experience** fast and unsprawled — sign-up to live intake link stays minimal. It does **not** mean the product stops at renter leads. Depth elsewhere is welcome; friction on a new realtor's path to first value is not.

---

## 4. What Chippi does today

A capability snapshot — categorical, not exhaustive. For the live surface map see `ARCHITECTURE.md` and `README.md`.

- **Autonomous agent** — chat plus event-triggered background runs; tool-use across the whole workspace; every mutation is approval-gated; Chippi drafts, it never sends silently
- **Public intake** — branded, customizable, conversational application pages; separate rental and buyer flows
- **Explainable lead scoring** — every lead gets a score, a hot/warm/cold label, and a plain-language reason
- **Lead → contact → deal pipeline** — the CRM substrate, with customizable stages
- **Tours** — scheduling, public booking pages, calendar sync, reminders, post-tour feedback
- **Properties** — listings and shareable property packets
- **Brokerage tier** — team roster, invitations, lead routing, commission ledger, deal review, leaderboards, audit log
- **Studio** — AI image and video generation, brand kit, social-post composer, scheduling and publishing
- **Integrations** — connected toolkits (Gmail, HubSpot, Slack, Google Calendar) become agent tools; Chippi is also exposed as an MCP server
- **Notifications** — email and SMS for leads, tours, deals, follow-ups
- **Analytics** — pipeline, leads, tours, form traffic, team performance
- **Files & documents** — uploads and an in-app document editor
- **Billing** — per-seat brokerage subscriptions are in place; usage-based agent metering is in progress (see `ROADMAP.md`)

---

## 5. Scope guardrails — on-product vs. off-product

Earlier versions of this file kept a list of *forbidden features*. Feature lists rot — several "out of scope" items (team accounts, SMS, marketing tools) shipped, and the doc went stale and started misdirecting. Judge new work by **principle** instead.

**On-product** — the change:

- makes the agent do more of the realtor's work, or do it better
- removes a step the human currently does by hand
- deepens a surface that already exists

**Off-product** — the change:

- adds a setting, toggle, or config surface the realtor must operate themselves — the agent should decide, or learn the preference
- expands toward generic all-in-one CRM breadth that doesn't route through the agent
- ships AI output that isn't explainable or actionable
- adds friction to the sign-up → live intake link path

The test, when unsure: *does this make Chippi more of an operator, or more of a tool the realtor operates?* Operator wins.

Note for AI coding agents: this section describes *product* scope. It does not loosen `AGENTS.md` §3 and §8 — you still never build a feature without explicit instruction, on-product or not.

---

## 6. Anti-goals

1. Don't drift toward a generic CRM dashboard the realtor babysits. The agent does the work.
2. Don't ship "AI magic" without explainability — every AI output is practical and transparent.
3. Don't add setup friction. First-run stays minimal.
4. Don't solve with a setting what the agent could decide or learn.
5. Don't optimize vanity metrics (sign-ups, page views) over activation (intake link generated, applications received, agent actions taken).
6. Don't let breadth degrade the wedge's first-run experience.

---

## 7. What success looks like

- **Setup**: sign-up to live intake link in minutes, not a configuration project
- **Activation**: intake link generated
- **The agent earns trust**: Chippi takes real actions — scored leads, drafted follow-up, booked tours — and the realtor sees and approves them
- **Retention**: the realtor returns to act on what Chippi surfaced, and lets it do more over time
- **Brokerage**: brokers run team oversight — routing, commissions, review — through Chippi rather than spreadsheets
