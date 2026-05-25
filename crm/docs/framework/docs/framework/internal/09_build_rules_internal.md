# 09 Build Rules Internal

> **TL;DR:** Defines the authoritative build order (11 build phases, numbered 4–14 to match CLAUDE.md), source-of-truth hierarchy, reuse rules, responsive requirements, state handling rules, coding standards, and quality gates.
> **Covers:** build phases, source hierarchy, reuse rules, responsive rules, state handling, coding standards, quality gates | **Depends on:** 01, 02, 03, 05, 07, 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22 | **Used by:** None | **Phase:** 3, 4

## Purpose

Define how the internal framework must be used during implementation. This is the authoritative reference for build order, coding standards, and quality gates.

## Core Rule

Read the framework first. Generate the project docs next. Build only after both layers exist.

## Source Of Truth Hierarchy

1. docs/project/* (app-specific decisions override everything)
2. docs/framework/internal/* (authenticated product rules)
3. docs/framework/website/* (marketing site rules)
4. docs/framework/templates/* (document shape reference)

## Build Phases (4–14)

Build in this exact order. Do not skip ahead. Phase numbers match CLAUDE.md.

### Phase 4: Foundation
- Initialize project (Next.js app router, TypeScript, Tailwind)
- Install and configure the core library stack (see `docs/framework/templates/05_tech_stack_template.md`):
  - Run `npx shadcn@latest init` — select "New York" style, CSS variables, project primary color
  - Install always-included libraries: Motion, react-hook-form, zod, Tanstack Query, nuqs, next-themes, Sonner, superjson, date-fns, T3 Env, next-safe-action
  - Install auth and billing: Auth.js, Stripe SDK, stripe-event-types
  - Install email: Resend, React Email
  - Install testing: Vitest, Playwright, MSW, Faker
  - Install include-when-needed libraries based on `docs/project/02_feature_spec.md`: Recharts (if charts needed), Tanstack Table (if complex tables), uploadthing (if file uploads), Trigger.dev/Inngest (if background jobs), Upstash Ratelimit (if rate limiting needed)
- Configure T3 Env with all required environment variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, `STRIPE_SECRET_KEY`, etc.)
- Configure database (PostgreSQL + Prisma schema for core entities from `07_data_models.md`)
- Set up shared directories: `lib/validations/` (zod schemas), `lib/animations.ts` (Motion variants), `components/ui/` (shadcn components)
- Create shared utility functions (date formatting, currency, validation helpers)
- Run Phase 4 validation gates from `21_validation_gates.md`

### Phase 5: Auth
- Implement auth routes: /login, /signup, /forgot-password, /reset-password, /verify-email
- Auth page layout per `02_auth_and_onboarding.md` — Section A: Auth (split layout desktop, single column mobile)
- Session management and middleware for protected routes
- Email verification flow (see also `14_email_system.md` for email templates)

### Phase 6: Onboarding
- Multi-step onboarding flow per `02_auth_and_onboarding.md` — Section B: Onboarding
- Progress persistence (user can leave and return)
- Skip logic for optional steps
- First value event delivery (defined in `docs/project/03_user_flows.md`)

### Phase 7: App Shell
- Read the internal visual pack (`10_design_tokens_internal.md`, `11_internal_screen_archetypes.md`, `12_internal_component_specs.md`, `13_internal_data_display_rules.md`) and `08_ui_system_internal.md` before building any authenticated pages
- Configure Tailwind theme with design tokens from `10_design_tokens_internal.md`
- Build the authenticated shell per `01_app_shell.md`: top bar, sidebar, mobile drawer, main content area
- Page header component (title, context, primary action, secondary actions)
- User menu (profile, settings, billing, logout)
- Role-aware sidebar (hide items user cannot access)
- Generate pattern snapshot per `22_pattern_snapshot.md` → `docs/project/pattern_snapshot.md`

### Phase 8: Dashboard
- Read `docs/project/pattern_snapshot.md` before writing code
- Identify the appropriate dashboard archetype from `16_dashboard_archetypes.md` (queue, pipeline, analytics, content workspace, operations, monitoring, admin overview)
- Dashboard page per `03_dashboard_system.md`: summary row, main work area, secondary insights
- Data display rules from `13_internal_data_display_rules.md` for metric formatting and table/card choices
- All four states: loading skeleton, empty state with CTA, success with data, error with retry
- Mobile responsive layout (stacked cards, no horizontal scroll)
- Update pattern snapshot with dashboard conventions

### Phase 9: Core Features
- Read `docs/project/pattern_snapshot.md` (MANDATORY) before writing any code
- Product-specific feature modules from `docs/project/02_feature_spec.md`
- Each feature uses the shared page header and shell layout
- CRUD operations with confirmation dialogs for destructive actions
- List views with search, sort, and pagination
- All four states on every view: loading, empty, success, error
- Error handling per `17_error_state_taxonomy.md`
- Update pattern snapshot with feature module template after first feature

### Phase 10: Settings and Billing
- Settings pages per `05_settings_billing_admin.md`: profile, workspace, billing, security, notifications
- Stripe integration: Checkout for upgrades, Customer Portal for billing management
- Webhook endpoint for subscription lifecycle events
- Permission enforcement (workspace/billing restricted to admin+)

### Phase 11: Admin
- Admin panel per `05_settings_billing_admin.md`: user management, billing overview, usage, logs
- Role-gated access (admin and owner only)
- All admin actions logged to Admin Record entity
- Search and filter on user list

### Phase 12: Email Templates
- Build transactional and product emails per `14_email_system.md`
- Auth emails (verification, password reset, magic link)
- Billing emails (receipt, failure, trial ending)
- Onboarding emails (welcome, activation nudge)
- Plain text fallbacks for all emails

### Phase 13: Marketing Site
- Build public pages per `docs/framework/website/` specs
- Home page with conversion funnel per `saas_home_page_system.md`
- Page layouts per `public_screen_archetypes.md`
- Design tokens from `design_system_tokens.md`, components from `public_component_specs.md`
- Copy and CTA rules from `public_copy_conversion_rules.md`
- Additional pages per `saas_website_page_system.md` as scoped

### Phase 14: Edge Cases and Polish
- Implement edge cases from `docs/project/04_edge_cases.md`
- Handle all error types per `17_error_state_taxonomy.md`
- Run through QA checklist from `docs/project/08_qa_checklist.md`
- Verify acceptance criteria from `docs/project/07_acceptance_criteria.md`
- Run automated tests per `18_testing_strategy.md`
- Dark mode pass, mobile pass, responsive pass per `15_canonical_breakpoints.md`

## Reuse Rules

- Reuse existing shell — never create a second shell layout
- Reuse existing page header component on every authenticated page
- Reuse common settings framing (left nav + right content panel)
- Reuse common admin framing (same layout as settings)
- Reuse components from `08_ui_system_internal.md` before creating new ones
- Follow visual specs from `12_internal_component_specs.md` for all component dimensions, spacing, and states
- Follow screen archetypes from `11_internal_screen_archetypes.md` for page composition
- Follow data display rules from `13_internal_data_display_rules.md` for tables, charts, and metric presentation
- Extract shared patterns only when used in 3+ places

## Responsive Rules

- Follow the canonical breakpoint scale from `15_canonical_breakpoints.md` for all responsive behavior
- Mobile responsiveness is required from the first page built
- Desktop-only assumptions are not allowed
- Dense data views (tables, grids) need explicit mobile behavior defined per `15_canonical_breakpoints.md` table collapse rules
- Minimum touch target: 44x44px
- Test at 375px width (iPhone SE) as the baseline

## State Handling Rules

Every major page or module must account for:

- **Loading**: Skeleton placeholder matching the layout shape
- **Empty**: Helpful message with CTA to create first item (not a blank page)
- **Success**: Data rendered correctly with all interactions available
- **Validation failure**: Inline field errors, form-level summary if needed
- **System failure**: User-friendly error message with retry action
- **Permission denied**: Clear message, no raw 403 codes, link back to accessible area
- **Feature unavailable**: Upgrade prompt when feature requires a higher plan

## Coding Standards

- Use TypeScript strict mode — no `any` types in production code
- Server Components by default, Client Components only when interactivity requires it
- Colocate related files (component, styles, types, tests in the same directory)
- API routes and Server Actions validate input and check permissions independently — use next-safe-action for server actions, zod for input validation
- Database queries always filter by organization_id for multi-tenancy isolation
- Sensitive data (tokens, secrets) stored encrypted, never logged or exposed in responses
- Use Prisma transactions for operations that modify multiple tables
- Forms use react-hook-form + zod — validation schemas live in `lib/validations/` and are shared between client and server
- UI components live in `components/ui/` (shadcn primitives) — customize to match `12_internal_component_specs.md`, never use defaults without verification
- Animations use Motion with shared variants from `lib/animations.ts` — durations follow design tokens (fast: 150ms, normal: 250ms, slow: 350ms)
- URL-persisted state (filters, pagination, tabs) uses nuqs — not React state or localStorage
- Toast notifications use Sonner — success after mutations, error on failures, promise for async operations

## Quality Gates

Before marking any build phase complete:

1. All pages in the phase handle loading, empty, success, and error states
2. All pages are mobile responsive at 375px
3. Permissions are enforced at middleware, API, and UI layers
4. No TypeScript errors, no console warnings in production build
5. Navigation between pages works correctly (no dead ends, no broken links)

## Final Principle

The framework exists to reduce ambiguity, reduce drift, and reduce bugs. Build inside it first. Extend it only when the product actually requires extension.
