# 07 Acceptance Criteria

## Auth

- User can sign up via Clerk (email/password or OAuth). User row created in Supabase.
- Authenticated users visiting /sign-in or /sign-up are redirected to /.
- Unauthenticated users visiting protected routes (/dashboard, /s/*, /admin, /broker) are redirected to /.
- Non-admin users visiting /admin are redirected to /dashboard.
- Broker-only users visiting /dashboard are redirected to /broker.
- Logout clears Clerk session.

## Onboarding

- New user (no space) sees OnboardingFlow at / after sign-in.
- Onboarding tracks progress via User.onboardingCurrentStep.
- Completing onboarding creates Space and sets User.onboard = true.
- Completed user visiting / is redirected to /s/[slug] via /dashboard.
- Legacy backfill: users with spaces but onboard=false get auto-corrected.

## Dashboard

- Dashboard at /s/[slug] loads within 2 seconds.
- Summary stats (new applications, total leads, clients, active deals, upcoming tours, follow-ups due) are accurate and match underlying data.
- Intake link card shows shareable URL with copy and preview buttons.
- Tour booking link card shows shareable URL with copy and preview buttons.
- Recent applications list shows latest 5 intake-sourced leads with score badges.
- Pipeline card shows deal stages with counts and values.
- Follow-up widget shows contacts with past-due follow-up dates.
- Upcoming tours widget shows next 4 scheduled/confirmed tours.
- Empty states show helpful CTAs (not blank sections).

## Leads

- Leads view shows all contacts with 'application-link' tag.
- New leads have 'new-lead' tag badge visible.
- AI scores display as colored badges (Hot/Warm/Cold) with numeric score.
- Leads in 'scoring...' state show loading indicator.
- Lead cards show name, phone, budget, preferences, time-ago timestamp.

## Contacts

- Contact CRUD works: create, read, update, delete.
- Contact detail shows all fields, activity log, and linked deals.
- Activity types: note, call, email, meeting, follow_up.
- Follow-up dates can be set and appear in dashboard widget.
- Contacts have lifecycle types: QUALIFICATION, TOUR, APPLICATION.
- Contact list supports search and filtering.

## Deals

- Deal pipeline shows as Kanban board with custom stages.
- Deals can be created with title, value, address, priority, close date.
- Drag-and-drop reordering moves deals between stages atomically.
- Deal detail shows activities, linked contacts, and metadata.
- Deal stages are customizable per space (name, color, position).

## Tours

- Tour booking page at /book/[slug] shows available time slots.
- Prospects can book tours with name, email, phone, notes.
- Buffer minutes between tours are enforced.
- Availability overrides and blocked dates work correctly.
- Tour statuses: scheduled, confirmed, completed, cancelled, no_show.
- Tour manage token allows guests to modify/cancel.
- Waitlist captures prospects when no slots available.

## AI Assistant

- Chat interface at /s/[slug]/ai maintains conversation history.
- RAG context pulls relevant contacts/deals via vector similarity.
- Conversations are persisted and can be revisited.
- API failures show friendly error with retry.

## Settings

- Workspace settings save to SpaceSetting record with toast confirmation.
- Profile updates save to User record.
- Configure page manages intake page title/intro, tour settings, AI personalization.
- Billing page shows subscription status.

## Billing

- Current plan and billing period are displayed accurately on billing page.
- Upgrade redirects to Stripe Checkout and returns to settings/billing on completion.
- Cancellation shows "Active until [date]" message and does not immediately remove access.
- Invoice history is accessible and shows PDF download links.
- Downgrade or plan change shows confirmation dialog with proration details.
- 7-day free trial displays days remaining and converts automatically.

## Broker Portal

- Broker portal at /broker shows brokerage overview.
- Realtors list shows all members with their spaces.
- Invitation management: send, view status, cancel.
- Join code displayed for self-service joining.
- Non-brokers cannot access /broker routes.

## Admin

- Admin panel at /admin only accessible to platform admins.
- User list shows all users with account type, onboarding status.
- Brokerage list shows all brokerages with owner, status, member count.
- Individual user/brokerage detail pages work.
- Non-admin redirect to /dashboard.
- Admin actions (suspend account, change role, manage brokerage) are logged in AuditLog.
- Admin cannot remove their own platform admin access.

## Mobile Responsiveness

- All pages render correctly at 375px width without horizontal scroll.
- Sidebar collapses — mobile bottom navigation bar shows.
- Dashboard cards stack vertically on small screens.
- Touch targets are minimum 44x44px.
- Forms are usable with mobile keyboard.

## Error Handling

- Supabase errors show "Something went wrong" UI with retry button.
- Console.error logs details for debugging — never shown to user.
- 404 page exists with helpful navigation.
- Form validation errors appear inline.
- Rate limiting returns appropriate error messages.
