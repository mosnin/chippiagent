# Multi-Account Role & Organization System — Implementation Plan

> [!IMPORTANT]
> **This plan is historical.** The brokerage feature described below was
> implemented in full (phases BP1–BP7 + linear steps 1–3). For the
> **current** data model, APIs, routing engine, and known gaps, see
> [`docs/BROKERAGE_SPEC.md`](docs/BROKERAGE_SPEC.md). This file is kept
> as a record of the original plan — any discrepancy between PLAN.md
> and BROKERAGE_SPEC.md, BROKERAGE_SPEC.md wins.

## Summary

Add three account levels to Chippi:
1. **Realtor** — default for every user, current solo workflow stays intact
2. **Broker** — self-serve brokerage creation, invite realtors, oversight dashboard at `/broker`
3. **Platform Admin** — existing `/admin` extended with broker/brokerage/invitation management

---

## Architecture

### Domain Model

| Table | Purpose |
|---|---|
| `User` | Add `platform_role` (user \| admin). Existing Clerk metadata stays as middleware fast-path. |
| `Brokerage` | Brokerage entity. One owner per brokerage. One brokerage per owner (enforced by DB). |
| `BrokerageMembership` | Join table: user ↔ brokerage with role (broker_owner \| broker_admin \| realtor_member). |
| `Space` | Add nullable `brokerageId` FK. Realtor workspace stays the atomic unit. |
| `Invitation` | Token-based invite. Pending until accepted or expired. |

### Roles

- **platform_role** on User: `user` (default) or `admin`
- **BrokerageMembership.role**: `broker_owner`, `broker_admin`, `realtor_member`
- "Is a broker" = has any BrokerageMembership where role ∈ {broker_owner, broker_admin}

### Permissions (central helpers in `lib/permissions.ts`)

```
isPlatformAdmin(clerkUserId) → boolean    — checks DB platform_role (Clerk metadata fallback)
requirePlatformAdmin()       → { userId } — throws if not admin
getBrokerageForUser(userId)  → Brokerage | null
requireBroker()              → { brokerage, membership } — throws if not broker
```

### Routing

| Route | Auth |
|---|---|
| `/broker` | requireBroker() |
| `/broker/members` | requireBroker() |
| `/broker/invitations` | requireBroker() |
| `/invite/[token]` | Clerk auth required (sign in if not) |
| `/admin/brokerages` | requirePlatformAdmin() |
| `/admin/invitations` | requirePlatformAdmin() |

---

## Phase 1 — Database Migration

### Migration file: `supabase/migrations/20260314000003_org_system.sql`

```sql
-- 1. platform_role on User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "platformRole" text NOT NULL DEFAULT 'user'
  CHECK ("platformRole" IN ('user', 'admin'));

-- 2. Brokerage table
CREATE TABLE IF NOT EXISTS "Brokerage" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        text NOT NULL,
  "ownerId"   text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  "websiteUrl" text,
  "logoUrl"   text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_owner ON "Brokerage"("ownerId");
CREATE INDEX IF NOT EXISTS idx_brokerage_status ON "Brokerage"(status);

-- 3. BrokerageMembership table
CREATE TABLE IF NOT EXISTS "BrokerageMembership" (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"  text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "userId"       text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('broker_owner', 'broker_admin', 'realtor_member')),
  "invitedById"  text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("brokerageId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_membership_brokerage ON "BrokerageMembership"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_membership_user ON "BrokerageMembership"("userId");

-- 4. Add brokerageId to Space (nullable — existing spaces unaffected)
ALTER TABLE "Space"
  ADD COLUMN IF NOT EXISTS "brokerageId" text REFERENCES "Brokerage"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_space_brokerage ON "Space"("brokerageId");

-- 5. Invitation table
CREATE TABLE IF NOT EXISTS "Invitation" (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"  text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  email          text NOT NULL,
  "roleToAssign" text NOT NULL CHECK ("roleToAssign" IN ('broker_admin', 'realtor_member')),
  token          text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "expiresAt"    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "invitedById"  text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitation_brokerage ON "Invitation"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_invitation_email ON "Invitation"(email);
CREATE INDEX IF NOT EXISTS idx_invitation_token ON "Invitation"(token);
CREATE INDEX IF NOT EXISTS idx_invitation_status ON "Invitation"(status);

-- 6. RLS for new tables (service role bypasses; these are defense-in-depth)
ALTER TABLE "Brokerage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerageMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"          ENABLE ROW LEVEL SECURITY;
```

