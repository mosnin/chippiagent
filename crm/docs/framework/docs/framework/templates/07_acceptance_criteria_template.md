# 07 Acceptance Criteria

> **TL;DR:** Template for writing testable acceptance criteria across auth, onboarding, dashboard, features, billing, and mobile responsiveness.
> **Covers:** auth, onboarding, dashboard, feature modules, settings, billing, admin, mobile, error handling | **Phase:** 2

## Instructions

Write acceptance criteria as testable statements using "Given / When / Then" or simple "Must" assertions. Each criterion should be verifiable by a human or automated test. Group by system area.

## Auth

> Example:
> - User can sign up with email and password. Account is created and verification email is sent within 30 seconds.
> - User cannot log in until email is verified. Login attempt shows "Please verify your email" message.
> - Forgot password flow sends reset link. Link expires after 1 hour. Using an expired link shows clear error with resend option.
> - Authenticated users who visit /login are redirected to /dashboard.
> - Failed login attempts show generic "Invalid credentials" message (do not reveal whether email exists).

## Onboarding

> Example:
> - New user is redirected to /onboarding after first login.
> - Onboarding shows progress indicator with step count.
> - User can skip optional steps without blocking progress.
> - Onboarding state is preserved if user leaves and returns.
> - Completing onboarding redirects to /dashboard and never shows onboarding again.

## Dashboard

> Example:
> - Dashboard loads within 2 seconds on standard connection.
> - Summary row shows correct totals that match underlying data.
> - Empty dashboard shows contextual CTAs (not a blank page).
> - Dashboard data refreshes when user navigates back to it.

## Feature Modules

> Example:
> - Each feature module uses the shared page header component.
> - CRUD operations show success confirmation on completion.
> - Deleting a record shows confirmation dialog before executing.
> - List views support search and are paginated at 25 items.

## Settings

> Example:
> - Profile changes save immediately with success feedback.
> - Workspace settings are only visible to admin/owner roles.
> - Notification preferences persist across sessions.

## Billing

> Example:
> - Current plan and billing period are displayed accurately.
> - Upgrade redirects to Stripe Checkout and returns to /settings/billing on completion.
> - Cancellation shows "Active until [date]" message and does not immediately remove access.
> - Invoice history is accessible and shows PDF download links.

## Admin

> Example:
> - Admin panel is only accessible to admin and owner roles.
> - User list shows all workspace members with roles, status, and last login.
> - Admin actions (suspend, change role) are logged in Admin Record.
> - Admin cannot remove their own admin access.

## Mobile Responsiveness

> Example:
> - All pages render correctly at 375px width (iPhone SE).
> - Sidebar collapses to a hamburger menu on mobile.
> - Tables switch to card layout on screens under 768px.
> - Touch targets are minimum 44x44px.

## Error Handling

> Example:
> - API errors show user-friendly messages, not raw error codes.
> - Network failures show retry option with "Could not connect" message.
> - 404 pages show helpful navigation back to dashboard.
> - Form validation errors appear inline next to the relevant field.
