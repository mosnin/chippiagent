# 04 Edge Cases

## Auth Edge Cases

### Edge Case: Clerk webhook fails to create User row
Scenario: User signs up via Clerk but the webhook to create the Supabase User row fails or is delayed.
Expected system behavior: On next page load, `/dashboard` and `/setup` detect missing DB user and show error UI with retry button. Do not redirect loop. Do not show blank page.
Relevant page or module: /dashboard, /setup, /s/[slug] layout

### Edge Case: Authenticated user visits another user's workspace
Scenario: Logged-in user manually navigates to `/s/[other-user-slug]`.
Expected system behavior: Layout checks if user owns the space (dbUser.space.id === space.id). If not, return 404. Never expose another user's data.
Relevant page or module: /s/[slug] layout

### Edge Case: Broker-only user tries to access /dashboard
Scenario: User with accountType='broker_only' navigates to /dashboard.
Expected system behavior: Redirect to /broker. Do not show workspace creation form.
Relevant page or module: /dashboard

## Billing Edge Cases

### Edge Case: Subscription lapses
Scenario: User's subscription expires or payment fails.
Expected system behavior: Billing page shows clear status. User can still access workspace (grace period based on Stripe dunning). Upgrade CTA prominently shown.
Relevant page or module: /s/[slug]/billing

### Edge Case: Trial expiration
Scenario: 7-day free trial expires without subscription.
Expected system behavior: Show trial expired message with subscription CTA. Account paused — no automatic charges.
Relevant page or module: /s/[slug]/billing, dashboard banner

### Edge Case: Payment fails during upgrade
Scenario: User initiates plan upgrade but Stripe payment fails (card declined).
Expected system behavior: User stays on current plan. Show "Payment failed" error with link to update payment method. Do not partially apply the new plan.
Relevant page or module: /s/[slug]/settings (billing tab)

## Product Edge Cases

### Edge Case: Concurrent Kanban drag-and-drop
Scenario: Two browser tabs or a browser and mobile device attempt to reorder deals simultaneously.
Expected system behavior: `reorder_deal` PostgreSQL function runs atomically. Last write wins. No position corruption. UI refreshes to reflect final state.
Relevant page or module: /s/[slug]/deals

### Edge Case: AI scoring fails for a lead
Scenario: OpenAI API returns an error or times out during lead scoring.
Expected system behavior: Contact is created successfully with scoringStatus='pending'. Scoring does not block application submission. Dashboard shows "scoring..." indicator. Retry can be triggered manually or on next load.
Relevant page or module: /s/[slug]/leads, API route

### Edge Case: Duplicate application submission
Scenario: Renter submits the same application form twice (double-click, refresh).
Expected system behavior: Rate limiting prevents rapid duplicate submissions. If same email exists in space, system should handle gracefully — either update existing contact or create new with dedup note.
Relevant page or module: /apply/[slug], API route

### Edge Case: Tour double-booking
Scenario: Two prospects try to book the same time slot simultaneously.
Expected system behavior: First booking succeeds. Second receives "slot no longer available" error. Buffer minutes between tours enforced. Availability check is authoritative at booking time.
Relevant page or module: /book/[slug], tour API

### Edge Case: Delete contact linked to deals
Scenario: Realtor tries to delete a contact that is linked to one or more deals via DealContact.
Expected system behavior: Show warning about linked deals. DealContact has ON DELETE CASCADE so deletion proceeds but user should be informed. Consider soft-delete or archive in future.
Relevant page or module: /s/[slug]/contacts

## Integration Edge Cases

### Edge Case: Supabase connection failure
Scenario: Supabase is temporarily unavailable.
Expected system behavior: All pages that query DB have try/catch blocks. Error UI shows "Something went wrong" with retry button. Never show raw error to user. Console.error logs details for debugging.
Relevant page or module: All authenticated pages

### Edge Case: Google Calendar token expires
Scenario: Realtor's Google Calendar OAuth token expires.
Expected system behavior: Tour creation works without calendar sync. Calendar sync fails silently. Prompt to reconnect in tour settings.
Relevant page or module: /s/[slug]/tours, tour settings

### Edge Case: OpenAI rate limit exceeded
Scenario: High volume of applications hits OpenAI rate limit.
Expected system behavior: Lead scoring queued with scoringStatus='pending'. Retry with exponential backoff. Applications are never lost — they exist as contacts regardless of scoring status.
Relevant page or module: Lead scoring API

## Data Edge Cases

### Edge Case: Space with no DealStages
Scenario: New workspace has no deal stages configured (default stages not seeded).
Expected system behavior: Deals page shows empty state with prompt to create first stage, or stages are auto-seeded during workspace creation.
Relevant page or module: /s/[slug]/deals

### Edge Case: Very long application data
Scenario: Renter fills in extremely long text in notes or address fields.
Expected system behavior: Input fields have reasonable maxLength. Data truncated at DB level if needed. UI handles long text with truncation and expand/collapse.
Relevant page or module: /apply/[slug], contact detail

### Edge Case: Invitation token used after expiration
Scenario: Realtor clicks an invitation link after the 7-day expiry.
Expected system behavior: Show "Invitation expired" message with prompt to request a new invitation from the broker. Do not auto-accept or create membership.
Relevant page or module: /invite/[token]

### Edge Case: Sole owner deletes account
Scenario: Last remaining Space owner deletes their account.
Expected system behavior: Prevent deletion if user is the sole owner of any Space. Show "Transfer ownership or delete your workspace before deleting your account" prompt. Never allow orphaned Spaces.
Relevant page or module: Account settings, account deletion flow
