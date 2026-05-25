# Chippi Architecture Contracts

These are the canonical contracts that govern onboarding, identity, and public intake. All code paths must conform to these. If you are changing any of the systems below, read this first.

## Contract A: Onboarding Truth

| Rule | Detail |
|------|--------|
| Single source of truth | `User.onboard` (Boolean) |
| Audit-only timestamp | `User.onboardingCompletedAt` — never null it out, never use it for routing |
| Read helper | `getOnboardingStatus(user)` in `lib/onboarding.ts` |
| Backfill helper | `ensureOnboardingBackfill(user, db)` in `lib/onboarding.ts` |
| Space creation path | Only `app/api/onboarding/route.ts` (`create_space` action) |
| Completion | `complete` action in onboarding API — sets `onboard=true`, idempotent |

### Rules

1. If `user.onboard === true`, the user must NEVER see `/onboarding`.
2. If `user.onboard === false` and user has a space, backfill sets `onboard=true`.
3. Backfill is consolidated in `ensureOnboardingBackfill()` — do not write inline backfill logic.
4. The `complete` action is idempotent — calling it when already onboarded returns success.
5. Space deletion resets `onboard=false` and `onboardingCurrentStep=1` (full re-onboard).
6. `onboardingCompletedAt` is never set to `null` — it is a permanent audit record.

## Contract B: Slug Identity

| Rule | Detail |
|------|--------|
| Single identity field | `Space.slug` — DB column is literally named `slug` (see `supabase/schema.sql`). Historical note: slug used to map via Prisma `@map("subdomain")` before the Supabase/raw-SQL migration; today the field is named `slug` directly on `Space` and no Prisma mapping exists. |
| URL format | Path-based only: `/apply/{slug}` |
| URL builder | `buildIntakeUrl(slug)` in `lib/intake.ts` |
| Normalization | `normalizeSlug(raw)` — lowercase, strip non-alphanumeric except hyphens |
| Lookup | `getSpaceFromSlug(slug)` in `lib/space.ts` — normalizes before query |

### Rules

1. No subdomain routing exists. The `@map("subdomain")` is a legacy DB column name only.
2. All intake URLs are `{protocol}://{rootDomain}/apply/{slug}`.
3. `NEXT_PUBLIC_ROOT_DOMAIN` env var must be set to match the deployment domain.
4. Slug is immutable after creation (UI enforces this in settings).

## Contract C: Public Intake Submission

| Rule | Detail |
|------|--------|
| Public page | `app/apply/[slug]/page.tsx` — no auth required |
| Submit endpoint | `POST /api/public/apply` |
| Validation | `publicApplicationSchema` in `lib/public-application.ts` |
| Dedup | Redis idempotency lock + DB duplicate check (2-min window, same name+phone) |
| Lead scoring | Async, failure-safe — lead is saved even if scoring fails |

### Rules

1. The slug in the form payload must match a real `Space.slug` in the DB.
2. Missing slug, invalid payload, or missing space return structured errors (not 500s).
3. Duplicate submissions within 2 minutes return the existing record (200, not 201).
4. Lead scoring failure does not prevent the lead from being saved.
5. All contacts from intake are tagged `['application-link', 'new-lead']`.

## Routing Summary

| Path | Auth | Behavior |
|------|------|----------|
| `/onboarding` | Required | If onboarded → redirect to `/s/{slug}` (or `/dashboard`). Otherwise show wizard. |
| `/dashboard` | Required | If onboarded + space → redirect to `/s/{slug}`. If onboarded + no space → repair + redirect to `/onboarding`. Otherwise → redirect to `/onboarding`. |
| `/s/{slug}/*` | Required | If not onboarded → redirect to `/onboarding`. Otherwise render workspace. |
| `/apply/{slug}` | None | Public intake form. 404 if slug not found. |

## Test Files

- `scripts/onboarding-contract.test.mjs` — routing, backfill, and lifecycle tests
- `scripts/intake-contract.test.mjs` — slug, URL, phone, fingerprint, and validation tests

Run: `node --test scripts/onboarding-contract.test.mjs scripts/intake-contract.test.mjs`
