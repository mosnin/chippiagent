# Auth & Routing Flow

How sign-up, sign-in, and onboarding work — and what broke and how it was fixed.

---

## The flow

```
Sign Up (Clerk)  ──→  /dashboard  ──→  /setup  ──→  /s/{slug}
Sign In (Clerk)  ──→  /dashboard  ──→  /s/{slug}
                                   └──→  /setup  (if no workspace yet)
```

### Step by step

| Step | URL | File | What happens |
|------|-----|------|-------------|
| 1 | `/sign-up` | `app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Clerk creates user account. Redirects to `/dashboard` via `forceRedirectUrl`. User exists in Clerk but NOT in the database yet. |
| 2 | `/sign-in` | `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Clerk authenticates. Redirects to `/dashboard`. |
| 3 | `/dashboard` | `app/dashboard/page.tsx` | **Routing page, not a real dashboard.** Queries `User` + `Space` by `clerkId`. Has space → redirect to `/s/{slug}`. No space or no user → redirect to `/setup`. |
| 4 | `/setup` | `app/setup/page.tsx` | If no DB user, creates one via INSERT/upsert. If user already has a space, redirects to `/s/{slug}`. Otherwise renders `<CreateWorkspaceForm>`. |
| 5 | `/api/onboarding` | `app/api/onboarding/route.ts` | POST with `action: 'create_space'` creates the Space, SpaceSetting, and default DealStages. |
| 6 | `/s/{slug}` | `app/s/[slug]/layout.tsx` | Workspace layout. Verifies user exists in DB, loads space, renders sidebar + header + content. |

### Key details

- **No Clerk webhooks.** User records are created lazily the first time they hit `/setup`.
- **Middleware** (`middleware.ts`) protects `/dashboard`, `/s/*`, `/setup`, `/admin`. Unauthenticated users go to `/sign-in`.
- **DB user creation** happens in exactly two places: `/setup` page and `POST /api/onboarding`. Both use `ON CONFLICT ("clerkId") DO UPDATE` for idempotency.

---

## What broke and how it was fixed

### Historical: the Prisma `@map("subdomain")` bug (resolved)

> This section is preserved as incident lore. The bug described below is no longer possible: Prisma has been removed from the stack entirely, there is no `@map` in the codebase (grep `@map` across `lib/` and `supabase/` returns no hits), and the Space table's column is literally named `slug` in `supabase/schema.sql`.

**Root cause (historical):** The app was migrated from Prisma to raw SQL (`@neondatabase/serverless`). The Prisma schema had this mapping on the Space model:

```prisma
slug String @unique @map("subdomain")
```

This told Prisma: "the field is called `slug` in code, but the actual database column is called `subdomain`." Every raw SQL query was written using `"subdomain"` as the column name based on this mapping.

**But the actual database column was named `slug`, not `subdomain`.** The `@map("subdomain")` was a leftover from an old naming convention that never matched the real DB schema. Prisma abstracted this away, so it was never a problem until the migration to raw SQL exposed the mismatch.

**The fix (historical):** Replaced every occurrence of `"subdomain"` with `"slug"` in SQL queries across 12 files:

| File | What changed |
|------|-------------|
| `app/dashboard/page.tsx` | `s."subdomain" AS "slug"` → `s."slug"` |
| `app/setup/page.tsx` | Same pattern |
| `app/admin/page.tsx` | Same pattern |
| `app/admin/users/page.tsx` | All search queries + column references |
| `app/admin/users/[userId]/page.tsx` | Space query |
| `app/actions.ts` | DELETE + SELECT queries |
| `app/api/onboarding/route.ts` | All INSERT/SELECT/RETURNING clauses |
| `app/api/spaces/route.ts` | PATCH + DELETE handlers |
| `app/api/admin/actions/route.ts` | Admin action query |
| `app/s/[slug]/configure/page.tsx` | Space query |
| `lib/space.ts` | All three space lookup functions |
| `lib/types.ts` | Removed misleading comment |

### How to prevent this in the future

1. **Never reference `"subdomain"` in SQL.** The column is `"slug"`. Period.
2. **Prisma is gone.** Historical: the Prisma schema once lived in `node_modules/.prisma/client/schema.prisma` and was the source of the `@map` trap above. Today Prisma is not part of the stack at all — the real (and only) schema is `supabase/schema.sql`.
3. **If you add a new SQL query referencing the Space table,** use `"slug"` for the workspace identifier column.

### Other fix: error visibility

The dashboard error page previously hid the actual SQL error in production (`NODE_ENV === 'development'` guard). This was removed so the error message is always visible, along with a "Check DB" link to `/api/health`.

---

## Database reference

Uses `@supabase/supabase-js` via `lib/supabase.ts`. Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars. Auth is still handled by Clerk — Supabase is used only for database storage (service role key, no RLS).

### Space table columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | Primary key |
| **`slug`** | String | **Unique workspace identifier. NOT `subdomain`.** |
| `name` | String | Display name |
| `emoji` | String | Workspace icon |
| `createdAt` | DateTime | Auto-set |
| `ownerId` | String | FK to User.id, unique (one space per user) |

### Debugging

- `/api/health` — checks DB connectivity and lists tables
- `/dashboard` error page — shows the actual SQL error message
- Vercel function logs — search for `[dashboard]`, `[setup]`, `[layout]` prefixed errors
