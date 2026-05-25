# 08 QA Checklist

> **TL;DR:** Template providing a pre-release verification checklist covering auth, permissions, billing, empty states, errors, mobile, and dark mode.
> **Covers:** auth, redirects, onboarding, dashboard, permissions, settings, billing, admin, empty states, errors, mobile, dark mode | **Phase:** 2

## Instructions

Use this checklist before marking any milestone as complete. Check each item and note any failures. Each category should be tested across all relevant pages.

## Auth
- [ ] Signup creates account and sends verification email
- [ ] Login works with valid credentials
- [ ] Login fails gracefully with invalid credentials
- [ ] Forgot password sends reset email
- [ ] Password reset link works and expires correctly
- [ ] Verified user can log in; unverified user cannot
- [ ] OAuth flow works (if applicable)
- [ ] Logout clears session and redirects to /login

## Redirects
- [ ] Unauthenticated user visiting protected route → /login
- [ ] Authenticated user visiting /login → /dashboard
- [ ] Non-admin visiting /admin → /dashboard or 403
- [ ] Deep links preserve intended destination after login

## Onboarding
- [ ] New user sees onboarding on first login
- [ ] Progress is saved between sessions
- [ ] Skip works on optional steps
- [ ] Completing onboarding redirects to dashboard
- [ ] Returning user never sees onboarding again

## Dashboard
- [ ] Loads with correct data for the current organization
- [ ] Summary metrics are accurate
- [ ] Empty state shows when no data exists
- [ ] Loading skeleton appears while data fetches

## Permissions
- [ ] Each role can only access their permitted routes
- [ ] Sidebar hides links the user cannot access
- [ ] API endpoints enforce role checks (not just UI)
- [ ] Role changes take effect without re-login

## Settings
- [ ] Profile updates save and reflect immediately
- [ ] Workspace settings restricted to admin/owner
- [ ] Notification preferences persist across sessions
- [ ] Security settings (password change, sessions) work correctly

## Billing
- [ ] Current plan displays accurately
- [ ] Upgrade flow completes via Stripe Checkout
- [ ] Downgrade/cancel shows correct messaging
- [ ] Webhook updates subscription status in real time
- [ ] Invoice history accessible with download links

## Admin
- [ ] Admin panel only visible to authorized roles
- [ ] User management (view, suspend, role change) works
- [ ] Admin actions are logged
- [ ] Admin cannot remove their own access

## Empty States
- [ ] Every list/table shows a helpful empty state (not blank)
- [ ] Empty states include a CTA to create the first item
- [ ] Dashboard empty state guides toward first value event

## Error States
- [ ] API errors show user-friendly messages
- [ ] Network failures show retry option
- [ ] Form validation errors appear inline
- [ ] 404 page exists and links back to dashboard
- [ ] 500 page exists with support contact info

## Mobile
- [ ] All pages render at 375px width without horizontal scroll
- [ ] Sidebar collapses to drawer/hamburger
- [ ] Tables adapt to card layout or horizontal scroll
- [ ] Touch targets meet 44x44px minimum
- [ ] Forms are usable on mobile keyboard

## Dark Mode
- [ ] All pages render correctly in dark mode
- [ ] No white flashes on page transitions
- [ ] Images and icons are visible against dark backgrounds
- [ ] Form inputs and borders have sufficient contrast
