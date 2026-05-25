# 05 Settings Billing Admin

> **TL;DR:** Defines the canonical settings sections, billing capabilities, security controls, admin panel areas, and user management features.
> **Covers:** profile settings, workspace settings, billing, security, admin overview, user management | **Depends on:** 06 (routes/permissions), 07 (entities) | **Used by:** 09 (build rules) | **Phase:** 10, 11

## Purpose

Define the canonical account control surfaces for SaaS applications.

## Settings Layout

Settings uses a left sidebar + right content panel layout. Sidebar contains section links. Content area shows the active section form.

- Route: `/settings` (redirects to `/settings/profile`)
- Permission: All authenticated users can access profile. Workspace/billing/security restricted to admin and owner roles.

### Canonical Settings Sections

- `/settings/profile` — all roles
- `/settings/workspace` — admin, owner only
- `/settings/billing` — admin, owner only
- `/settings/security` — all roles (own security), admin for org-wide
- `/settings/notifications` — all roles
- `/settings/integrations` — admin, owner only (when integrations module is enabled)

### Profile Settings Fields

- **Name**: text input, required (2–100 chars)
- **Email**: text input, requires re-verification if changed
- **Avatar**: image upload (max 2MB, jpg/png/webp), with preview and remove
- **Timezone**: dropdown, defaults to browser timezone

### Workspace Settings Fields (admin/owner only)

- **Organization name**: text input, required
- **Slug**: text input, validated per slug rules in `07_data_models.md`, shows URL preview
- **Logo**: image upload (max 1MB), with preview and remove
- **Default role for new members**: dropdown (member, manager)
- **Danger zone**: Delete organization (requires typing org name to confirm, owner only)

## Billing

### Stripe Integration Pattern

Use Stripe Checkout for upgrades/downgrades and Stripe Customer Portal for self-service billing management.

1. **Upgrade flow**: User clicks upgrade → Create Stripe Checkout Session → Redirect to Stripe → Stripe webhook confirms → Update local Subscription record
2. **Portal flow**: User clicks "Manage billing" → Create Stripe Customer Portal Session → Redirect to Stripe → User manages payment methods/invoices
3. **Webhook endpoint**: `/api/webhooks/stripe` — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. **Webhook security**: Verify Stripe signature on every webhook. Return 200 immediately, process async.

### Required Billing Capabilities

- Current plan display with feature comparison
- Billing interval (monthly/annual toggle, show annual discount)
- Next invoice date and amount
- Payment method (last 4 digits, brand, expiry) — managed via Stripe Portal
- Invoice history (last 12 months) — link to Stripe-hosted invoices
- Upgrade or downgrade (via Stripe Checkout)
- Cancellation path (confirm dialog → cancels at period end → show reactivation option)
- Usage display when pricing is usage-based (references Usage module from `04_feature_modules.md`)

## Security

### Security Capabilities

- **Password update**: Require current password, new password (min 8 chars), confirm new password
- **Active sessions**: Table showing device/browser, IP address (masked last octet), last active timestamp, with "Revoke" action per session and "Revoke all other sessions" button
- **Two-factor auth** (when supported): TOTP setup with QR code, backup codes (10 codes, shown once), enable/disable toggle
- **Session revocation**: Individual session or bulk revoke
- **Login history**: Last 10 login events with timestamp, IP, device, success/failure (admin view for org-wide)

## Admin System

Admin must be role gated and separated from normal user space.

### Admin Routes

- `/admin` → redirects to `/admin/overview`
- `/admin/overview` — KPIs: total users, active organizations, MRR, trial conversion rate, new signups (7d)
- `/admin/users` — searchable, filterable user table
- `/admin/users/[id]` — user detail with membership, subscription, activity
- `/admin/billing` — revenue metrics, subscription breakdown by plan, failed payments
- `/admin/usage` — aggregate usage metrics, top consumers
- `/admin/logs` — admin action audit trail (AdminRecord entity)
- `/admin/flags` — feature flag management (when relevant)

## User Management

### Required Capabilities

- **Search**: by name or email, debounced (300ms)
- **Filter**: by role (dropdown), by status (active/invited/suspended), by plan
- **Sort**: by name, email, joined date, last active
- **Pagination**: server-side, 25 per page
- **View detail**: full user profile, memberships, subscription state, onboarding progress, recent activity
- **Edit role**: dropdown change with confirmation (cannot demote last owner)
- **Suspend**: sets Membership.status to suspended with confirmation dialog. Suspended users see "Account suspended" on login.
- **Reactivate**: sets Membership.status back to active
- **Remove**: removes Membership (not User account). Confirmation dialog with warning about data access loss.

## Final Principle

Settings, billing, and admin are leverage systems. They should be first class parts of the product, not afterthoughts hidden behind awkward menus.
