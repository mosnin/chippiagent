# 00 Kickoff System

> **TL;DR:** Defines the phased initialization sequence from welcome through discovery, doc generation, architecture planning, and build execution.
> **Covers:** phase detection, discovery interview, project doc generation, architecture plan, build phases 4-14, session resumption | **Phase:** 0

## Purpose

Define the phased initialization sequence for any new project that uses this framework. Claude works through phases interactively, reading files just-in-time and pausing for user input between phases.

## Core Rules

1. **Do not read all files upfront.** Read only what the current phase requires.
2. **Do not start coding until Phase 3 is confirmed.** Project docs come first.
3. **Pause between phases.** Summarize what was done, ask to continue.
4. **Detect and resume.** If a session restarts, detect the current phase from project state.

## Source of Truth Hierarchy

1. `docs/project/*` (app-specific, highest priority)
2. `docs/framework/internal/*`
3. `docs/framework/website/*`
4. `docs/framework/templates/*` (lowest priority)

If project docs conflict with framework docs, project docs win.

---

## Phase 0 — Welcome

**Trigger:** `docs/project/` does not exist and no app idea has been provided.

**Files to read:** None.

**Action:**
- Introduce the framework
- Explain the phased process (discovery → docs → architecture → build)
- Ask for the app idea

**Exit:** User provides an app idea → proceed to Phase 1.

---

## Phase 1 — Discovery Interview

**Trigger:** App idea has been provided but project docs do not exist yet.

**Files to read:** `docs/framework/templates/*` (scan structure to know what needs to be filled)

**Action:**
- Analyze the app idea for gaps
- Ask targeted follow-up questions (2-4 at a time, not a wall)
- Cover: users/roles, core action, first value event, key entities, dashboard shape, monetization, integrations, non-goals
- Skip anything the user already addressed
- Adapt questions based on answers

**Exit:** Enough information to populate all 9 project docs confidently. Tell the user: "I have enough to generate the project docs. Ready to proceed?" → Phase 2.

---

## Phase 2 — Generate Project Docs

**Trigger:** Discovery is complete, `docs/project/` does not exist or is incomplete.

**Files to read:** `docs/framework/templates/*` (for structure and example tone)

**Action:**
1. Create `docs/project/` directory
2. Generate all 9 project files with concrete, app-specific content:
   - `00_app_idea.md`
   - `01_project_brief.md`
   - `02_feature_spec.md`
   - `03_user_flows.md`
   - `04_edge_cases.md`
   - `05_tech_stack.md`
   - `06_permissions_matrix.md`
   - `07_acceptance_criteria.md`
   - `08_qa_checklist.md`
3. Present a summary: app name, core features, roles, entities, v1 scope
4. Ask user to review and confirm or request adjustments

**Rules:**
- Do not leave any file generic or placeholder
- Use template examples for tone and depth reference
- Every entry must be specific to this app

**Exit:** User confirms project docs → Phase 3.

---

## Phase 3 — Architecture Plan

**Trigger:** All 9 project docs exist but no source code has been written.

**Files to read:**
- `docs/project/*` (all 9 files)
- `docs/framework/internal/07_data_models.md`
- `docs/framework/internal/06_routes_and_permissions.md`
- `docs/framework/internal/04_feature_modules.md`
- `docs/framework/internal/09_build_rules_internal.md`

**Action:**
1. Produce an architecture summary:
   - **Entities** with key fields and relationships
   - **Routes** — full route table (public, auth, app, admin)
   - **Modules** — which optional modules apply
   - **Build order** — the 11 build phases (4–14) with app-specific notes
   - **Custom validation gates** — read `docs/framework/internal/21_validation_gates.md`, define app-specific gates, write to `docs/project/custom_gates.md`
2. Present to user for review

**Exit:** User confirms architecture and custom gates → Phase 4.

---

## Build Phases (4–14)

Each phase follows the same protocol:

1. **Announce** what you're about to build
2. **Read** only the framework files listed for that phase
3. **Build** the code
4. **Summarize** what was completed
5. **Pause** — ask user to review, adjust, or continue

### Phase 4 — Foundation
**Read:** `docs/framework/internal/09_build_rules_internal.md` (Phase 4 section), `docs/framework/internal/21_validation_gates.md`
- Next.js project setup, TypeScript, Tailwind, Prisma
- Database schema from entity plan (use Prisma reference schema from `07_data_models.md`)
- Shared utilities, types, constants, project structure
- Run Phase 4 validation gates before proceeding

### Phase 5 — Auth
**Read:** `docs/framework/internal/02_auth_and_onboarding.md` (Section A: Auth)
- Login, signup, password reset, email verification
- Auth middleware, session management
- Protected route wrappers

