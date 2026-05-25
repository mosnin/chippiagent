# 06 Routes And Permissions

> **TL;DR:** Defines route categories, canonical roles, and the three-layer permission enforcement system (middleware, API, UI) for the application.
> **Covers:** public routes, auth routes, protected routes, admin routes, roles, middleware checks, API-level auth, UI visibility | **Depends on:** 04, 07 | **Used by:** 05, 09, 18 | **Phase:** 3

## Purpose

Define the canonical route system, role visibility logic, and permission rules for the application layer.

## Route Categories

- public routes — accessible without authentication
- auth routes — login, signup, password flows (redirect away if already authenticated)
- protected routes — require authentication and a valid organization membership
- admin routes — require admin or owner role
- error or utility routes — 404, 500, maintenance

## Public Or Auth Routes

Typical routes:

- /login
- /signup
- /forgot-password
- /reset-password
- /verify-email
- /invite/[token]

Auth route behavior:
- Authenticated users visiting /login or /signup are redirected to /dashboard
- /invite/[token] works for both authenticated (join org) and unauthenticated (signup + join) users
- /verify-email accepts a token query parameter and auto-verifies on load

## Protected Routes

Typical routes:

- /dashboard
- /analytics
- /[feature] (product-specific feature routes)
- /integrations
- /api
- /webhooks
- /settings/profile
- /settings/workspace (admin/owner only)
- /settings/billing (admin/owner only)
- /settings/security
- /settings/notifications

Protected route behavior:
- Unauthenticated users are redirected to /login with a `returnTo` query parameter preserving the intended destination
- After successful login, redirect to the `returnTo` URL (default: /dashboard)
- Users without a valid organization membership are redirected to /onboarding or an org-selection page

## Admin Routes

Typical routes:

- /admin
- /admin/users
- /admin/users/[id]
- /admin/billing
- /admin/usage
- /admin/system
- /admin/logs
- /admin/flags

Admin route behavior:
- Non-admin users receive a 403 page (not a 404 — do not pretend the route does not exist for authorized roles)
- Admin sidebar section is only rendered for admin/owner roles
- All admin actions are logged to the Admin Record entity

## Canonical Roles

| Role | Stored in DB | Description | Typical Access |
|------|-------------|-------------|----------------|
| guest | No (conceptual) | Unauthenticated visitor | Public and auth routes only |
| member | Yes (Membership.role) | Standard team member | Dashboard, own data, profile settings |
| manager | Yes (Membership.role) | Team lead (optional) | Member access + team data + analytics |
| admin | Yes (Membership.role) | Organization administrator | Full access except ownership transfer and workspace deletion |
| owner | Yes (Membership.role) | Organization owner (one per org) | Full access including billing, workspace deletion, ownership transfer |

Note: `guest` is not a stored role in the Membership entity. It represents unauthenticated visitors for route categorization purposes. The four stored roles (`member`, `manager`, `admin`, `owner`) match the `role` enum in `07_data_models.md`.

## Permission Enforcement Layers

### Layer 1: Middleware (Route Level)

Check authentication and role before the page renders. This is the first line of defense.

- Verify session/token exists and is valid
- Verify user has an active membership in the current organization
- Verify user role meets the minimum required for the route
- Redirect or return 403 as appropriate

### Layer 2: API (Data Level)

Every API endpoint and Server Action must independently verify permissions. Never trust that the UI prevented unauthorized access.

- Validate session on every request
- Filter data by organization_id (multi-tenancy isolation)
- Check role for write operations (create, update, delete)
- For "own" access level, filter by user_id

### Layer 3: UI (Visibility Level)

Hide navigation items, buttons, and actions the user cannot perform. This is a UX convenience, not a security boundary.

- Sidebar links are filtered by role
- Action buttons (edit, delete, admin actions) are conditionally rendered
- Read-only views hide form controls and show data in display mode
- Never use `disabled` for unauthorized actions — hide them entirely

## Access Rules

1. Public pages redirect authenticated users away when appropriate.
2. Protected pages require authentication and org membership.
3. Admin pages require admin or owner role.
4. Module pages require both feature availability (is the module enabled for this org) and role-based permission.
5. Settings sub-pages have individual permission requirements (profile = all, workspace/billing = admin+).

## Final Principle

Permissions must be enforced in both routing and UI visibility. Hiding a button is not real access control. Every layer assumes the other layers might fail.
