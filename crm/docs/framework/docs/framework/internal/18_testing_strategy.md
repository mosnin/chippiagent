# 18 Testing Strategy

> **TL;DR:** Defines the automated testing strategy — unit, integration, and E2E test layers with tool choices, what to test, what to skip, test data factories, and CI pipeline integration.
> **Covers:** test stack, testing philosophy, unit/integration/E2E layers, route protection, permission testing, billing flows, responsive testing, CI pipeline, test data strategy | **Depends on:** 06 | **Used by:** 09 | **Phase:** 14

## Purpose

Define the automated testing strategy for SaaS products built with this framework. Complements the manual QA checklist (`08_qa_checklist_template.md`) with automated testing expectations. This document is opinionated — it tells you what to test, how deeply, and what to skip.

## Default Test Stack

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest | `__tests__/unit/` or colocated `*.test.ts` |
| Integration | Vitest + Testing Library + Supertest | `__tests__/integration/` |
| End-to-end | Playwright | `e2e/` |
| Database | PostgreSQL test instance (same schema) | Managed via test setup scripts |
| Mocking | msw (Mock Service Worker) for HTTP, Vitest mocks for modules | Colocated with tests |

## Testing Philosophy

- Test behavior, not implementation details.
- Integration tests provide the most value per effort in SaaS apps.
- Unit test pure logic: calculations, transformations, validation, permission checks.
- E2E test critical user paths: signup, onboarding, billing, core feature.
- Do not aim for 100% coverage. Aim for confidence in critical paths.
- A flaky test is worse than no test. Fix or delete flaky tests immediately.
- Tests must run fast enough that developers never skip them locally.

---

## Testing Layers

### 1. Unit Tests

**What to test:**

- Pure functions (no side effects, no database, no network)
- Validation logic (email format, password strength, required fields)
- Data transformers (API response → UI model, CSV export formatters)
- Utility functions (date formatting, currency display, slug generation)
- Permission check functions (canUserAccess, isRoleAllowed)
- Price and billing calculations (proration, tax, discount application)
- Date/time logic (trial expiry, grace periods, timezone conversions)

**What NOT to test:**

- React components in isolation (test via integration instead)
- Simple getters, setters, or pass-through functions
- Framework code (Next.js internals, Prisma client methods)
- Type definitions or constants

**Conventions:**

- File naming: `[function-name].test.ts`
- One describe block per function, one test per behavior
- No mocking unless the function depends on an external module
- Arrange-Act-Assert pattern in every test
- Speed target: full unit suite under 10 seconds

---

### 2. Integration Tests

**What to test:**

- API routes end-to-end (HTTP request → response body + status code)
- Database operations (Prisma queries return expected data)
- Auth flows (login, signup, token refresh, session validation)
- Permission enforcement at the API layer (403 for unauthorized)
- Form submission flows (component render → user input → submit → result)
- Webhook handlers (Stripe webhooks, email service callbacks)
- Middleware behavior (auth redirect, rate limiting, CORS)

**What NOT to test:**

- Third-party API internals (mock Stripe, mock email providers)
- Browser-specific rendering (that is E2E territory)

**Database strategy:**

- Use a dedicated test database with the same Prisma schema
- Run `prisma migrate deploy` before the test suite
- Reset database state between test suites (not individual tests, for speed)
- Use transactions where possible for faster cleanup
- **Database reset strategy:** Use transaction rollback for individual tests (wrap each test in a transaction, rollback after). Use `TRUNCATE ... CASCADE` for suite-level cleanup (faster than DROP/CREATE). Never use `prisma migrate reset` in CI — too slow. Seed data: use factory functions per test, not shared seed files (avoids test coupling).

**Mocking strategy:**

- Mock all external HTTP calls with msw (Stripe API, email services, OAuth providers)
- Never mock Prisma — test against the real database
- Never mock Next.js request/response — use actual HTTP calls via Supertest
- Mock time-dependent functions (Date.now) when testing expiry logic

**Conventions:**

