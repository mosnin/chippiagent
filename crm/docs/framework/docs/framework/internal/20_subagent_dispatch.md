# 20 Sub-Agent Dispatch

> **TL;DR:** Pre-built agent recipes for parallelizing expensive build phases. Includes exact file lists, prompt templates, output contracts, and coordination patterns. Only 4 of 15 phases benefit from agents — the rest are faster done inline.
> **Covers:** agent dispatch recipes, parallelism maps, context budgets, anti-patterns | **Depends on:** all phase files, MANIFEST.md | **Used by:** CLAUDE.md (build phases) | **Phase:** 2, 9, 13, 14

## Purpose

Define when and how to use sub-agents during the build process. Most phases are small enough to run inline. Four phases have genuinely independent work units that benefit from parallel agents. This file provides copy-paste agent recipes for those phases.

## Decision Rule

**Use agents when:**
- A phase has 3+ independent work units (no shared state between them)
- Each unit needs to read 2+ framework files (enough context to justify isolation)
- The total phase would take 3x+ longer sequentially

**Do NOT use agents when:**
- Work is sequential (each step depends on the previous)
- The phase is conversational (needs user input mid-way)
- There's only 1-2 files to produce
- The work is small enough that agent coordination overhead > time saved

## Phase Parallelism Map

| Phase | Parallel? | Why |
|-------|-----------|-----|
| 0 Welcome | No | Conversation |
| 1 Discovery | No | Conversation |
| **2 Project Docs** | **Yes** | 9 independent docs |
| 3 Architecture | No | Needs holistic view of all project docs |
| 4 Foundation | No | Sequential: setup → schema → utils |
| 5 Auth | No | Sequential flow, shared middleware |
| 6 Onboarding | No | Sequential flow |
| 7 App Shell | No | Single cohesive layout |
| 8 Dashboard | No | Single page |
| **9 Core Features** | **Yes** | N independent feature modules |
| 10 Settings & Billing | No | Small scope, shared layout |
| 11 Admin | No | Small scope, shared layout |
| 12 Email Templates | No | Small scope, shared base template |
| **13 Marketing Site** | **Yes** | Independent pages, heavy context |
| **14 Polish** | **Yes** | 6 independent audit tracks |

---

## Recipe 1: Phase 2 — Project Doc Generation

### Strategy
3 agents, 3 docs each. All read the same templates but produce different outputs.

### Agent A — Identity & Flows (3 docs)

```
Prompt: Generate 3 project docs for [APP_NAME] based on the discovery notes below.

Read these template files for structure and tone:
- docs/framework/templates/00_app_idea_template.md
- docs/framework/templates/01_project_brief_template.md
- docs/framework/templates/03_user_flows_template.md

Generate these files with concrete, app-specific content (no generic placeholders):
1. docs/project/00_app_idea.md
2. docs/project/01_project_brief.md
3. docs/project/03_user_flows.md

Discovery notes:
[PASTE DISCOVERY SUMMARY]

Output: Write all 3 files. No summary needed.
```

### Agent B — Features & Specs (3 docs)

```
Prompt: Generate 3 project docs for [APP_NAME] based on the discovery notes below.

Read these template files for structure and tone:
- docs/framework/templates/02_feature_spec_template.md
- docs/framework/templates/04_edge_cases_template.md
- docs/framework/templates/07_acceptance_criteria_template.md

Generate these files with concrete, app-specific content (no generic placeholders):
1. docs/project/02_feature_spec.md
2. docs/project/04_edge_cases.md
3. docs/project/07_acceptance_criteria.md

Discovery notes:
[PASTE DISCOVERY SUMMARY]

Output: Write all 3 files. No summary needed.
```

### Agent C — Technical & QA (3 docs)

