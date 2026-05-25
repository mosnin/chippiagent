# 08 QA Checklist

## Auth
- [ ] Clerk sign-up creates account and User row in Supabase
- [ ] Clerk sign-in works with valid credentials
- [ ] Sign-in fails gracefully with invalid credentials
- [ ] OAuth flow works (Google, etc.)
- [ ] Logout clears Clerk session and redirects to /
- [ ] Forgot password flow sends reset email via Clerk
- [ ] Password reset link works and expires correctly

## Redirects
- [ ] Unauthenticated user visiting /dashboard → redirected to /
- [ ] Unauthenticated user visiting /s/[slug] → redirected to /
- [ ] Authenticated user visiting /sign-in → redirected to /
- [ ] Authenticated user visiting /sign-up → redirected to /
- [ ] Non-admin visiting /admin → redirected to /dashboard
- [ ] Broker-only user visiting /dashboard → redirected to /broker
- [ ] User visiting /s/[other-user-slug] → 404
- [ ] Deep links preserve intended destination after login

## Onboarding
- [ ] New user (no space) sees OnboardingFlow at /
- [ ] Onboarding progress tracked via onboardingCurrentStep
- [ ] Completing onboarding creates Space and redirects to /s/[slug]
- [ ] Returning completed user never sees onboarding again
- [ ] Legacy backfill works (space exists but onboard=false)

## Dashboard
- [ ] Loads with correct data for the current space
- [ ] Summary metrics (new apps, total leads, clients, deals, tours, follow-ups) are accurate
- [ ] Intake link card shows correct URL with copy/preview
- [ ] Tour booking link card shows correct URL with copy/preview
- [ ] Recent applications list shows latest leads with score badges
- [ ] Pipeline card shows stages with counts and values
- [ ] Follow-up widget shows past-due contacts
- [ ] Upcoming tours widget shows next tours
- [ ] Empty states show when no data exists
- [ ] Loading skeleton appears while data fetches

## Leads
- [ ] Leads view shows intake-sourced contacts
- [ ] New-lead badges appear on unread leads
- [ ] AI score badges render correctly (Hot/Warm/Cold + number)
- [ ] "scoring..." indicator shows for pending scores
- [ ] Lead cards show name, phone, budget, time-ago

## Contacts
- [ ] Create contact works with validation
- [ ] Edit contact saves changes
- [ ] Delete contact works (with cascade warning if linked to deals)
- [ ] Activity log: add note, call, email, meeting, follow_up
- [ ] Follow-up date scheduling works
- [ ] Contact list search works
- [ ] Contact type filtering works

## Deals
- [ ] Create deal works with all fields
- [ ] Kanban board renders stages with correct deals
- [ ] Drag-and-drop between stages works (atomic reorder)
- [ ] Deal detail shows activities and linked contacts
- [ ] Custom stage creation works (name, color, position)

## Tours
- [ ] Public booking page at /book/[slug] loads correctly
- [ ] Available slots respect tour hours, days, and buffer
- [ ] Booking creates Tour record with correct data
- [ ] Tour status badges display correctly
- [ ] Blocked dates not shown as available
- [ ] Availability overrides work
- [ ] Waitlist captures when no slots available
- [ ] Tour management via manage token works

## AI Assistant
- [ ] Chat interface sends and receives messages
- [ ] Conversation history persists across page navigations
- [ ] RAG context retrieves relevant contacts/deals
- [ ] API errors show user-friendly message
- [ ] New conversation can be started

## Settings
- [ ] Workspace settings save with toast confirmation
- [ ] Profile updates save correctly
- [ ] Configure page: intake title/intro save
- [ ] Configure page: tour settings save
- [ ] Billing page displays subscription status
- [ ] Workspace settings restricted to space owner
- [ ] Notification preferences persist across sessions
- [ ] Security settings (password change via Clerk) work correctly

## Permissions
- [ ] Each role (Platform Admin, Broker Owner, Broker Manager, Realtor Member, Solo Realtor) can only access their permitted routes
- [ ] Sidebar hides links the user cannot access based on role
- [ ] API endpoints enforce role checks (not just UI visibility)
- [ ] Role changes take effect without requiring re-login
- [ ] Space-scoped routes filter data by spaceId

## Billing
- [ ] Current plan displays accurately with billing period
- [ ] Upgrade flow completes via Stripe Checkout and returns correctly
- [ ] Downgrade/cancel shows correct messaging and grace period
- [ ] Stripe webhook updates subscription status in real time
- [ ] Invoice history accessible with download links
- [ ] 7-day trial countdown displays correctly and converts on expiry

## Broker Portal
- [ ] Broker dashboard loads for broker_owner/broker_admin
- [ ] Realtors list shows brokerage members
- [ ] Invitation send works
- [ ] Invitation accept via /invite/[token] works
- [ ] Join via /join/[code] works
- [ ] Non-brokers cannot access /broker

## Admin
- [ ] Admin panel only visible to platformRole='admin'
- [ ] User list shows all users with details
- [ ] Brokerage list shows all brokerages with details
- [ ] Individual user detail page works
- [ ] Individual brokerage detail page works
- [ ] Non-admin redirected to /dashboard
- [ ] Admin actions are logged to AuditLog
- [ ] Admin cannot remove their own platform admin access

## Empty States
- [ ] Dashboard empty state: intake link card always shown, prompts for no leads/deals/tours
- [ ] Leads: "No applications yet — share your intake link"
- [ ] Contacts: "No contacts yet" with CTA
- [ ] Deals: "No deals yet" with CTA
- [ ] Tours: "No upcoming tours" with settings link
- [ ] Analytics: "Not enough data yet"

## Error States
- [ ] Supabase errors show "Something went wrong" with retry
- [ ] Never show raw error messages to users
- [ ] Form validation errors appear inline
- [ ] 404 page exists and is helpful
- [ ] Rate limit errors show appropriate message
- [ ] 500 page exists with support contact info

## Mobile
- [ ] All pages render at 375px width without horizontal scroll
- [ ] Sidebar hidden — mobile bottom nav shows
- [ ] Dashboard cards stack vertically
- [ ] Kanban board horizontally scrollable on mobile
- [ ] Tables adapt to card layout on small screens
- [ ] Touch targets meet 44x44px minimum
- [ ] Forms usable with mobile keyboard

## Dark Mode
- [ ] All authenticated pages render correctly in dark mode
- [ ] No white flashes on navigation (inline script in head)
- [ ] Main content area in /s/[slug] uses `bg-white text-gray-900` — verify dark mode behavior
- [ ] Form inputs and borders have sufficient contrast in dark mode
- [ ] Score badges (hot/warm/cold) visible in both modes
- [ ] Public pages (pricing, features, FAQ) render in dark mode