- File naming: `[feature-area].integration.test.ts`
- Group by feature, not by technical layer
- Each test file sets up its own auth context (test user, test org)
- Use factory functions for test data creation
- Speed target: full integration suite under 60 seconds

---

### 3. End-to-End Tests

**What to test:** Critical user journeys only. Each test represents a real user accomplishing a real goal.

**Critical paths (always test these):**

1. **Signup → Onboarding → First Value** — new user signs up, verifies email, completes onboarding, reaches dashboard with first value event delivered
2. **Login → Dashboard → Core Feature CRUD** — existing user logs in, dashboard loads, creates/reads/updates/deletes a core entity, changes persist across reload
3. **Billing: Plan Upgrade** — user selects paid plan, completes Stripe Checkout (test mode), returns with active subscription, plan-gated features become accessible
4. **Settings: Profile Update** — user changes profile info, saves, navigates away and returns, changes persist
5. **Admin: User Management** — admin views user list, changes a role, verifies permission change, tests destructive action confirmation
6. **Mobile: Critical Paths at 375px** — repeat paths 1–3 at mobile viewport, verify sidebar collapse, form usability, touch targets

**Failure scenario tests:** For each critical path, test the primary failure mode:
- Signup: email already taken → shows inline error, no redirect
- Login: wrong password → shows error, does not reveal if email exists
- Payment: card declined → shows error, user stays on checkout
- Invite: expired link → shows expiry message with 'request new invite' CTA
- Form submission: network failure → shows retry option, does not lose form data

**Conventions:**

- File naming: `[journey-name].spec.ts`
- One file per user journey, not per page
- Use Page Object pattern for reusable selectors
- Store test user credentials in environment variables, never hardcoded
- Take screenshots on failure for debugging
- Speed target: full E2E suite under 5 minutes
- Run frequency: before deploy (CI gate), not on every commit

---

## Specific Testing Areas

### Route Protection

Every protected route must be tested for auth enforcement.

| Scenario | Expected | Method |
|----------|----------|--------|
| Protected API route, no auth token | 401 Unauthorized | Integration |
| Protected API route, expired token | 401 Unauthorized | Integration |
| Admin API route, non-admin user | 403 Forbidden | Integration |
| Protected page, no session | Redirect to /login | E2E |
| Admin page, non-admin session | Redirect to /dashboard or 403 page | E2E |

Create a test helper that iterates over all protected routes and tests each with no auth, expired auth, and insufficient role. This prevents new routes from shipping without protection.

### Permission Enforcement

For each role defined in the permissions matrix (`06_routes_and_permissions.md`):

- Test what the role CAN access (positive cases)
- Test what the role CANNOT access (negative cases)
- Test permission changes propagate immediately (role upgrade/downgrade)
- Test org-scoped data isolation (user from Org A cannot read Org B data)

Method: integration tests with different auth contexts. Create a helper that switches test user roles.

### Form Validation

| Scenario | Method |
|----------|--------|
| Client-side validation catches invalid input before submit | Integration (component) |
| Server-side validation catches bypassed client validation | Integration (API) |
| Error messages are specific and attached to the correct field | Integration (component) |
| Form preserves user input on validation error | Integration (component) |
| Submit button disables during submission (no double submit) | Integration (component) |

Test both the happy path and at least three invalid input variants per form.

### Billing Flows

| Scenario | Method |
|----------|--------|
| Plan selection → Stripe Checkout redirect | E2E (Stripe test mode) |
| Successful payment → webhook → subscription active | Integration (mocked webhook) |
| Payment failure → appropriate error shown | E2E (Stripe decline card) |
| Plan upgrade → prorated billing applied | Integration (mocked webhook) |
| Plan downgrade → access continues until period end | Integration |
| Cancellation → access until period end → expired | Integration |
| Trial expiry → prompt to upgrade | Integration |
| Webhook signature validation rejects invalid payloads | Integration |

**Stripe test cards:** `4242424242424242` (success), `4000000000000002` (decline), `4000002500003155` (3D Secure), `4000000000009995` (insufficient funds).