### Schema.sql update
Add the same tables to `supabase/schema.sql` (source of truth for fresh installs).

---

## Phase 2 — Types & Permission Helpers

### `lib/types.ts` additions
```ts
export type PlatformRole = 'user' | 'admin';
export type MembershipRole = 'broker_owner' | 'broker_admin' | 'realtor_member';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export type Brokerage = {
  id: string; name: string; ownerId: string;
  status: 'active' | 'suspended'; websiteUrl: string | null;
  logoUrl: string | null; createdAt: Date;
};

export type BrokerageMembership = {
  id: string; brokerageId: string; userId: string;
  role: MembershipRole; invitedById: string | null; createdAt: Date;
};

export type Invitation = {
  id: string; brokerageId: string; email: string;
  roleToAssign: Omit<MembershipRole, 'broker_owner'>;
  token: string; status: InvitationStatus;
  expiresAt: Date; invitedById: string | null; createdAt: Date;
};
```

### `lib/permissions.ts` (new file)
```ts
// Central permission helpers — use these everywhere, never raw role checks.
isPlatformAdmin(clerkUserId)   → Promise<boolean>
requirePlatformAdmin()         → Promise<{ userId: string }>
getBrokerageForUser(dbUserId)  → Promise<{ brokerage, membership } | null>
requireBroker()                → Promise<{ brokerage, membership, dbUserId }>
```

`isPlatformAdmin` checks `User.platformRole = 'admin'` in DB. Also checks Clerk metadata as fallback (backward compatible with any existing admins set via Clerk Dashboard).

### `lib/admin.ts` update
`requireAdmin()` delegates to `requirePlatformAdmin()` from `lib/permissions.ts`.

---

## Phase 3 — Middleware

`middleware.ts`: add `/broker` to protected route matchers so unauthenticated users get redirected to sign-in. Admin check in middleware stays as Clerk metadata (edge-compatible, no DB).

---

## Phase 4 — API Routes

### `POST /api/broker/create`
- Auth: any signed-in user with a completed workspace
- Creates Brokerage row + BrokerageMembership (role: broker_owner)
- Enforces one brokerage per owner (409 if exists)

