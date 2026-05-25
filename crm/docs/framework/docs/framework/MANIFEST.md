# Framework Manifest

> Quick reference for every file in the framework. Use this to find what you need without reading everything.

## Internal Product (`docs/framework/internal/`)

| # | File | One-line Description | Phase |
|---|------|---------------------|-------|
| 01 | `01_app_shell.md` | Authenticated app frame — top bar, sidebar, drawer, page header, user menu | 7 |
| 02 | `02_auth_and_onboarding.md` | Auth routes, login/signup flows, invite flow, onboarding sequence. Split into Section A (Auth, Phase 5) and Section B (Onboarding, Phase 6) | 5, 6 |
| 03 | `03_dashboard_system.md` | Dashboard purpose, anatomy, required states, mobile rules | 8 |
| 04 | `04_feature_modules.md` | 8 optional modules: analytics, integrations, API, MCP, webhooks, notifications, usage, activity logs | 3, 9 |
| 05 | `05_settings_billing_admin.md` | Settings areas, Stripe billing, security, admin panel, user management | 10, 11 |
| 06 | `06_routes_and_permissions.md` | Route categories, canonical roles, permission enforcement layers | 3 |
| 07 | `07_data_models.md` | 9 core entities with fields, types, relationships, Prisma reference schema, state machines, and extension pattern | 3, 4 |
| 08 | `08_ui_system_internal.md` | 20 canonical component behaviors — delegates visual specs to 10, 12. Read in Phase 7 (foundational) and Phase 9 (feature builds) | 7, 9 |
| 09 | `09_build_rules_internal.md` | 11 build phases, reuse rules, responsive rules, coding standards, quality gates | 3, 4 |
| 10 | `10_design_tokens_internal.md` | Complete visual system — colors, spacing, typography, borders, shadows, motion, z-index | 7 |
| 11 | `11_internal_screen_archetypes.md` | 11 canonical page patterns for authenticated views with layout and density rules | 9 |
| 12 | `12_internal_component_specs.md` | Visual specs for 27 components — padding, colors, typography, states, mobile behavior | 9 |
| 13 | `13_internal_data_display_rules.md` | When to use tables vs cards vs charts, metric formatting, filters, pagination, mobile collapse | 8, 9 |
| 14 | `14_email_system.md` | 4 email categories, structure rules, CTA specs, dark mode, mobile, frequency, testing | 12 |
| 15 | `15_canonical_breakpoints.md` | 6 breakpoints (xs–2xl) with layout, sidebar, table, chart, modal, form, and nav behavior | 7 |
| 16 | `16_dashboard_archetypes.md` | 7 concrete dashboard types: queue, pipeline, analytics, content, operations, monitoring, admin | 8 |
| 17 | `17_error_state_taxonomy.md` | 12 error types with component mapping, retry logic, escalation, accessibility, logging | 9, 14 |
| 18 | `18_testing_strategy.md` | Testing philosophy, 3 layers (unit/integration/E2E), CI integration, test data strategy | 14 |
| 19 | `19_i18n_posture.md` | English-first for v1, Intl API for formatting, what to prepare for future multilingual | 14 |
| 20 | `20_subagent_dispatch.md` | Pre-built agent recipes for parallelizing Phases 2, 9, 13, 14 — prompts, file lists, coordination | 2, 9, 13, 14 |
| 21 | `21_validation_gates.md` | 46 machine-checkable structural assertions — per-phase gates, regression testing, custom gate system | 4–14 |
| 22 | `22_pattern_snapshot.md` | Generated reference file capturing exact code conventions — prevents pattern drift across phases and agents | 7 (generate), 9+ (consume) |

## Public Website (`docs/framework/website/`)

| File | One-line Description | Phase |
|------|---------------------|-------|
| `saas_home_page_system.md` | 14-section home page structure with conversion sequencing and design logic | 13 |
| `saas_website_page_system.md` | Multi-page site structure — 13 canonical public pages with global wrapper | 13 |
| `design_system_tokens.md` | Public site visual tokens — colors, spacing, typography, radius, shadow, motion, buttons | 13 |
| `component_library_spec.md` | Component inventory (17 core) and shared rules — delegates visual specs to public_component_specs | 13 |
| `public_screen_archetypes.md` | 13 page archetypes with hierarchy, layout, CTA strategy, mobile behavior, common mistakes | 13 |
| `public_component_specs.md` | Visual specs for 19+ components — padding, colors, typography, states, mobile behavior | 13 |
| `public_copy_conversion_rules.md` | Copy rules for headlines, CTAs, proof/trust, tone, pricing, FAQ, forms, page-level patterns | 13 |
| `nextjs_folder_structure.md` | Recommended folder structure for the public website routes and components | 13 |
| `sitemap_diagram.md` | Information architecture and canonical sitemap for public pages | 13 |

## Templates (`docs/framework/templates/`)

| File | One-line Description | Phase |
|------|---------------------|-------|
| `00_app_idea_template.md` | Template for capturing product concept, users, core problem, v1 scope | 2 |
| `01_project_brief_template.md` | Template for project summary — name, tagline, users, value prop, success metrics | 2 |
| `02_feature_spec_template.md` | Template for feature definitions — scope, user stories, acceptance criteria | 2 |
| `03_user_flows_template.md` | Template for step-by-step user flows — signup, onboarding, core actions | 2 |
| `04_edge_cases_template.md` | Template for edge cases — error scenarios, race conditions, limits | 2 |
| `05_tech_stack_template.md` | Template for tech stack decisions — framework, database, auth, hosting, services | 2 |
| `06_permissions_matrix_template.md` | Template for role-permission matrix — routes, actions, data access per role | 2 |
| `07_acceptance_criteria_template.md` | Template for acceptance criteria — given/when/then format per feature | 2 |
| `08_qa_checklist_template.md` | Template for QA checklist — auth, billing, responsive, accessibility, edge cases | 2 |

## Prompts (`docs/framework/prompts/`)

| File | One-line Description | Phase |
|------|---------------------|-------|
| `00_kickoff_system.md` | Full phased initialization protocol — triggers, file lists, actions, exit conditions | 0 |
| `00_master_execution_prompt_template.md` | Simplified startup prompt users paste into Claude Code sessions | 0 |

## Phase Index (`docs/framework/phases/`)

| File | One-line Description |
|------|---------------------|
| `phase_00_welcome.md` | Welcome and app idea collection |
| `phase_01_discovery.md` | Discovery interview protocol |
| `phase_02_project_docs.md` | Project doc generation |
| `phase_03_architecture.md` | Architecture planning |
| `phase_04_foundation.md` | Project setup, schema, utilities |
| `phase_05_auth.md` | Authentication flows |
| `phase_06_onboarding.md` | Onboarding and first value event |
| `phase_07_shell.md` | App shell and layout |
| `phase_08_dashboard.md` | Dashboard implementation |
| `phase_09_core_features.md` | Core feature modules |
| `phase_10_settings_billing.md` | Settings and Stripe billing |
| `phase_11_admin.md` | Admin panel |
| `phase_12_email.md` | Email templates |
| `phase_13_marketing.md` | Public marketing site |
| `phase_14_polish.md` | Edge cases, testing, polish |