Never call real Stripe APIs in unit or integration tests. Mock the Stripe SDK responses. Only E2E tests should hit Stripe test mode.

### Onboarding

| Scenario | Method |
|----------|--------|
| New user sees onboarding flow | E2E |
| Returning user bypasses onboarding | E2E |
| Onboarding steps complete in defined order | E2E |
| Progress persists if user navigates away mid-flow | Integration |
| Skip behavior works (if allowed for the step) | Integration |
| Onboarding completion updates user state correctly | Integration |

### Admin Safety

| Scenario | Method |
|----------|--------|
| Destructive actions require confirmation dialog | E2E |
| Admin cannot delete their own account | Integration |
| Admin cannot escalate beyond their own role | Integration |
| Audit log records all admin write actions | Integration |
| Bulk operations have safeguards (max selection, confirmation) | E2E |

### Responsive Layout

Test critical pages at three viewport widths using Playwright.

| Viewport | Width | Represents |
|----------|-------|------------|
| Mobile | 375px | iPhone SE / small Android |
| Tablet | 768px | iPad portrait |
| Desktop | 1280px | Standard laptop |

Verify at each viewport: no horizontal scroll, navigation accessible (hamburger on mobile), sidebar collapses below tablet breakpoint, tables convert to cards or scroll on mobile, touch targets at least 44px, modals usable, forms single-column on mobile.

### Dark Mode

| Scenario | Method |
|----------|--------|
| All pages render without contrast issues | Playwright with `prefers-color-scheme: dark` |
| No white flash on page navigation | E2E screenshot diff |
| Charts and visualizations use dark-appropriate colors | Manual QA |
| Form inputs and selects are readable | Playwright screenshot comparison |

**Playwright dark mode setup:** Set `colorScheme: 'dark'` in `playwright.config.ts` under `use` or per-project. Example:
```ts
use: { colorScheme: 'dark' }
```
This sets `prefers-color-scheme: dark` for the browser context. Run dark mode tests as a separate project in the config to keep test matrix clear.

### Email Templates

If email templates exist in the repository:

- Test templates render with all variable slots populated (unit test)
- Test graceful fallback for missing optional variables (unit test)
- Test plain text fallback exists and is readable (unit test)
- Test links point to correct URLs (unit test)
- Visual rendering across clients: manual QA or Litmus

---

## Test Data Strategy

### Factories

Create factory functions for every core entity. Never write raw SQL or raw Prisma calls in tests.

```
createTestUser({ role: 'admin', org: testOrg })
createTestOrg({ plan: 'pro', memberCount: 3 })
createTestSubscription({ status: 'active', planId: 'pro-monthly' })
```

### Seed Users

Seed one test user per role for consistent testing:

| Email | Role | Purpose |
|-------|------|---------|
| `test-member@example.com` | Member | Standard user flows |
| `test-manager@example.com` | Manager | Mid-tier permission flows |
| `test-admin@example.com` | Admin | Admin panel flows |
| `test-owner@example.com` | Owner | Org management, billing |
| `test-new@example.com` | (none) | Fresh signup, onboarding flows |

### Data Isolation

- Each test suite creates its own org and users when needed
- Use deterministic but unique IDs per test run (prefix with test run ID)
- Reset database between test suites, not between individual tests
- Never reference production data, real emails, or real payment methods
- Clean up test data in `afterAll` hooks as a safety net

---

## CI Integration

### Pipeline Stages

| Trigger | Tests Run | Time Budget | Blocking |
|---------|-----------|-------------|----------|
| Every push | Unit + lint + type check | < 2 minutes | Yes |
| Pull request | Unit + integration | < 4 minutes | Yes |
| PR merge to main | Unit + integration + E2E | < 7 minutes | Yes (deploy gate) |
| Nightly (optional) | Full suite + visual regression + perf budget | < 15 minutes | Alert only |

### CI Environment

- Test database: ephemeral PostgreSQL instance per CI run (Docker or CI service)
- Environment variables: stored in CI secrets, never in repo
- Stripe: test mode API keys only
- Browser: Playwright bundled Chromium (no external dependency)