```
Prompt: Generate 3 project docs for [APP_NAME] based on the discovery notes below.

Read these template files for structure and tone:
- docs/framework/templates/05_tech_stack_template.md
- docs/framework/templates/06_permissions_matrix_template.md
- docs/framework/templates/08_qa_checklist_template.md

Generate these files with concrete, app-specific content (no generic placeholders):
1. docs/project/05_tech_stack.md
2. docs/project/06_permissions_matrix.md
3. docs/project/08_qa_checklist.md

Discovery notes:
[PASTE DISCOVERY SUMMARY]

Output: Write all 3 files. No summary needed.
```

### Coordination
- Main thread creates `docs/project/` directory before dispatching
- All 3 agents get the same discovery summary (paste the interview results)
- After all complete, main thread reads all 9 files and presents the summary to the user
- Agent type: `general-purpose` (needs Write access)

**Conflict resolution for parallel agents:** If two agents make contradictory decisions (e.g., different data model assumptions), the main thread resolves by:
1. Comparing both outputs against `docs/project/*` source of truth
2. Choosing the version that aligns with project docs
3. If both are valid interpretations, prefer the simpler design
4. Document the resolution in the relevant project doc for future reference

---

## Recipe 2: Phase 9 — Core Feature Modules

### Strategy
1 agent per feature module. Each builds full CRUD for one entity/feature. This is the highest-value parallelization — feature modules are fully independent and each requires significant context.

### Per-Feature Agent Template

```
Prompt: Build the [FEATURE_NAME] module for [APP_NAME].

Read these files FIRST (canonical patterns — follow exactly):
- docs/project/pattern_snapshot.md (code conventions — MANDATORY)

Read these framework files (DO NOT read other framework files):
- docs/framework/internal/08_ui_system_internal.md (component behaviors)
- docs/framework/internal/11_internal_screen_archetypes.md (page patterns)
- docs/framework/internal/12_internal_component_specs.md (component visual specs)
- docs/framework/internal/17_error_state_taxonomy.md (error handling)

Read these project files:
- docs/project/02_feature_spec.md (find the [FEATURE_NAME] section)
- docs/project/06_permissions_matrix.md (find [FEATURE_NAME] permissions)

Build:
1. Index/list view — table or card grid, filters, search, pagination
2. Detail view — full entity view with related data
3. Create/edit forms — validation, error states, success feedback
4. Delete/archive — confirmation dialog, undo where appropriate

Rules:
- All 4 states on every view: loading skeleton, empty + CTA, success, error + retry
- Follow screen archetypes from 11_internal_screen_archetypes.md
- Use existing app shell (do not create new layouts)
- Use existing shared components from src/components/
- Enforce permissions at API and UI layers
- Mobile responsive at 375px minimum
- TypeScript strict, no `any` types

Existing patterns to reuse (read these before building):
- src/components/ (shared components)
- src/app/(authenticated)/layout.tsx (app shell)
- [ANY EXISTING FEATURE PATH FOR REFERENCE]

Output: Write all files. Summarize what was built and file paths.
```

### Coordination
- Main thread dispatches one agent per feature from `docs/project/02_feature_spec.md`
- Each agent gets the same 4 framework files but different feature sections
- Agents should reference (read) one already-built feature for pattern consistency
- After all complete, main thread verifies navigation links between features
- Agent type: `general-purpose` (needs Write access)
- Consider using `isolation: "worktree"` if features might touch shared files

### Feature Independence Check
Before dispatching, verify features are truly independent:
- No shared database tables beyond core entities (User, Organization)
- No cross-feature navigation that requires both to exist
- No shared state beyond auth context
- If features share a custom entity, build that entity's module first (sequentially), then parallelize the rest

**When no reference feature exists:** If Phase 8 built only a dashboard (no feature CRUD), the first Phase 9 agent builds the primary feature module while other agents wait. This first feature becomes the reference. Subsequent agents are dispatched after the reference is committed. Do not dispatch all feature agents in parallel without a reference — pattern drift is guaranteed.

---

## Recipe 3: Phase 13 — Marketing Site

### Strategy
2-3 agents. Home page is the heaviest (14 sections, unique conversion logic). Pricing is medium. All other pages are lighter and can be batched.

### Agent A — Home Page

