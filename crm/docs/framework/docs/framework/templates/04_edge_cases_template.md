# 04 Edge Cases

> **TL;DR:** Template for cataloging realistic edge cases across auth, billing, product logic, integrations, and data integrity.
> **Covers:** auth edge cases, billing failures, product conflicts, integration errors, data constraints | **Phase:** 2

## Instructions

List edge cases grouped by category. For each, describe the specific scenario, what the system should do, and which page or module is affected. Focus on realistic situations that will occur in production — not hypothetical extremes.

## Auth Edge Cases

### Edge Case: Expired verification link
Scenario: User clicks email verification link after it has expired (24+ hours).
Expected system behavior: Show "Link expired" message with a "Resend verification" button. Do not auto-login.
Relevant page or module: /verify-email

### Edge Case: Login from invited account before accepting
Scenario: User tries to log in with an email that only exists as a pending invite (Membership status = invited).
Expected system behavior: Show "You have a pending invitation — check your email" message with option to resend invite.
Relevant page or module: /login

## Billing Edge Cases

### Edge Case: Payment fails during upgrade
Scenario: User initiates plan upgrade but Stripe payment fails (card declined).
Expected system behavior: User stays on current plan. Show "Payment failed" error with link to update payment method. Do not partially apply the new plan.
Relevant page or module: /settings/billing

### Edge Case: Subscription lapses while user is active
Scenario: Subscription status changes to past_due via Stripe webhook while user is logged in.
Expected system behavior: Show a non-blocking banner on all pages: "Your payment is past due — update your billing info to avoid service interruption." Do not lock the user out immediately. Allow a grace period defined by Stripe dunning settings.
Relevant page or module: Global banner, /settings/billing

## Product Edge Cases

### Edge Case: Delete client who has invoices
Scenario: User tries to delete a client who has existing invoices (draft, sent, or paid).
Expected system behavior: Prevent hard delete. Offer "Archive" instead, which hides the client from dropdowns but preserves all invoice history. Show confirmation dialog explaining why.
Relevant page or module: Client management

## Integration Edge Cases

### Edge Case: OAuth token expires mid-session
Scenario: User's Stripe OAuth token expires while they are using the app.
Expected system behavior: On next API call that fails auth, show "Reconnect Stripe" prompt. Do not crash or show raw error. Queue any pending operations for retry after reconnection.
Relevant page or module: Integration settings, invoice sending

## Data Edge Cases

### Edge Case: Organization with no members
Scenario: Last remaining member (owner) deletes their account.
Expected system behavior: Prevent deletion if user is the sole owner. Show "Transfer ownership before deleting your account" prompt. Never allow orphaned organizations.
Relevant page or module: /settings/profile, account deletion flow