**CI environment setup:**
- Database: Use PostgreSQL service container (GitHub Actions `services` block) or Docker Compose
- Stripe: Set `STRIPE_SECRET_KEY` to test mode key in CI secrets. Use Stripe CLI `stripe listen --forward-to` for webhook testing in CI
- Environment variables: Store in CI secrets, never in `.env` files committed to repo
- Browser binaries: Cache Playwright browsers (`npx playwright install --with-deps`) in CI cache layer
- Parallelism: unit and integration in parallel, E2E sequentially
- **Parallelization strategy:** Unit tests: unlimited parallelism (no shared state). Integration tests: max 4 workers, each with isolated database schema (e.g., `test_schema_1`, `test_schema_2`). E2E tests: max 2 workers (browser resource constraints). Set via `vitest.config.ts` `pool` and `poolOptions` for Vitest, `workers` in `playwright.config.ts`.

### Failure Protocol

- Unit or integration fail on push: developer must fix before PR
- E2E fail on PR: investigate before merge, do not bypass
- Nightly fail: create a bug ticket, fix within 24 hours
- Flaky test (passes on retry): mark as flaky, fix within 48 hours or delete

---

## What NOT to Test

- Third-party library internals (Prisma query behavior, Stripe SDK, NextAuth)
- CSS styling or pixel-perfect layout (use visual regression if truly needed)
- Auto-generated code (Prisma client, GraphQL codegen, OpenAPI types)
- Obvious code (constant definitions, type exports, re-exports)
- Console output or logging (unless logging is a product feature)
- Environment configuration files
- Static marketing pages (test critical CTAs only)

---

## Relationship to Manual QA

The manual QA checklist covers exploratory testing and subjective quality that automation cannot catch. Both automated tests and manual QA are required before shipping.

| Area | Automated Tests Cover | Manual QA Covers |
|------|----------------------|------------------|
| Auth flows | Happy path + error codes | Expired tokens, concurrent sessions, browser back button |
| Permissions | Role access matrix | Role switching mid-session, edge combinations |
| Forms | Validation logic + submission | Accessibility, tab order, screen reader, autofill |
| Billing | Checkout + webhook + state | Invoice display, email receipts, plan comparison UX |
| Mobile | Viewport rendering | Real device testing, gesture behavior, keyboard overlap |
| Dark mode | Color scheme preference | Visual inspection of every page, contrast review |
| Empty states | State detection | Copy quality, CTA correctness, illustration review |
| Error states | Error triggering + display | Error message clarity, recovery path |
| Performance | Lighthouse budget (nightly) | Perceived speed, animation smoothness |

---

## File Structure

```
project-root/
├── __tests__/
│   ├── unit/
│   │   ├── validation/        # email.test.ts, password.test.ts
│   │   ├── permissions/       # role-checks.test.ts
│   │   ├── billing/           # proration.test.ts
│   │   └── utils/             # date-format.test.ts, currency.test.ts
│   ├── integration/
│   │   ├── auth/              # login.integration.test.ts, signup.integration.test.ts
│   │   ├── api/               # users.integration.test.ts, billing.integration.test.ts
│   │   ├── permissions/       # route-protection.integration.test.ts
│   │   └── webhooks/          # stripe.integration.test.ts
│   ├── factories/             # user.factory.ts, org.factory.ts, subscription.factory.ts
│   ├── helpers/               # auth-context.ts, db-reset.ts, mock-stripe.ts
│   └── setup.ts
├── e2e/
│   ├── signup-onboarding.spec.ts
│   ├── login-dashboard-crud.spec.ts
│   ├── billing-upgrade.spec.ts
│   ├── settings-profile.spec.ts
│   ├── admin-user-management.spec.ts
│   └── mobile-critical-paths.spec.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## Final Principle

Tests exist to give confidence, not to hit a coverage number. Test the paths users actually take. Test the boundaries where things break. Skip the rest. A fast, reliable test suite that covers critical paths is worth more than a slow, flaky suite that covers everything.
