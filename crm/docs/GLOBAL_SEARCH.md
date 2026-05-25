# Global Search (Cmd+K)

How the global search works, common failure modes, and how to fix them.

---

## Overview

The global search is triggered by **Cmd+K** (or Ctrl+K) from anywhere in the app. It searches **contacts**, **deals**, and **tours** in parallel and shows results in a modal overlay.

## Architecture

```
User types in search modal (Cmd+K)
  → 200ms debounce
  → GET /api/search?slug={slug}&q={query}
  → requireSpaceOwner(slug)  ← authenticates + verifies workspace access
  → 3 parallel Supabase queries (contacts, deals, tours)
  → JSON response: { contacts, deals, tours }
  → Client renders results grouped by type
```

### Files

| File | Purpose |
|------|---------|
| `components/dashboard/global-search.tsx` | Client component — modal UI, keyboard nav, debounced fetch |
| `app/api/search/route.ts` | API route — auth, sanitization, parallel queries |

### Search fields per entity

| Entity | Fields searched (ILIKE) | Results display |
|--------|------------------------|-----------------|
| **Contact** | `name`, `email`, `phone` | Name, email/phone, lead score label |
| **Deal** | `title`, `address` | Title, stage name + color, value |
| **Tour** | `guestName`, `guestEmail`, `propertyAddress` | Guest name, property/date, status |

## Page-level search

Both the **Deals** and **Tours** pages have inline search bars for filtering large datasets client-side.

| Page | File | Fields searched |
|------|------|----------------|
| Deals (Pipeline) | `components/deals/kanban-board.tsx` | title, address, description, contact names |
| Tours | `app/s/[slug]/tours/tours-client.tsx` | guest name, email, phone, property address, notes, linked contact |

These are client-side filters (no API call) — they filter the already-loaded data instantly.

---

## Common failure modes and fixes

### 1. Search returns 500

**Root cause:** Unhandled exception in the API route.

**How it was fixed (March 2026):** The `requireSpaceOwner()` call was outside the try-catch block, so any auth or space-lookup failure threw an unhandled exception. Fix: wrap the ENTIRE handler (including auth) in try-catch.

**If it happens again:**
- Check Vercel function logs for `[search]` prefixed errors
- The route logs specific errors for each entity: `[search] contacts error:`, `[search] deals error:`, `[search] tours error:`
- Each query is individually error-handled — one failing table won't block the others
- Common sub-causes:
  - Supabase env vars missing → `getSupabase()` throws
  - Clerk session expired → `requireSpaceOwner()` returns 401
  - Table schema changed → Supabase returns column-not-found error

### 2. Search returns empty results

**Check:**
- Is the query at least 2 characters? (enforced client-side and server-side)
- Is the `slug` being passed? Check `GlobalSearch` receives it from the layout
- Does the user own the workspace? `requireSpaceOwner` verifies this
- Are special characters being stripped? The route sanitizes `, ( ) . : ; ' "` — if the search term is ONLY special characters, it returns empty

### 3. Tours don't appear in results

**Check:**
- Does the `Tour` table exist? Created by migration `20260319000001_tour_booking.sql`
- Are the column names correct? The query uses: `guestName`, `guestEmail`, `propertyAddress`, `startsAt`, `status`
- Tour search failures are non-fatal — contacts and deals will still return even if the Tour query fails

### 4. Input sanitization

The search term is sanitized before being used in ILIKE queries:
1. Truncated to 100 characters
2. PostgreSQL ILIKE special chars escaped: `\`, `%`, `_`
3. PostgREST filter-breaking chars stripped: `, ( ) . : ; ' "`
4. Wrapped in `%..%` wildcards for substring matching

If a search term becomes empty after sanitization, the route returns empty results (not an error).

---

## Key implementation details

- **Debounce:** 200ms delay before firing the API call
- **Result limit:** 8 per entity type
- **Keyboard navigation:** Arrow keys move cursor, Enter opens, Escape closes
- **Portal rendering:** The modal is rendered via `createPortal` to `document.body` to avoid z-index issues
- **Deal stages:** Fetched in a separate query after deals to avoid PostgREST join + `or()` filter conflicts
