# 05 Tech Stack

> **TL;DR:** Template for defining technology choices and justifications across frontend, backend, database, auth, billing, and infrastructure.
> **Covers:** frontend, backend, database, auth, billing, hosting, storage, email, jobs, analytics, UI, testing | **Phase:** 2

## Instructions

Fill in each section with the specific technology choice and a brief justification. The defaults below reflect the framework's assumed stack — override any section as needed for your project. Libraries are organized into **Always Included** (every project) and **Include When Needed** (add based on feature requirements).

---

## Always Included

### Frontend

> Default: Next.js 14+ (app router) with TypeScript and Tailwind CSS. React Server Components where possible, client components for interactive UI.
>
> Justification: App router provides file-based routing, server components reduce bundle size, Tailwind enables rapid UI development with design tokens.

### UI Components

> Default: shadcn/ui (built on Radix UI primitives). Copy-paste component model — components are owned in the codebase, not imported from node_modules. Huge Icons (@hugeicons/react + style packages) for icons.
>
> Justification: Full control over every component to match framework specs (file 12). Accessible primitives from Radix (focus trapping, keyboard nav, ARIA) without fighting an opinionated styling layer. Tailwind-native. Huge Icons provides multiple icon styles (stroke, solid, duotone, bulk) enabling visual hierarchy through icon weight — stroke for nav/metadata, solid for active states, duotone/bulk for empty states and illustrations. Tree-shakeable with modular style packages.
>
> Supporting libraries:
> - **tailwind-merge** — resolves Tailwind class conflicts when composing components
> - **class-variance-authority (CVA)** — defines component variants (size, density, intent) as typed props
> - **Sonner** — toast notifications (shadcn default toast component)

### Animation

> Default: Motion (framer-motion) for UI animations.
>
> Justification: Best React animation library. Handles page transitions, toast enter/exit, drawer slides, skeleton shimmer, and micro-interactions. Framework design tokens define motion durations (150ms/250ms/350ms) — Motion enforces them.

### Forms and Validation

> Default: react-hook-form for form state management. zod for schema validation shared between client forms and API routes / Server Actions.
>
> Justification: react-hook-form is performant (uncontrolled inputs, minimal re-renders). zod schemas are reusable — define once, validate on client and server. Integrates via `@hookform/resolvers/zod`.

### State Management

> Default: Tanstack Query for server state (cache, revalidation, optimistic updates). nuqs for URL search param state (filters, pagination, active tabs). React Context for auth and theme only.
>
> Justification: Server Components handle most data fetching. Tanstack Query fills the gap for client-side mutations and cache invalidation. nuqs makes filters and pagination shareable via URL. No Redux/Zustand needed.

### Server Actions

> Default: next-safe-action for type-safe server actions with built-in zod validation and error handling.
>
> Justification: Wraps Next.js server actions with input validation, auth checks, and typed return values. Reduces boilerplate in every form submission.

### Backend

> Default: Next.js API routes and Server Actions. next-safe-action for type-safe server action wrappers.
>
> Justification: Co-located with frontend, reduces deployment complexity. Server Actions simplify form handling and mutations.

### Database

> Default: PostgreSQL with Prisma ORM.
>
> Justification: Relational data model fits SaaS multi-tenancy (User → Organization → Membership). Prisma provides type-safe queries, migrations, and schema management.
>
> Supporting libraries:
> - **superjson** — serializes Date, BigInt, and other non-JSON types across server→client boundary

### Auth

> Default: Auth.js (NextAuth v5) with email/password credentials provider. Optional: Google OAuth, magic link via email.
>
> Justification: Integrates natively with Next.js app router. Supports multiple providers. Session management via JWT or database sessions.

### Billing

> Default: Stripe with Checkout for payment collection and Customer Portal for self-service billing management. Webhooks for subscription lifecycle events.
>
> Justification: Industry standard for SaaS billing. Handles proration, dunning, invoicing, and tax calculation.
>
> Supporting libraries:
> - **stripe-event-types** — TypeScript types for webhook event payloads

### Hosting

> Default: Vercel for frontend and API routes. Database hosted on Supabase, Neon, or Railway (managed PostgreSQL).
>
> Justification: Zero-config deployment for Next.js. Preview deployments for PRs. Edge functions for middleware.

### Email

> Default: Resend for email delivery. React Email for building email templates in JSX.
>
> Justification: Resend has high deliverability and a clean API. React Email lets you build email templates as React components — same mental model as the app, with full TypeScript support. Outputs email-client-compatible HTML.

### Dark Mode

> Default: next-themes for dark mode toggle and system preference detection.
>
> Justification: Handles `prefers-color-scheme`, localStorage persistence, flash prevention, and class-based theme switching. Framework design tokens (file 10) define light/dark color pairs — next-themes manages the toggle.

