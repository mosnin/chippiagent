# INTEGRATION.md

How this repository came to be, what's in it, and what's still rough.

Read alongside [`README.md`](README.md) (the product pitch) and [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md) (what Chippi is for).

---

## 1. Why this repo exists

`chippiagent` is the union of two upstream projects, merged into a single tree so they ship as one product:

| Upstream | What it gave us |
|----------|----------------|
| [Nous Research / `hermes-agent`](https://github.com/NousResearch/hermes-agent) | A Python agent framework — runtime, tool use, skills, plugins, CLI, messaging gateways, MCP server. The engine. |
| [`mosnin/realestatecrm`](https://github.com/mosnin/realestatecrm) | A Next.js 15 web app with a real-estate domain agent: lead intake, scoring, deal pipeline, tours, brokerage tier. The product surface. |

The unified product is **Chippi: an agentic operating system for U.S. real estate agents and brokerages.** The framework is the brain; the CRM is the workspace it operates inside. They are not two products talking over an API; they are one product that happens to have a Python half and a TypeScript half.

The realtor's book of business — contacts, leads, deals, tours, properties, applications — is substrate. Chippi is the operator on top.

---

## 2. The rename (hermes → chippi)

The hermes-agent upstream is wholesale-renamed. Every case-insensitive occurrence of `hermes` was rewritten to `chippi` with case preserved:

- `Hermes` → `Chippi`
- `hermes` → `chippi`
- `HERMES` → `CHIPPI`
- `HermesAgent` → `ChippiAgent`, etc.

**Scale:** ~2,484 files modified, ~50 paths renamed (modules, directories, plugin names, CLI entry points, env vars, docs).

**Git history:** the diff is captured in the last two commits — `HEAD~2` is the raw upstream import, `HEAD~1` is the mechanical rename. The merge commit at `HEAD` lays the CRM next to it. To inspect:

```bash
git log --oneline -3
git show HEAD~1 --stat | head -50      # the rename diff
```

The rename was mechanical. Where it touched things it shouldn't have, see §4.

---

## 3. Repository map

```
chippiagent/
├── (repo root)              the chippi agent framework (renamed hermes-agent)
│   ├── chippi               CLI launcher (./chippi)
│   ├── chippi_cli/          CLI commands (model, tools, gateway, doctor, ...)
│   ├── agent/               agent loop, planning, tool use
│   ├── skills/              first-party skills (procedural memory)
│   ├── plugins/             gateways, providers, MCP, CRM-derived plugins
│   ├── gateway/             Telegram / Discord / Slack / WhatsApp / Signal
│   ├── cli.py               legacy CLI entry
│   ├── pyproject.toml       Python deps (uv-managed)
│   └── docker-compose.yml   one-command stack
│
├── crm/                     the realestatecrm contents, unmodified layout
│   ├── app/                 Next.js 15 App Router (pages + API routes)
│   ├── components/          UI components (shadcn/ui, dashboards, kanban)
│   ├── lib/                 business logic, AI tools, skills, integrations
│   │   └── ai-tools/        the 33-tool registry the agent uses
│   ├── agent/               Python sub-agent that runs the CRM domain
│   ├── supabase/            schema + migrations
│   └── docs/                product docs (ARCHITECTURE, ROADMAP, etc.)
│
├── plugins/chippi-*/        CRM-derived plugins ported into the framework
│   ├── chippi-lead-manager/
│   ├── chippi-deal-tracker/
│   ├── chippi-tour-assistant/
│   ├── chippi-broker-tools/
│   ├── chippi-follow-up-writer/
│   ├── chippi-listing-writer/
│   ├── chippi-analytics/
│   ├── chippi-notes/
│   └── chippi-achievements/
│
├── skills/domain/real-estate/   domain skill exposing the CRM's 33 tools
│
└── web/crm-bridge/          docs for how the Next.js CRM talks to the framework
```

### What lives where, in one line each

| Path | What it does |
|------|--------------|
| `/` (root) | The renamed hermes-agent framework — runtime, plugins, gateways, CLI |
| `/crm/` | The Next.js web app and the realtor-facing product |
| `/crm/agent/` | The CRM's own Python sub-agent (separate `pyproject.toml`) |
| `/crm/lib/ai-tools/` | The 33-tool TypeScript registry the web app uses today |
| `/plugins/chippi-*/` | Real-estate plugins, ported into the framework's plugin system |
| `/skills/domain/real-estate/` | Domain skill that exposes the CRM's 33 tools to the framework |
| `/web/crm-bridge/` | Spec for the Next.js → framework gateway handoff |
| `/gateway/`, `/plugins/` | Inherited from hermes-agent — messaging surfaces and provider plugins |
| `/docker-compose.yml`, `/Dockerfile` | Runs both halves together |

---

## 4. Known issues from the rename

The `s/hermes/chippi/` was mechanical and caught things it shouldn't have. Tracked here so they don't get missed.

### 4.1 The Nous Hermes model rename (broken)

The hermes-agent codebase referenced the external **"Nous Hermes"** LLM family from Nous Research (available on OpenRouter and Hugging Face) as one of its supported model providers. The rename rewrote those identifiers to **"Nous Chippi"**, which does not exist as a model anywhere.

**Files affected:**

- `cli.py` — model detection / selection
- `chippi_cli/model_switch.py` — provider switching logic
- `chippi_cli/models.py` — model registry and constants
- `tests/chippi_cli/test_nous_chippi_non_agentic.py` — test file (was `test_nous_hermes_non_agentic.py`)

**Symptom:** model-name detection regexes, registry lookups, and tests will fail or skip when checked against real provider responses. Calls that resolve to the "Nous Chippi" name will 404 against OpenRouter / Hugging Face.

**Fix options:**

1. **Surgical revert** — restore the literal string `"Nous Hermes"` (and the test filename) at the touched call sites. Lowest risk; preserves the rest of the rename.
2. **Switch defaults** — change the default model away from the Nous Hermes family entirely, and drop the dead code paths. Cleaner long term; requires picking a replacement.

### 4.2 Other suspect strings

Other model names, third-party product names, or external URLs containing the literal `hermes` may have been rewritten the same way. Suspect anywhere the framework references **external** systems by name — provider strings, dataset names, HF repo IDs, package names, doc links, banner art alt text. Sweep and log to `FOLLOWUPS.md` as found.

A grep for the lowercase `chippi` inside string literals that point at external services is the fastest way to catch them.

---

## 5. Development setup

### 5.1 Framework only (Python)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync                       # creates .venv, installs deps
./chippi                      # CLI; auto-detects the venv
```

CLI subcommands you'll use first:

```bash
./chippi model        # pick an LLM provider
./chippi tools        # configure enabled tools
./chippi gateway      # start the messaging gateway
./chippi doctor       # diagnose problems
```

For an end-to-end install that symlinks `~/.local/bin/chippi` and installs `.[all]`, run `./setup-chippi.sh`.

### 5.2 CRM only (Next.js)

```bash
cd crm
cp .env.example .env.local    # fill in Supabase, Clerk, OpenAI keys
pnpm install
pnpm dev                      # http://localhost:3000
```

Database: enable the `vector` extension in Supabase, then run `crm/supabase/schema.sql`. Full env reference in [`crm/ENVIRONMENT.md`](crm/ENVIRONMENT.md).

### 5.3 Both at once (Docker)

```bash
docker-compose up
```

See [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml) at the repo root.

---

## 6. Where to go next

The integration commits put the two halves side by side. To make this truly **one product** rather than two products that share a repo, the next steps are:

### 6.1 Wire the CRM to the framework gateway

The CRM today posts agent tasks to a Modal webhook at `/api/agent/trigger`. The framework already has a gateway that can serve those calls natively.

- Re-point `crm/app/api/ai/task/route.ts` (and any other agent-task entry points) at the chippi-agent framework gateway.
- Drop the Modal dependency once parity is verified.
- Spec: [`web/crm-bridge/SPEC.md`](web/crm-bridge/SPEC.md).

### 6.2 Promote the CRM's 33 tools to first-class framework tools

The CRM exposes its tool registry in TypeScript (`crm/lib/ai-tools/`) and currently appears in the framework only as a skill *descriptor* under `skills/domain/real-estate/`. To make them callable from any chippi runtime (CLI, gateway, MCP server), the tools need to exist as first-class Python tool definitions in the framework — not just a manifest the framework reads about.

Two ways to do it:

1. Generate Python wrappers from the TS definitions at build time.
2. Hand-port the most-used tools and treat the TS side as the source of truth for the rest via HTTP.

### 6.3 Consolidate the two `pyproject.toml` files

Today there are two: the framework's root `pyproject.toml`, and `crm/agent/pyproject.toml` for the CRM's own Python sub-agent. They install overlapping deps and can drift.

- Decide whether the CRM's sub-agent is a separate package or a subdirectory of the framework workspace.
- If workspace: a single `pyproject.toml` with uv workspaces.
- If separate: pin a compatibility matrix and a release process.

### 6.4 Smaller follow-ups

- Resolve the rename damage in §4 before any release.
- Consolidate the two `AGENTS.md` files (root + `crm/`) so the operating rules don't drift apart.
- Decide whether the framework's `gateway/` (Telegram, Discord, etc.) and the CRM's notification surfaces (Resend, Telnyx) should share a unified outbound dispatcher.

---

## 7. The mental model

If you remember nothing else:

> **The framework is the runtime. The CRM is the workspace. The product is the agent that operates the workspace using the runtime. Chippi is one product, not two.**

Every architectural decision should push toward that line.