```
Prompt: Build the marketing home page for [APP_NAME].

Read these framework files:
- docs/framework/website/saas_home_page_system.md (14-section structure)
- docs/framework/website/design_system_tokens.md (public visual tokens)
- docs/framework/website/public_component_specs.md (component specs)
- docs/framework/website/public_copy_conversion_rules.md (copy rules)
- docs/framework/website/component_library_spec.md (component inventory)

Read these project files:
- docs/project/01_project_brief.md (app name, tagline, value prop)
- docs/project/02_feature_spec.md (features to highlight)

Build the home page at src/app/(public)/page.tsx with:
- All 14 sections from saas_home_page_system.md
- Conversion-optimized copy following public_copy_conversion_rules.md
- Public design tokens (NOT internal product tokens)
- Mobile responsive
- Dark mode support

Output: Write all files. List component paths created.
```

### Agent B — Pricing Page

```
Prompt: Build the pricing page for [APP_NAME].

Read these framework files:
- docs/framework/website/saas_website_page_system.md (page structure)
- docs/framework/website/design_system_tokens.md (public visual tokens)
- docs/framework/website/public_screen_archetypes.md (page archetypes)
- docs/framework/website/public_component_specs.md (component specs)
- docs/framework/website/public_copy_conversion_rules.md (copy rules)

Read these project files:
- docs/project/01_project_brief.md (pricing model)
- docs/project/02_feature_spec.md (feature tiers if applicable)

Build the pricing page at src/app/(public)/pricing/page.tsx with:
- Plan comparison table/cards
- Feature breakdown per tier
- FAQ section
- CTA to signup/checkout
- Public design tokens, mobile responsive, dark mode

Output: Write all files. List component paths created.
```

### Agent C — Secondary Pages (batch)

```
Prompt: Build the secondary marketing pages for [APP_NAME].

Read these framework files:
- docs/framework/website/saas_website_page_system.md (page structure)
- docs/framework/website/design_system_tokens.md (public visual tokens)
- docs/framework/website/public_screen_archetypes.md (page archetypes)
- docs/framework/website/public_component_specs.md (component specs)
- docs/framework/website/nextjs_folder_structure.md (folder structure)
- docs/framework/website/sitemap_diagram.md (information architecture)

Read these project files:
- docs/project/01_project_brief.md

Build these pages (only those in v1 scope):
- Features: src/app/(public)/features/page.tsx
- About: src/app/(public)/about/page.tsx
- Contact: src/app/(public)/contact/page.tsx
- Legal (privacy + terms): src/app/(public)/privacy/page.tsx, src/app/(public)/terms/page.tsx

Rules:
- Follow archetype from public_screen_archetypes.md for each page type
- Public design tokens, mobile responsive, dark mode
- Shared public layout component

Output: Write all files. List component paths created.
```

### Coordination
- Main thread creates shared public layout and nav component FIRST (sequential)
- Then dispatch all 3 agents in parallel
- After completion, main thread verifies cross-page navigation and shared component consistency
- Agent type: `general-purpose`

**Cross-page link verification:** After all page agents complete, main thread runs a link audit:
1. Extract all internal `href` values from built pages
2. Verify each target page/route exists
3. Fix broken links before presenting phase as complete
This is a main-thread responsibility, not delegated to agents.

---

## Recipe 4: Phase 14 — Polish & QA Audits

### Strategy
3 Explore agents (read-only audits) run in parallel. Each produces a findings report. Main thread then applies fixes sequentially.

**Why scouts, not builders?** Fixes often touch shared files (layouts, components, tokens). Parallel writes to shared files cause conflicts. It's faster to audit in parallel, then fix in one pass.

### Agent A — Error State & Edge Case Audit

```
Prompt: Audit the codebase for missing error states and edge case handling.

Read:
- docs/framework/internal/17_error_state_taxonomy.md (12 error types)
- docs/project/04_edge_cases.md (app-specific edge cases)

Then search the codebase (src/) for:
1. Pages/components missing any of the 4 required states (loading, empty, success, error)
2. API routes without proper error responses
3. Forms without client-side validation
4. Missing permission checks at API layer
5. Unhandled edge cases listed in 04_edge_cases.md

Output: A structured list of findings:
- File path and line number
- What's missing (which state, which error type, which edge case)
- Severity (critical / should-fix / nice-to-have)

Do NOT write any code. Research only.
```

