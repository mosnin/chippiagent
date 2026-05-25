<p align="center">
  <img src="assets/banner.png" alt="Chippi" width="100%">
</p>

# Chippi

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Proprietary-black?style=for-the-badge" alt="License"></a>
  <a href="crm/"><img src="https://img.shields.io/badge/Web-Next.js%2015-000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15"></a>
  <a href="pyproject.toml"><img src="https://img.shields.io/badge/Agent-Python%203.11-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.11"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/Lang-中文-red?style=for-the-badge" alt="中文"></a>
</p>

**An agentic operating system for U.S. real estate agents and brokerages.**

A realtor's book of business — contacts, leads, deals, tours, properties, applications — is the workspace. Chippi is an autonomous AI agent that works *inside* that workspace on the realtor's behalf: it qualifies inbound leads, drafts and sends follow-up, schedules tours, advances deals, produces marketing content, and surfaces what needs attention. It takes sign-off only where a human decision is genuinely required.

The product is the agent. The CRM-style data underneath — contacts, deals, pipelines — is substrate, not the product. Chippi is not a database the realtor maintains; it is an operator that maintains it for them.

---

## Two surfaces, one agent

Chippi runs two ways, and both share the same workspace state, memory, and tools:

| Surface | What it is |
|---------|-----------|
| **Chat** | The realtor talks to Chippi — from the web app, from Telegram, Slack, Discord, WhatsApp, Signal, or the CLI. Chippi does the job and reports back. |
| **Autonomous** | Workspace events (new lead, application submitted, tour completed, deal stage change, inbound message) and scheduled sweeps wake Chippi in near real-time, with no one asking. |

Every mutation is approval-gated. Chippi drafts; it never sends silently.

---

## What Chippi does

A capability snapshot — categorical, not exhaustive. See [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md) and [`crm/ARCHITECTURE.md`](crm/ARCHITECTURE.md) for the live surface map.

<table>
<tr><td><b>Lead intake</b></td><td>Branded, customizable, conversational application pages. Separate rental and buyer flows. One shareable intake link per realtor.</td></tr>
<tr><td><b>Explainable lead scoring</b></td><td>Every lead gets a score, a hot/warm/cold tier, and a plain-language reason a human can read. No black-box "AI magic."</td></tr>
<tr><td><b>Lead → contact → deal pipeline</b></td><td>The CRM substrate, with customizable stages. Kanban board, drag-and-drop, deal review.</td></tr>
<tr><td><b>Tours</b></td><td>Scheduling, public booking pages, calendar sync, confirmations, reminders, post-tour feedback.</td></tr>
<tr><td><b>Properties</b></td><td>Listings and shareable property packets.</td></tr>
<tr><td><b>Brokerage tier</b></td><td>Team roster, invitations, lead routing across agents, commission ledger, deal review, leaderboards, audit log. Stripe-backed per-seat billing.</td></tr>
<tr><td><b>Studio</b></td><td>AI image and video generation, brand kit, social-post composer, scheduling and publishing.</td></tr>
<tr><td><b>Integrations</b></td><td>Connected toolkits (Gmail, HubSpot, Slack, Google Calendar) become agent tools. Chippi is also exposed as an MCP server.</td></tr>
<tr><td><b>Notifications</b></td><td>Email (Resend) and SMS (Telnyx) for leads, tours, deals, follow-ups.</td></tr>
<tr><td><b>Analytics</b></td><td>Pipeline, leads, tours, form traffic, team performance.</td></tr>
</table>

---

## Who it's for

- **Solo and independent realtors** — Chippi runs the lead pipeline end to end.
- **Brokerages** — broker owners and admins oversee a team of agents: lead routing, commissions, deal review, performance.
- **Broker-only users** — oversee a team without running a personal lead workspace.

The brokerage tier is part of one product, not a separate one — an operating system for real estate spans the individual agent and the firm they belong to.

---

## Where the code lives

This repository is one product made of two halves that ship together:

| Path | What's there |
|------|--------------|
| **`crm/`** | The web app and the realtor-facing product. Next.js 15 (App Router), React 19, TypeScript, Tailwind, shadcn/ui. Clerk auth, Supabase + pgvector, Resend, Telnyx, Upstash Redis, Stripe billing. Deployed on Vercel. |
| **repo root** | The Python agent framework — the engine that powers Chippi's reasoning, tool use, memory, skills, and messaging gateways. Forked from [Nous Research's hermes-agent](https://github.com/NousResearch/hermes-agent) and adapted for real estate. |

The web app calls into the agent runtime for chat and tool execution; the agent runtime reaches back into the workspace through the CRM's API and tool registry (`crm/lib/ai-tools/`). Same memory. Same skills. Same Chippi.

```
chippiagent/
├── crm/                    # Next.js web app — the realtor's workspace
│   ├── app/                # App Router pages and API routes
│   ├── components/         # UI components
│   ├── lib/                # Business logic, AI tools, skills, integrations
│   ├── agent/              # Runtime glue for the agent inside the web app
│   └── supabase/           # Database schema
├── chippi_cli/             # Python CLI entry point
├── agent/                  # Agent loop, tool use, planning
├── skills/                 # First-party skills (procedural memory)
├── plugins/                # Messaging gateways, providers, MCP
├── gateway/                # Telegram / Discord / Slack / WhatsApp / Signal
├── chippi                  # CLI launcher (./chippi)
└── pyproject.toml          # Python dependencies (uv)
```

---

## Quick start

### Web app (`crm/`)

```bash
cd crm
cp .env.example .env.local      # fill in Supabase, Clerk, OpenAI keys
pnpm install
pnpm dev                        # http://localhost:3000
```

Database: enable the `vector` extension in Supabase, then run `crm/supabase/schema.sql`. Full env reference in [`crm/ENVIRONMENT.md`](crm/ENVIRONMENT.md).

### Agent framework (repo root)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync                         # creates .venv, installs deps
./chippi                        # auto-detects the venv
```

Then:

```bash
./chippi model        # pick an LLM provider
./chippi tools        # configure enabled tools
./chippi gateway      # start the messaging gateway (Telegram, Discord, ...)
./chippi doctor       # diagnose problems
```

The agent ships with Python 3.11, uv, and an `./chippi` launcher that doesn't need you to activate the venv first. For a more end-to-end install (symlinks `~/.local/bin/chippi`, installs `.[all]`), run `./setup-chippi.sh`.

#### Windows (native, PowerShell)

```powershell
iex (irm https://raw.githubusercontent.com/mosnin/chippiagent/main/scripts/install.ps1)
```

`scripts/install.ps1` handles uv, Python 3.11, Node.js, ripgrep, ffmpeg, and a portable Git Bash — no admin required. WSL2 also works and uses the Linux one-liner above.

---

## Design principles

These come from [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md) and govern every decision:

1. **New work should make Chippi do more on the user's behalf** — not add a surface the user operates themselves.
2. **A configuration screen is a last resort.** "We'll add a setting" usually means the agent didn't do its job. Decide it, or teach the agent to.
3. **Every AI output is explainable.** A score without a reason isn't shipped.
4. **The agent drafts; it never sends silently.** Mutating actions are approval-gated.
5. **Protect the wedge.** New solo realtors get from sign-up to a live intake link in minutes, not a configuration project.

---

## Documentation

Product- and engineering-facing docs live inside `crm/`:

| Doc | What's in it |
|-----|--------------|
| [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md) | What Chippi is, who it serves, scope guardrails |
| [`crm/ARCHITECTURE.md`](crm/ARCHITECTURE.md) | System architecture, data flow, agent runtime |
| [`crm/API_CONTRACTS.md`](crm/API_CONTRACTS.md) | API surface for the web app |
| [`crm/STYLESHEET.md`](crm/STYLESHEET.md) | Design system — tokens, components, voice |
| [`crm/ROADMAP.md`](crm/ROADMAP.md) | What's being built now |
| [`crm/SECURITY.md`](crm/SECURITY.md) | Auth, permissions, data isolation |
| [`crm/ENVIRONMENT.md`](crm/ENVIRONMENT.md) | All environment variables |
| [`crm/AGENTS.md`](crm/AGENTS.md) | Hard rules for anyone (human or AI) writing code here |
| [`AGENTS.md`](AGENTS.md) | Agent framework operating rules |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Dev setup, code style, PR process |

---

## Credits

Chippi's agent engine is built on top of [**hermes-agent**](https://github.com/NousResearch/hermes-agent) by [Nous Research](https://nousresearch.com) — an extraordinary open-source foundation for self-improving agents (skills system, memory, messaging gateways, tool use, terminal backends). We're grateful for it.

This repository forks that framework, renames it Chippi, and adapts it for one job: running the operating system for U.S. real estate professionals. The original framework is MIT-licensed; see [LICENSE](LICENSE).

---

## License

Proprietary. All rights reserved.

The upstream hermes-agent framework that Chippi builds on remains MIT-licensed under its original authors at Nous Research.