### `POST /api/broker/invite`
- Auth: requireBroker()
- Body: `{ email, role }` (role: realtor_member | broker_admin)
- Creates Invitation row
- Sends email via Resend with `/invite/[token]` link
- Idempotent: if pending invite for same email exists, return existing (don't send duplicate)

### `GET /api/broker/stats`
- Auth: requireBroker()
- Returns member counts, total leads, total applications across all member spaces

### `GET /api/invitations/[token]`
- Public read — returns brokerage name + invitation details for the accept page
- Does NOT expose sensitive data

### `POST /api/invitations/[token]/accept`
- Auth: signed-in user
- Validates token (pending, not expired)
- Creates BrokerageMembership for the current user
- Links their Space.brokerageId
- Marks invitation accepted
- If user already a member: no-op (idempotent)

### `GET /api/admin/brokerages`
- Auth: requirePlatformAdmin()
- Returns all Brokerage rows with owner info and member counts

### `GET /api/admin/invitations`
- Auth: requirePlatformAdmin()
- Returns all Invitation rows

### `PATCH /api/admin/brokerages/[id]`
- Auth: requirePlatformAdmin()
- Body: `{ status: 'active' | 'suspended' }`
- Suspends or reactivates a brokerage

### `DELETE /api/admin/memberships/[id]`
- Auth: requirePlatformAdmin()
- Removes a BrokerageMembership (and unlinks Space.brokerageId)

---

## Phase 5 — Broker Dashboard

### `app/broker/layout.tsx`
- Server component: calls requireBroker(), passes brokerage to children
- Renders `BrokerShell` (sidebar + header matching existing admin shell style)
- Mobile responsive (same pattern as AdminShell)

### `app/broker/page.tsx` — Overview
Stats cards: Members, Pending invitations, Total leads across members, Total applications
Recent member list with activation status

### `app/broker/members/page.tsx`
Table of brokerage members:
- Name, email, role badge, onboarding status badge, workspace slug, date joined

### `app/broker/invitations/page.tsx`
- Pending invitations table (email, role, sent date, expiry, status badge)
- Inline "Invite" form: email + role selector + Send button

### `components/broker/broker-shell.tsx`
Nav items: Overview, Members, Invitations
Back link to realtor workspace
Same visual pattern as AdminShell

---

## Phase 6 — Invitation Accept Flow

### `app/invite/[token]/page.tsx`
- Public page (but redirects to sign-in if not authenticated)
- Shows: brokerage name, inviting broker, role being assigned
- If authenticated: "Accept invitation" button
- If not authenticated: "Sign in to accept" → Clerk sign-in with redirect back to this page
- Error states: expired, already accepted, invalid token

---

## Phase 7 — Admin Dashboard Extension

### `app/admin/brokerages/page.tsx`
Cards showing each brokerage: name, owner, member count, status badge, suspend/reactivate toggle

### `app/admin/invitations/page.tsx`
Full invitations table: brokerage, email, role, status, expiry, invited by

### `app/admin/users/[id]/page.tsx` (extend existing)
Add brokerage membership section: show which brokerage (if any) the user belongs to, role, option to remove membership

### `app/admin/components/admin-shell.tsx` (extend)
Add nav items: Brokerages (Building2 icon), Invitations (Mail icon)

---

## Phase 8 — Navigation Updates

### `app/s/[slug]/layout.tsx` (extend)
Fetch broker membership for current user. If broker_owner or broker_admin, pass `isBroker: true` to Sidebar.

### `components/dashboard/sidebar.tsx` (extend)
If `isBroker`, add "Brokerage" nav link (Building2 icon → `/broker`) in secondary nav section.

### `components/dashboard/mobile-nav.tsx` (extend)
If `isBroker`, add Brokerage to mobile bottom bar.

---

## Phase 9 — Email Template

### `lib/email.ts`
Add `sendBrokerageInvitation({ to, brokerageName, inviterName, role, token })` function.
Matches existing email style (plain HTML, same escape helpers, Resend via existing env var).

---

## Architecture Note (ARCHITECTURE.md)
Create short doc in repo root explaining:
- Roles and how they're determined
- Organization model (Brokerage → Memberships → Spaces)
- Permission rules
- Invitation lifecycle

---

## Migration Safety

- `User.platformRole` defaults to `'user'` — all existing users unaffected
- `Space.brokerageId` is nullable — all existing spaces unaffected
- No existing tables dropped or renamed
- requireAdmin() backward compatible (checks both DB platformRole AND Clerk metadata)
- Public intake routes untouched
- Onboarding flow untouched

---

## File Change List

| File | Action |
|---|---|
| `supabase/schema.sql` | Add 3 new tables + Space.brokerageId + User.platformRole |
| `supabase/migrations/20260314000003_org_system.sql` | New migration |
| `lib/types.ts` | Add Brokerage, BrokerageMembership, Invitation types |
| `lib/permissions.ts` | New: central permission helpers |
| `lib/admin.ts` | Update requireAdmin to delegate to permissions.ts |
| `lib/email.ts` | Add sendBrokerageInvitation() |
| `middleware.ts` | Add /broker to protected routes |
| `app/broker/layout.tsx` | New: broker layout |
| `app/broker/page.tsx` | New: broker overview |
| `app/broker/members/page.tsx` | New: members list |
| `app/broker/invitations/page.tsx` | New: invitations + invite form |
| `components/broker/broker-shell.tsx` | New: broker sidebar shell |
| `app/invite/[token]/page.tsx` | New: accept invitation page |
| `app/api/broker/create/route.ts` | New |
| `app/api/broker/invite/route.ts` | New |
| `app/api/broker/stats/route.ts` | New |
| `app/api/invitations/[token]/route.ts` | New |
| `app/api/admin/brokerages/route.ts` | New |
| `app/api/admin/brokerages/[id]/route.ts` | New |
| `app/api/admin/invitations/route.ts` | New |
| `app/api/admin/memberships/[id]/route.ts` | New |
| `app/admin/brokerages/page.tsx` | New |
| `app/admin/invitations/page.tsx` | New |
| `app/admin/users/[id]/page.tsx` | Extend |
| `app/admin/components/admin-shell.tsx` | Extend nav items |
| `app/s/[slug]/layout.tsx` | Fetch broker status, pass to Sidebar |
| `components/dashboard/sidebar.tsx` | Add Brokerage link if broker |
| `components/dashboard/mobile-nav.tsx` | Add Brokerage if broker |
| `ARCHITECTURE.md` | New: role/org/permission docs |