### Agent B — Responsive & Dark Mode Audit

```
Prompt: Audit the codebase for responsive and dark mode issues.

Read:
- docs/framework/internal/15_canonical_breakpoints.md (6 breakpoints)
- docs/framework/internal/10_design_tokens_internal.md (dark mode tokens)

Then search the codebase (src/) for:
1. Components with fixed widths that would break on mobile (375px)
2. Missing responsive classes at key breakpoints
3. Hardcoded colors instead of design token references
4. Missing dark: variants on colored elements
5. Touch targets smaller than 44x44px
6. Tables without mobile collapse behavior

Output: A structured list of findings:
- File path and line number
- What's wrong
- Severity (critical / should-fix / nice-to-have)

Do NOT write any code. Research only.
```

### Agent C — Acceptance Criteria & QA Checklist Audit

```
Prompt: Audit the codebase against acceptance criteria and QA checklist.

Read:
- docs/project/07_acceptance_criteria.md
- docs/project/08_qa_checklist.md

Then search the codebase (src/) to verify each criterion and checklist item:
1. For each acceptance criterion, find the code that implements it
2. Flag any criterion that appears unimplemented or partially implemented
3. Walk through QA checklist items and flag gaps

Output: A structured checklist:
- Criterion/checklist item
- Status: pass / fail / partial / unable-to-verify
- Evidence (file path) or gap description

Do NOT write any code. Research only.
```

### Coordination
- All 3 agents use `subagent_type: "Explore"` (read-only, cheaper)
- Main thread collects all findings, deduplicates, prioritizes
- Main thread applies fixes sequentially (avoids merge conflicts on shared files)
- Present consolidated findings to user before fixing (some may be intentional trade-offs)

**Handling overlapping file edits:** Phase 14 audit agents are read-only (research). Main thread applies fixes sequentially. If two audit reports recommend changes to the same file, main thread reads both recommendations, merges them logically, and applies as a single edit pass. Never apply conflicting edits blindly.

---

## Context Budget Guidelines

| Agent Role | Type | Files Read | Approximate Context |
|-----------|------|-----------|-------------------|
| Doc generator (Phase 2) | general-purpose | 3 templates + discovery notes | Light |
| Feature builder (Phase 9) | general-purpose | 4 framework + 2 project + existing code | Medium |
| Marketing page (Phase 13) | general-purpose | 5-6 framework + 2 project | Medium |
| QA auditor (Phase 14) | Explore | 2-3 docs + full codebase search | Medium-Heavy |

## Anti-Patterns

### Don't: Agent per file
Spawning an agent to write one file has more overhead than just writing it inline. Minimum 3 files per agent to justify the dispatch cost.

### Don't: Agents for sequential work
Auth → middleware → protected routes is a chain. An agent can't build the protected route wrapper without the middleware existing first.

### Don't: Parallel writes to shared files
If two features both need to update `prisma/schema.prisma` or `src/lib/routes.ts`, don't parallelize them. Either update the shared file first, or use worktree isolation.

### Don't: Agents for conversation
Phases 0 and 1 are interviews. There's nothing to parallelize.

### Don't: Over-dispatch small phases
Phase 12 (email templates) has ~8 templates, but they share a base layout and are fast to build sequentially. Agent coordination overhead > time saved.

### Do: Batch small related work into one agent
Instead of 1 agent per marketing page, batch the 4-5 smaller pages into one agent. The overhead of dispatching 5 agents far exceeds the time to build 5 simple pages sequentially.

### Do: Scout before building
For Phase 14, read-only audit agents are cheaper and avoid write conflicts. Collect findings, then fix in one pass.

### Do: Include existing code paths in builder prompts
Feature builder agents need to see at least one existing feature's code to maintain pattern consistency. Include a reference path in the prompt.