### Phase 6 — Onboarding
**Read:** `docs/framework/internal/02_auth_and_onboarding.md` (Section B: Onboarding)
- Multi-step onboarding flow
- First value event
- Workspace/org creation if applicable

### Phase 7 — App Shell
**Read:**
- `docs/framework/internal/01_app_shell.md`
- `docs/framework/internal/08_ui_system_internal.md`
- `docs/framework/internal/10_design_tokens_internal.md`
- `docs/framework/internal/12_internal_component_specs.md`
- `docs/framework/internal/15_canonical_breakpoints.md`
- `docs/framework/internal/22_pattern_snapshot.md`
- Top bar, sidebar, drawer, page header, user menu
- Responsive layout, navigation, dark mode setup
- **Generate pattern snapshot** at `docs/project/pattern_snapshot.md` before proceeding

### Phase 8 — Dashboard
**Read:**
- `docs/project/pattern_snapshot.md` (MANDATORY)
- `docs/framework/internal/03_dashboard_system.md`
- `docs/framework/internal/16_dashboard_archetypes.md`
- `docs/framework/internal/13_internal_data_display_rules.md`
- Summary metrics, main work area, activity feed
- Apply the appropriate dashboard archetype
- Update pattern snapshot with dashboard conventions

### Phase 9 — Core Features
**Read:**
- `docs/project/pattern_snapshot.md` (MANDATORY — read before writing any code)
- `docs/framework/internal/08_ui_system_internal.md`
- `docs/framework/internal/11_internal_screen_archetypes.md`
- `docs/framework/internal/12_internal_component_specs.md`
- `docs/framework/internal/17_error_state_taxonomy.md`
- Product-specific modules, CRUD views, detail pages, forms
- All four states on every view: loading, empty, success, error
- Update pattern snapshot with feature module template after first feature

### Phase 10 — Settings & Billing
**Read:** `docs/framework/internal/05_settings_billing_admin.md`
- Profile, workspace, team management
- Stripe Checkout + Customer Portal
- Plan management, invoices

### Phase 11 — Admin
**Read:** `docs/framework/internal/05_settings_billing_admin.md` (admin sections)
- Admin dashboard, user management
- Billing overview, system logs
- Admin routes and permission enforcement

### Phase 12 — Email Templates
**Read:** `docs/framework/internal/14_email_system.md`
- Auth emails (verification, password reset, invite)
- Billing emails (receipt, plan change)
- Onboarding emails (welcome, activation nudge)
- Product notification emails

### Phase 13 — Marketing Site
**Read:**
- `docs/framework/website/saas_home_page_system.md`
- `docs/framework/website/saas_website_page_system.md`
- `docs/framework/website/design_system_tokens.md`
- `docs/framework/website/public_screen_archetypes.md`
- `docs/framework/website/public_component_specs.md`
- `docs/framework/website/public_copy_conversion_rules.md`
- `docs/framework/website/component_library_spec.md`
- `docs/framework/website/sitemap_diagram.md`
- `docs/framework/website/nextjs_folder_structure.md`
- Home, pricing, features, about, contact, legal pages

### Phase 14 — Edge Cases & Polish
**Read:**
- `docs/framework/internal/17_error_state_taxonomy.md`
- `docs/framework/internal/18_testing_strategy.md`
- `docs/framework/internal/19_i18n_posture.md`
- `docs/project/04_edge_cases.md`
- `docs/project/07_acceptance_criteria.md`
- `docs/project/08_qa_checklist.md`
- Error states, edge cases, QA pass
- Accessibility, responsive testing, dark mode polish

---

## Global Build Rules

Apply to every build phase (4–14):

- Build only v1 scope unless the user explicitly requests otherwise
- Reuse shared patterns from `08_ui_system_internal.md` before creating new components
- Follow `15_canonical_breakpoints.md` for all responsive behavior
- Keep responsive from the start — test at 375px width
- Handle loading, empty, success, and error states on every page
- Enforce auth and permissions at middleware, API, and UI layers per `06_routes_and_permissions.md`
- Do not invent features outside v1 scope
- English-first per `19_i18n_posture.md`, use Intl API for formatting
- Do not modify files in `docs/framework/`

## Session Resumption

If Claude starts a new session mid-project:

1. Read `CLAUDE.md` (automatic)
2. Check which phase the project is in (see Phase Detection in CLAUDE.md)
3. Read `docs/project/*` to restore context on the app
4. Read only the framework files relevant to the current phase
5. Tell the user where you're resuming from
6. Continue from that phase

## Final Principle

The framework layer provides reusable defaults. The project layer provides instantiated truth. Discovery and documentation always come before code. Each phase is a conversation, not a monologue.