### Environment Validation

> Default: T3 Env (@t3-oss/env-nextjs) for type-safe environment variables.
>
> Justification: Validates all env vars at build time. Catches missing `STRIPE_SECRET_KEY` or `DATABASE_URL` at startup instead of at runtime in production. Separates server-only and client-safe variables.

### Date and Number Formatting

> Default: date-fns for date manipulation (relative time, ranges, formatting). Intl API for number and currency formatting per framework i18n posture (file 19).
>
> Justification: date-fns is tree-shakeable and covers gaps the Intl API doesn't (relative time like "3 days ago", date ranges, business day calculations).

### Testing

> Default: Vitest for unit and integration tests. Playwright for E2E tests.
>
> Justification: Vitest is fast and Vite-native with Jest-compatible API. Playwright handles cross-browser E2E testing with built-in dark mode, mobile viewport, and accessibility testing support.
>
> Supporting libraries:
> - **MSW (Mock Service Worker)** — mocks external APIs (Stripe, OAuth providers) in tests without running real servers
> - **@faker-js/faker** — generates realistic test data for factory functions (names, emails, dates, UUIDs)

---

## Include When Needed

These libraries are added based on project requirements defined in `docs/project/02_feature_spec.md`.

### Charts and Data Visualization

> Add when: Dashboard or analytics features require charts (sparklines, line charts, bar charts).
>
> Default: Recharts (wrapped via shadcn chart component).
>
> Justification: Composable React chart library. shadcn provides a pre-styled wrapper that follows the framework's design tokens.

### Complex Tables

> Add when: Feature modules require sortable, filterable, or paginated tables with 5+ columns or virtual scrolling.
>
> Default: Tanstack Table (headless).
>
> Justification: Headless — pairs with shadcn table component for styling. Handles sorting, filtering, pagination, column resizing, and row selection without imposing UI opinions.

### File Uploads

> Add when: Any feature requires user file uploads (avatars, attachments, documents).
>
> Default: uploadthing for upload infrastructure. react-dropzone for the drop zone UI component.
>
> Justification: uploadthing handles presigned URLs, size limits, type validation, and storage. react-dropzone provides the accessible drag-and-drop UI.

### Background Jobs

> Add when: App requires async processing — webhook handling, email sequences, onboarding drip campaigns, report generation, or any operation that shouldn't block an HTTP request.
>
> Default: Trigger.dev or Inngest. For simpler needs (daily cleanup, metrics aggregation), Vercel Cron Jobs.
>
> Justification: Serverless-compatible job processing. Supports retries, scheduling, and event-driven triggers without managing queue infrastructure.

### Rate Limiting

> Add when: Auth rate limiting (failed login lockout), API throttling, or abuse prevention is required.
>
> Default: Upstash Ratelimit (@upstash/ratelimit).
>
> Justification: Serverless-compatible (no persistent connection). Redis-backed with sliding window algorithm. Framework specifies "5 failed logins = 15 min lock" (file 02) — this implements it.

### Error Tracking

> Add when: Deploying to production.
>
> Default: Sentry (@sentry/nextjs).
>
> Justification: Captures runtime errors with stack traces, breadcrumbs, and user context. Framework error taxonomy (file 17) defines error types — Sentry captures them with structured metadata.

### Analytics

> Add when: Product analytics required beyond custom dashboard metrics.
>
> Default: PostHog for product analytics (event tracking, funnels, feature flags).
>
> Justification: Self-hostable, privacy-friendly, integrates with Next.js.

---

## Do Not Include by Default

These were evaluated and intentionally excluded from the default stack:

| Library | Reason for exclusion |
|---------|---------------------|
| **Redux / Zustand** | Server Components + Tanstack Query + nuqs covers 95% of state needs. React Context handles auth/theme. |
| **tRPC** | Adds complexity. Next.js server actions + route handlers are sufficient for most SaaS apps. |
| **DaisyUI** | Tailwind plugin with predefined themes. Less customizable than shadcn for matching framework component specs. |
| **NextUI / HeroUI** | Opinionated styling conflicts with framework design tokens. |
| **Chakra UI** | Different styling paradigm (CSS-in-JS). Mixing with Tailwind creates two competing systems. |
| **Bulma** | Not Tailwind-based. Conflicts with token system. |
| **Tailwind UI** | Paid, and shadcn covers the same ground with more flexibility. |
| **next-intl** | Framework says English-first for v1. Add only when multilingual support is explicitly scoped. |
| **Prisma Pulse** | Realtime not needed for v1 unless project docs require it. |

## Constraints

> Example: Must deploy to Vercel (team already has a plan). Database must be PostgreSQL (existing data migration requirement). No self-hosted infrastructure — all managed services.
