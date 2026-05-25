# 17 Error State Taxonomy

> **TL;DR:** Defines every error type a SaaS product encounters (validation, auth, network, timeout, billing, 500, etc.) with exact UI treatment, retry behavior, escalation patterns, logging policy, and accessibility requirements.
> **Covers:** 12 error types, display component mapping, retry behavior, escalation patterns, error boundaries, accessibility, error message guidelines, logging | **Depends on:** 10, 12 | **Used by:** 09 | **Phase:** 9, 14

## Purpose

Define every error state a SaaS product encounters and exactly how it should be handled in the UI. This file is the single source of truth for error presentation, retry behavior, logging policy, and admin visibility. When Claude builds any feature, it must consult this file to determine how failures surface to users.

This file references `12_internal_component_specs.md` for alert banner, toast, and error block component specs, and `10_design_tokens_internal.md` for status-error color tokens (status-error: #EF4444, status-error-bg: #FEF2F2, border-error: #EF4444).

---

## Error Type Definitions

### 1. Client-Side Validation Errors

- **Where**: Forms (signup, settings, entity creation/edit)
- **What user sees**: Inline red text below the invalid field, field border turns status-error (border-error token)
- **Actions offered**: Fix the field and resubmit
- **Retryable**: Yes (user fixes input)
- **Logged**: No
- **Admin visible**: No
- **Blocks progress**: Yes (form cannot submit)
- **UX pattern**: Validate on blur for the first pass, then on change after the first error is shown. Error text (text-xs, status-error) replaces helper text — never show both simultaneously. On submit attempt with errors present, scroll to the first invalid field and set focus. Submit button remains enabled but the form does not submit until all errors are resolved.

---

### 2. Server Validation Errors (422)

- **Where**: Form submissions that pass client validation but fail server checks (duplicate email, business rule violation, uniqueness constraint)
- **What user sees**: Form-level error banner (alert banner, error variant) above the submit button, plus inline field errors where the server response maps to specific fields
- **Actions offered**: Fix the issue and resubmit
- **Retryable**: Yes (user changes input)
- **Logged**: No (expected behavior)
- **Admin visible**: No
- **Blocks progress**: Yes
- **UX pattern**: Parse the server error response body. Map field-level errors to inline messages using the same inline validation component (text-xs, status-error, below the field). For errors that do not map to a specific field, display them in the form-level alert banner. Re-enable the submit button after the server responds. Scroll to the first error if it is above the viewport.

---

### 3. Authentication Failures (401)

- **Where**: Any API call that returns 401, session expiry, token refresh failure
- **What user sees**: Redirect to login page with message "Your session has expired. Please sign in again."
- **Actions offered**: Sign in again. Preserve the intended destination URL for redirect after successful login.
- **Retryable**: Yes (re-authenticate)
- **Logged**: Yes (security monitoring)
- **Admin visible**: Yes (unusual 401 patterns may indicate credential stuffing or session hijacking)
- **Blocks progress**: Yes (cannot proceed without auth)
- **UX pattern**: Clear all local auth state (tokens, cached user data). Redirect to `/login?redirect=/original-path`. On the login page, show an info-level toast (info variant from `12_internal_component_specs.md`) with the session expiry message. After successful re-authentication, redirect to the preserved path. Do not show the 401 error on the page where it occurred — the redirect happens immediately.

---

### 4. Authorization Failures (403)

- **Where**: Accessing a route or resource the user's role does not permit
- **What user sees**: "You don't have permission to access this page" with the user's current role displayed
- **Actions offered**: "Go to dashboard" button (primary). If the user is in a team context, also show a "Contact your admin" link (text-link style).
- **Retryable**: No (unless the user's role changes)
- **Logged**: Yes (may indicate permission misconfiguration or deliberate probing)
- **Admin visible**: Yes
- **Blocks progress**: Yes
- **UX pattern**: Full page error state rendered in the main content area. The app shell (sidebar, topbar) remains visible — this is not a blank page. Use the empty state layout pattern (centered icon, heading, description, CTA) but with a lock or shield icon at 64px, text-tertiary. Never reveal what the forbidden resource contains or why it exists. The heading should be factual, not apologetic.

---

### 5. Network Failures

- **Where**: Any API call when the device is offline or the server is unreachable
- **What user sees**: Toast notification (warning variant) — "Connection lost. Checking..." with an auto-retry spinner indicator
- **Actions offered**: "Retry now" button in the toast. If persistent (3+ consecutive failures), escalate to a page-level alert banner (warning variant) — "Unable to connect. Check your connection and try again."
- **Retryable**: Yes (automatic retry with exponential backoff: 2s, 4s, 8s, capped at 30s)
- **Logged**: No (client-side only)
- **Admin visible**: No
- **Blocks progress**: Partial (users can view cached/already-loaded data, but cannot submit forms or trigger mutations)
- **UX pattern**: Use optimistic UI for content already in memory. Disable all submit and action buttons while offline. Show a subtle offline indicator in the topbar (small dot or icon, status-warning color). When the connection is restored, dismiss the banner/toast automatically, re-enable buttons, and replay any queued read requests. Do not replay write requests automatically — let the user re-trigger those.

---

### 6. Timeout Errors

- **Where**: Long-running API calls (report generation, bulk operations, data exports, complex queries)
- **What user sees**: "This is taking longer than expected" message after 10 seconds of waiting, then "Request timed out" after 30 seconds
- **Actions offered**: "Try again" button. For report-type operations: "We'll email you when it's ready" as a secondary option.
- **Retryable**: Yes (but if the same operation times out twice, suggest reducing scope — e.g., shorter date range, fewer records)
- **Logged**: Yes (performance monitoring)
- **Admin visible**: Yes (indicates infrastructure or query performance issues)
- **Blocks progress**: Yes for the specific operation
- **UX pattern**: Show a progress indicator (spinner or progress bar if percentage is available) during the wait phase. After 10s, swap to a reassuring in-place message. After 30s, replace with the timeout error block. Do not show a generic "Something went wrong" — explicitly acknowledge the timeout. The rest of the page remains interactive. For operations that support async processing, offer the email notification fallback immediately at the 10s mark.

---

### 7. Empty States

> Not technically errors, but part of the state taxonomy because every data view must handle zero-item conditions intentionally.

- **Where**: Any data view with zero items (tables, lists, card grids, dashboards)
- **What user sees**: Specific empty state with icon, heading, description, and CTA (per empty state component in `12_internal_component_specs.md`)
- **Actions offered**: Primary action to create the first item (e.g., "Create your first invoice")
- **Retryable**: N/A
- **Logged**: No
- **Admin visible**: No
- **Blocks progress**: No
- **UX pattern**: Always use specific copy ("No invoices yet" not "No data found"). Always include a CTA button (primary style). The page shell, header, and filter bar remain visible — only the content area shows the empty state. Use a muted icon (64px, text-tertiary) relevant to the entity type. Center the empty state component horizontally and vertically in the content area. Max-width 400px.

---

### 8. Partial Success States

- **Where**: Bulk operations, multi-step processes, batch imports, multi-recipient sends
- **What user sees**: "Completed 45 of 50 items. 5 items failed." with an expandable detail section listing each failed item and its reason
- **Actions offered**: "Retry failed items" button (primary), "Download error report" link (text-link), "Continue" button (secondary/ghost) to dismiss
- **Retryable**: Yes (retry the failed subset only, not the entire batch)
- **Logged**: Yes
- **Admin visible**: Yes (if failures are system-caused rather than data-caused)
- **Blocks progress**: No (successful items proceed normally)
- **UX pattern**: Show a success toast for the completed items and a warning-variant alert banner for the failures. The banner includes a summary count and an expand/collapse toggle to reveal per-item error details. Each failed item shows the item identifier and a human-readable reason. Never silently drop failures. If all items fail, treat it as a full error (error-variant alert banner), not a partial success.

---

### 9. Third-Party Integration Failures

- **Where**: Integration sync, OAuth callback, webhook delivery, external API calls (payment processor, email service, CRM, etc.)
- **What user sees**: Integration status card (per `12_internal_component_specs.md`) shows "Disconnected" or "Error" badge with the last successful sync timestamp
- **Actions offered**: "Reconnect" button (triggers re-OAuth flow), "Retry sync" button, "View error details" link
- **Retryable**: Yes (reconnect or retry sync)
- **Logged**: Yes (integration health monitoring)
- **Admin visible**: Yes (integration health dashboard)
- **Blocks progress**: Partial (features that depend on the integration are degraded, but the core product continues to work)
- **UX pattern**: Show integration health on the settings/integrations page using status cards. On pages that depend on the broken integration, show a warning-variant alert banner explaining the degraded state ("Slack notifications are temporarily unavailable"). Never block the entire application because one integration is down. Show the last successful sync time so users know how stale the data might be.

---

### 10. Background Job Failures

- **Where**: Async operations (PDF generation, data migration, scheduled tasks, webhook retries, email sends)
- **What user sees**: Job status shows "Failed" in the relevant UI context (export history table, job queue, activity log)
- **Actions offered**: "Retry" button, "View details" link showing the error reason in human-readable form
- **Retryable**: Yes (manual retry button, or automatic retry with backoff for transient errors — up to 3 automatic attempts)
- **Logged**: Yes
- **Admin visible**: Yes (job monitoring dashboard)
- **Blocks progress**: No (background jobs are async by definition)
- **UX pattern**: If the user initiated the job, deliver a status update via toast notification when the job fails. If the job is a system-level task (scheduled sync, webhook retry), log the failure silently and surface it in the admin monitoring dashboard. Use a status badge (error variant) in job list tables. Never show raw error messages, stack traces, or technical details to non-admin users. Admin users may see additional technical context in the detail view.

---

### 11. Billing Failures

- **Where**: Payment processing, subscription changes, plan upgrades/downgrades, invoice generation
- **What user sees**: Billing page shows a persistent error-variant alert banner with the reason ("Your card was declined", "Your card ending in 4242 has expired")
- **Actions offered**: "Update payment method" button (primary), "Retry payment" button (secondary)
- **Retryable**: Yes (after updating payment method)
- **Logged**: Yes (billing audit trail)
- **Admin visible**: Yes (admin can see billing status per account)
- **Blocks progress**: Depends on grace period policy. Show the warning immediately. Restrict features only after the grace period expires.
- **UX pattern**: On the billing page, show an error-variant alert banner with the specific failure reason and action buttons. During the grace period, show a persistent warning-variant alert banner across all pages (below the topbar, above page content) with a countdown: "Your payment failed. Update your payment method within X days to avoid service interruption." After the grace period expires, restrict the account to read-only mode or show an upgrade/payment wall. Never delete user data due to billing failure. Admin users can see billing status for all accounts in the admin panel.

---

### 12. Unknown/System Errors (500)

- **Where**: Any API call that returns 500 or an unhandled exception
- **What user sees**: "Something went wrong. Our team has been notified." with an error reference ID displayed
- **Actions offered**: "Try again" button, "Contact support" link with the error reference ID pre-filled in the support form
- **Retryable**: Yes (single retry attempt, then suggest contacting support if it fails again)
- **Logged**: Yes (critical — triggers an alert to the engineering team)
- **Admin visible**: Yes (error monitoring dashboard)
- **Blocks progress**: Yes for the specific action that failed
- **UX pattern**: Never show stack traces, raw error messages, or technical details to users. Generate a unique reference ID (format: `ERR-YYYY-MM-XXXX` where XXXX is a random alphanumeric string). Log the full error details server-side, keyed to this reference ID. Display the error using an error block component in place of the expected content, or as an error-variant toast if the failure was a background action. The message should be empathetic but brief — do not over-apologize. Include the reference ID visibly so users can quote it in support requests.

---

## Error Display Component Mapping

This table maps each error type to its display component and placement. Reference `12_internal_component_specs.md` for the full component specs.

| Error Type | Display Component | Placement |
|---|---|---|
| Client validation | Inline field error (text-xs, status-error) | Below the invalid field |
| Server validation (422) | Inline field error + alert banner (error variant) | Below fields + above submit button |
| Auth failure (401) | Page redirect + toast (info variant) | Login page |
| Auth failure (403) | Full page error state | Main content area (shell visible) |
| Network failure | Toast (warning variant) escalating to alert banner | Top-right toast, then top of content area |
| Timeout | Inline loading indicator transitioning to error block | In place of expected content |
| Empty state | Empty state component | Main content area (centered) |
| Partial success | Alert banner (warning variant) + expandable detail list | Top of content area |
| Integration failure | Status card (error state) + alert banner (warning variant) | Settings page + dependent feature pages |
| Background job failure | Status badge (error variant) + toast | Job list table + notification area |
| Billing failure | Alert banner (error variant, persistent) | Billing page + global (below topbar) |
| System error (500) | Error block or toast (error variant) | In place of content or top-right |

---

## Error Token Reference

All error-related visual tokens from `10_design_tokens_internal.md`:

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| status-error | #EF4444 | #F87171 | Error text, error icons, error badges, destructive actions |
| status-error-bg | #FEF2F2 | #450A0A | Error alert banner background, error badge background |
| border-error | #EF4444 | #F87171 | Input border in error state |
| status-warning | #F59E0B | #FBBF24 | Warning banners, degraded state indicators |
| status-warning-bg | #FFFBEB | #422006 | Warning alert banner background |
| status-info | #3B82F6 | #60A5FA | Info toasts, session expiry messages |
| status-info-bg | #EFF6FF | #172554 | Info alert banner background |

---

## Error Hierarchy Rules

These rules govern how errors are prioritized and displayed when multiple error conditions exist simultaneously.

1. **Show the most specific error possible.** Field-level errors take priority over form-level errors. Form-level errors take priority over page-level errors. Page-level errors take priority over global banners.
2. **Never show multiple error patterns for the same failure.** One failure produces one error display. If a 422 response includes both field errors and a general message, show the field errors inline and the general message in the form banner — but do not also show a toast.
3. **Retryable errors must always offer a retry action.** A button, a link, or clear instructions on what to change. Never show an error without a next step.
4. **Non-retryable errors must explain why and offer an alternative.** If the user cannot fix the problem, tell them what they can do instead (go to dashboard, contact admin, contact support).
5. **Never show raw API responses, HTTP status codes, or stack traces to end users.** Translate every technical error into a human-readable message. Status codes and technical details belong in logs, not in the UI.
6. **Always provide a next step.** Never leave the user at a dead end. Every error state must include at least one actionable element — a button, a link, or a clear instruction.
7. **Degrade gracefully.** When a subsystem fails (integration, background job, billing), the rest of the product should continue to function. Isolate failures to the smallest possible scope.
8. **Respect the component system.** All error displays must use the components defined in `12_internal_component_specs.md` — alert banners, toasts, inline validation, empty states, error blocks. Do not invent new error display patterns.

---

## Error Message Writing Guidelines

| Principle | Good Example | Bad Example |
|---|---|---|
| Be specific | "That email is already registered" | "Invalid input" |
| Be brief | "Card declined. Try a different payment method." | "We're sorry, but it appears that your payment could not be processed at this time." |
| State what happened | "Export timed out" | "Error" |
| State what to do next | "Try again with a shorter date range" | "Please try again later" |
| Use plain language | "You don't have permission to view this page" | "403 Forbidden" |
| Do not blame the user | "That password is too short" | "You entered an invalid password" |
| Do not over-apologize | "Something went wrong. Our team has been notified." | "We're so sorry! Something terrible happened!" |

---

## Retry Behavior Summary

| Error Type | Auto-Retry | Manual Retry | Max Attempts | Backoff |
|---|---|---|---|---|
| Client validation | No | User fixes input | Unlimited | N/A |
| Server validation (422) | No | User fixes input | Unlimited | N/A |
| Auth failure (401) | No | Re-authenticate | 1 (then redirect) | N/A |
| Auth failure (403) | No | No | N/A | N/A |
| Network failure | Yes | Yes (button) | 5 auto, unlimited manual | Exponential: 2s, 4s, 8s, 16s, 30s cap |
| Timeout | No | Yes (button) | 2 manual, then suggest alternative | N/A |
| Empty state | N/A | N/A | N/A | N/A |
| Partial success | No | Yes (failed subset) | 1 manual | N/A |
| Integration failure | Yes (sync) | Yes (reconnect) | 3 auto | Exponential: 5s, 30s, 300s |
| Background job | Yes (transient) | Yes (button) | 3 auto | Exponential: 10s, 60s, 300s |
| Billing failure | No | Yes (after update) | 1 manual | N/A |
| System error (500) | No | Yes (button) | 1 manual, then support | N/A |

---

## Error State Escalation Patterns

Some errors escalate from one display pattern to another based on duration or frequency. These escalation paths must be implemented consistently.

### Network Failure Escalation

```
First failure     → Warning toast with auto-retry indicator
                     ↓ (retry fails)
Second failure    → Toast persists, retry timer shown (4s)
                     ↓ (retry fails)
Third failure     → Toast dismissed, page-level warning alert banner appears
                     "Unable to connect. Check your connection and try again."
                     ↓ (user clicks retry or connection restores)
Recovery          → Banner dismissed automatically, success toast shown briefly
```

### Billing Failure Escalation

```
Payment fails     → Error alert banner on billing page only
                     ↓ (1 day after failure)
Grace period      → Persistent warning banner on ALL pages
                     "Payment failed. X days remaining to update your method."
                     ↓ (grace period expires)
Account restricted → Full-page payment wall on feature pages
                     Billing page remains accessible
                     Read-only access to existing data
                     ↓ (payment succeeds)
Recovery          → All restrictions lifted, success toast shown
```

### Timeout Escalation

```
Request starts    → Loading spinner or progress indicator
                     ↓ (10 seconds)
Slow warning      → In-place message: "This is taking longer than expected..."
                     For async-capable operations: "We'll email you when it's ready" link
                     ↓ (30 seconds)
Timeout           → Error block replaces loading state
                     "Request timed out" with "Try again" button
                     ↓ (second timeout on retry)
Repeated timeout  → Same error block with additional guidance
                     "Try a shorter date range or fewer items"
```

---

## Global Error Boundary Behavior

Every page in the application must be wrapped in an error boundary that catches unhandled JavaScript exceptions.

### What the error boundary catches

- Unhandled promise rejections in render
- Exceptions thrown during component rendering
- Errors in event handlers that propagate to the boundary

### What the error boundary displays

- The app shell (sidebar, topbar) remains visible and functional
- The main content area shows an error block component with:
  - Heading: "This page encountered an error"
  - Description: "Try refreshing the page. If the problem continues, contact support."
  - Actions: "Refresh page" button (primary), "Go to dashboard" button (secondary)
  - Error reference ID displayed in text-xs, text-tertiary below the actions

### Error boundary rules

- Never show a completely blank white page
- Never crash the entire application for a single page error
- Always preserve navigation so the user can move to a working page
- Log the error with full stack trace to the server-side error monitoring system
- Each error boundary instance generates a unique reference ID

---

## Accessibility Requirements for Error States

All error states must meet WCAG 2.1 AA accessibility standards.

### Form validation errors

- Error messages must be associated with their field using `aria-describedby`
- Invalid fields must have `aria-invalid="true"`
- Error summary (if present) must be announced via `role="alert"` or `aria-live="assertive"`
- Focus must move to the first invalid field on form submission failure
- Error text must have sufficient color contrast (status-error on white meets 4.5:1 ratio)

### Toast notifications

- Toasts must use `role="status"` and `aria-live="polite"` for informational messages
- Error toasts must use `role="alert"` and `aria-live="assertive"`
- Toast dismiss button must be keyboard accessible
- Auto-dismiss timer must pause when the toast receives focus or hover

### Alert banners

- Alert banners must use `role="alert"` for error and warning variants
- Info-level banners use `role="status"`
- Dismiss button must have an accessible label ("Dismiss alert")
- Banner content must not rely on color alone — the icon provides a secondary indicator

### Full-page error states

- The error heading must be the first focusable content in the main area
- Action buttons must have clear, descriptive labels (not just "Click here")
- Screen readers must announce the error state when the page loads or when the error appears

---

## Error Logging and Monitoring Reference

This section defines what gets logged for each error type, for use when implementing server-side error handling.

| Error Type | Log Level | Includes User ID | Includes Request Data | Alert Trigger |
|---|---|---|---|---|
| Client validation | Not logged | N/A | N/A | None |
| Server validation (422) | Not logged | N/A | N/A | None |
| Auth failure (401) | WARN | Yes | Request path, IP | 10+ per minute from same IP |
| Auth failure (403) | WARN | Yes | Request path, role | 5+ per minute from same user |
| Network failure | Not logged | N/A | N/A | None |
| Timeout | WARN | Yes | Request path, duration | 5+ per hour on same endpoint |
| Empty state | Not logged | N/A | N/A | None |
| Partial success | INFO | Yes | Operation ID, failed items | Failure rate > 50% |
| Integration failure | ERROR | No (system) | Integration name, error code | Any occurrence |
| Background job | ERROR | No (system) | Job ID, job type, error | 3+ failures for same job |
| Billing failure | ERROR | Yes | Subscription ID, failure reason | Any occurrence |
| System error (500) | CRITICAL | Yes | Full request context, stack trace | Any occurrence |

---

## Implementation Checklist

When building any feature, verify that these error states are accounted for:

- [ ] All form fields have client-side validation with inline error messages
- [ ] Server validation errors (422) are parsed and mapped to fields or shown in a form banner
- [ ] API calls handle 401 by clearing auth state and redirecting to login
- [ ] Route guards handle 403 with a full-page permission error
- [ ] Network failure is detected and surfaces a toast with retry
- [ ] Long-running operations show a timeout message after 10s and error after 30s
- [ ] Every data view has a specific empty state with a CTA
- [ ] Bulk operations report partial success with per-item failure details
- [ ] Integration-dependent features show degraded state banners when integrations fail
- [ ] Background job failures are surfaced in the relevant UI with retry option
- [ ] Billing failures show persistent banners with grace period countdown
- [ ] Unknown 500 errors generate a reference ID and show a clean error message
- [ ] No raw status codes, stack traces, or technical jargon appear in any user-facing error
- [ ] All error messages are associated with their fields via aria-describedby
- [ ] Error boundaries wrap every page to prevent full-app crashes
- [ ] Escalation patterns are implemented for network, billing, and timeout errors

---

## Final Principle

Error handling is product quality. Every error state should feel intentional, not accidental. Users should always know what went wrong, whether they can fix it, and what to do next. A product that handles errors well earns more trust than a product that simply avoids showing them.
