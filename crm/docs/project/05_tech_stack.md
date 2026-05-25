# 05 Tech Stack

## Always Included

### Frontend

Next.js 15+ (app router) with TypeScript and Tailwind CSS v4. React Server Components for data fetching, client components for interactive UI. Turbopack for development.

Justification: App router provides file-based routing, server components reduce bundle size. Tailwind v4 with CSS-first configuration.

### UI Components

shadcn/ui (built on Radix UI primitives). Lucide React for icons. Custom components in `components/ui/`.

Supporting libraries:
- **tailwind-merge** — resolves Tailwind class conflicts
- **class-variance-authority (CVA)** — component variants
- **Sonner** — toast notifications
- **@number-flow/react** — animated number transitions

### Animation

Framer Motion / Motion for UI animations. GSAP for advanced animations (landing page effects). @paper-design/shaders for visual effects.

### Forms and Validation

react-hook-form for form state. Zod v4 for schema validation shared between client and server.

### State Management

Server components for most data fetching. React Context for theme. No external state management library. URL-based state for filters where applicable.

### Backend

Next.js API routes (`app/api/*`) and server actions (`app/actions.ts`). Server components for data fetching.

### Database

PostgreSQL via Supabase (hosted). Direct Supabase client (service_role key, bypasses RLS). No ORM — raw Supabase queries.

Supabase extensions: pgcrypto, pgvector (vector similarity search for RAG).

### Auth

Clerk (@clerk/nextjs v7). Email/password + OAuth. Middleware-based route protection. Session claims for role checks.

### Billing

Stripe Checkout for payment collection. Billing page at `/s/[slug]/billing`. $97/month plan with 7-day free trial.

### Hosting

Vercel for frontend and API routes. Supabase for managed PostgreSQL.

### Email

Resend for transactional email delivery (tour confirmations, waitlist notifications, broker notifications, invitation emails).

### Dark Mode

Custom ThemeProvider using localStorage. Inline script in `<head>` for flash prevention. Class-based `.dark` toggle.

### Fonts

Geist Sans (primary), Open Sans (headings). Both loaded via next/font.

### Analytics

Amplitude (@amplitude/unified) for product analytics. Vercel Analytics and Speed Insights for performance.

### Server Actions

next-safe-action for type-safe server actions with built-in Zod validation. Wraps Next.js server actions with input validation, auth checks, and typed return values.

### Environment Validation

T3 Env (@t3-oss/env-nextjs) for type-safe environment variables. Validates all env vars at build time — catches missing CLERK_SECRET_KEY or DATABASE_URL at startup.

### Date and Number Formatting

date-fns for date manipulation (relative time, ranges). Intl API for number and currency formatting. date-fns is tree-shakeable and covers gaps the Intl API doesn't.

### Testing

Vitest for unit and integration tests. Playwright for E2E tests. Supporting: MSW for mocking external APIs (Stripe, Clerk, OpenAI), @faker-js/faker for test data generation.

## Include When Needed (Currently Active)

### Charts

Recharts for analytics dashboard charts.

### Rate Limiting

Upstash Redis (@upstash/redis) for rate limiting on auth and public API endpoints.

### AI / ML

- OpenAI SDK — lead scoring (gpt-4o-mini), embeddings (text-embedding-3-small), AI assistant (gpt-4.1-mini)
- pgvector + match_documents RPC — vector similarity search for RAG context

### Drag and Drop

@dnd-kit (core, sortable, utilities) — Kanban board deal reordering.

### Maps

dotted-map — decorative world map visualization.

### Misc

- frimousse — emoji picker for workspace emoji
- simplex-noise — noise generation for visual effects

## Include When Needed

### Complex Tables

Tanstack Table (headless) — add when feature modules require sortable, filterable tables with 5+ columns. Used for leads view, contacts list, and admin user management. Pairs with shadcn table component.

### File Uploads

uploadthing for upload infrastructure, react-dropzone for drag-and-drop UI — add when avatar uploads, document attachments, or property photos are needed.

### Background Jobs

Trigger.dev or Inngest for async processing — AI lead scoring queue, email sequences, webhook handling, report generation. For simpler needs (daily cleanup), Vercel Cron Jobs.

### Error Tracking

Sentry (@sentry/nextjs) — captures runtime errors with stack traces, breadcrumbs, and user context. Add when deploying to production.

## Not Included (Intentional)

| Library | Reason |
|---------|--------|
| Prisma | Using Supabase client directly — simpler for this project |
| Redux / Zustand | Server components + server actions handle state |
| tRPC | API routes + server actions sufficient |
| next-themes | Custom ThemeProvider already implemented |
| Auth.js / NextAuth | Using Clerk instead |
| T3 Env | Now included — used for build-time env validation |

## Constraints

- Must deploy to Vercel (existing deployment)
- Database must be Supabase PostgreSQL (existing data)
- Auth must be Clerk (deeply integrated)
- No self-hosted infrastructure — all managed services
