# 02 Feature Spec

## Feature: Public Intake Form
Purpose: Allow realtors to share a single link that captures structured renter applications.
User action: Realtor shares their `/apply/[slug]` link. Renter fills out a 9-step application (property selection, applicant basics, current living, household, income, rental history, screening, notes, consents).
System output: Application is saved as a Contact record with type=APPLICATION, applicationData JSON, and tags=['application-link', 'new-lead']. AI lead scoring is triggered asynchronously. Contact appears in leads view.
Required in v1: Yes
Dependencies: Space must exist with intake page settings configured.
Key states:
- Loading: Skeleton form while space settings load
- Empty: Not applicable (public form always shows)
- Success: Confirmation page with application status link
- Error: Validation errors inline per step, rate limit error if exceeded

## Feature: AI Lead Scoring
Purpose: Automatically score and categorize incoming leads with explainable context.
User action: None — scoring is triggered automatically when an application is submitted. Realtor views the score in leads view.
System output: OpenAI gpt-4o-mini analyzes application data and produces: numeric score (0-100), priority tier (hot/warm/cold/unqualified), qualification status, readiness status, confidence score, plain-language summary, explanation tags, strengths, weaknesses, risk flags, missing information, and recommended next action. Stored as scoreDetails JSON on Contact.
Required in v1: Yes
Dependencies: OpenAI API key configured.
Key states:
- Loading: "scoring..." indicator in leads view
- Empty: No leads scored yet — scoring triggers automatically when first application arrives via intake link
- Success: Score badge with tier label (Hot 85, Warm 62, Cold 30)
- Error: Scoring fails silently — contact remains with scoringStatus='pending'

## Feature: Leads View
Purpose: Show all intake-sourced leads with AI scores and triage tools.
User action: Realtor views leads sorted by recency. Can see score badges, new-lead indicators, phone, budget, preferences. Clicking a lead navigates to contact detail.
System output: Filtered list of contacts with tags containing 'application-link'. New leads have 'new-lead' tag shown as badge.
Required in v1: Yes
Dependencies: Contacts table, lead scoring
Key states:
- Loading: Skeleton list
- Empty: "No applications yet — share your intake link"
- Success: Lead cards with score badges and time-ago timestamps
- Error: DB error shows retry prompt

## Feature: Contact CRM
Purpose: Full contact management with lifecycle types, activity tracking, and follow-up scheduling.
User action: Create/edit/delete contacts. Add activity notes (note, call, email, meeting, follow_up). Set follow-up dates. View contact detail with all activities.
System output: Contact CRUD with activity log. Contacts have lifecycle types (QUALIFICATION, TOUR, APPLICATION). Follow-up dates surface in dashboard widget.
Required in v1: Yes
Dependencies: Space must exist
Key states:
- Loading: Skeleton table/cards
- Empty: "No contacts yet" with CTA to add first or share intake link
- Success: Contact table with search, type filters, tag filters
- Error: Validation errors on forms, DB errors with retry

## Feature: Deal Pipeline
Purpose: Kanban-style deal tracking with stages, values, and drag-and-drop reordering.
User action: Create deals with title, value, address, priority, close date, linked contacts. Drag deals between stages on Kanban board. Add activities to deals.
System output: Deals organized by custom stages (user-defined colors and positions). Atomic reorder via `reorder_deal` PostgreSQL function. Deal activities tracked.
Required in v1: Yes
Dependencies: DealStage records per space, Contact records for linking
Key states:
- Loading: Skeleton Kanban columns
- Empty: "No deals yet" with CTA to create first deal
- Success: Kanban board with draggable cards, stage headers with counts and values
- Error: Reorder conflicts handled gracefully

## Feature: Tour Scheduling
Purpose: Let realtors manage property tours with public booking pages and calendar management.
User action: Realtor configures tour settings (duration, hours, days, buffer). Prospects book via `/book/[slug]`. Realtor views/manages tours in tours view. Can create tours manually.
System output: Tours created with guest info, property address, time slot. Property profiles for different locations. Availability overrides and blocked dates. Waitlist for full slots. Tour confirmation/management emails via Resend. Optional Google Calendar sync.
Required in v1: Yes
Dependencies: Space settings for tour config, optional Google Calendar token
Key states:
- Loading: Skeleton calendar/list
- Empty: "No upcoming tours" with link to tour settings
- Success: Tour list with status badges (scheduled, confirmed, completed, cancelled, no_show)
- Error: Double-booking prevented, time slot conflicts shown

## Feature: AI Assistant (Chip)
Purpose: Conversational AI assistant with RAG context over the realtor's contacts and deals.
User action: Realtor chats with Chip at `/s/[slug]/ai`. Can ask about leads, get follow-up suggestions, analyze pipeline.
System output: AI responses using conversation history + RAG context from DocumentEmbedding table (vector similarity search). Conversations persisted with titles.
Required in v1: Yes
Dependencies: OpenAI API key, DocumentEmbedding records
Key states:
- Loading: Typing indicator
- Empty: Welcome message with suggested prompts
- Success: Chat interface with message history
- Error: API failure shows friendly error with retry

## Feature: Analytics Dashboard
Purpose: Show key business metrics — lead volume, conversion rates, pipeline health.
User action: Realtor views analytics at `/s/[slug]/analytics`. Charts and metrics auto-populated from CRM data.
System output: Visualizations of lead flow, deal pipeline value, conversion metrics over time.
Required in v1: Yes
Dependencies: Contact and Deal data
Key states:
- Loading: Skeleton charts
- Empty: "Not enough data yet" with explanation
- Success: Charts with Recharts
- Error: Data fetch failure with retry

## Feature: Broker Portal
Purpose: Allow brokerage owners/managers to oversee their realtors and manage the brokerage.
User action: Broker logs in and accesses `/broker`. Views realtors, their spaces, and performance. Manages members, sends invitations, configures brokerage settings.
System output: Brokerage dashboard with member list, invitation management, realtor detail views. Join codes for self-service joining. Broker notifications.
Required in v1: Yes
Dependencies: Brokerage, BrokerageMembership records
Key states:
- Loading: Skeleton dashboard
- Empty: "No realtors yet — send invitations"
- Success: Member list with roles, invitation list with statuses
- Error: Permission denied for non-brokers

## Feature: Admin Panel
Purpose: Platform-level administration for managing users and brokerages.
User action: Admin accesses `/admin`. Views all users, brokerages, invitations. Can view individual user and brokerage details.
System output: User list with account types, onboarding status. Brokerage list with owners, status, member counts. Invitation management.
Required in v1: Yes
Dependencies: Platform admin role
Key states:
- Loading: Skeleton tables
- Empty: Not applicable (there will always be at least one user)
- Success: Paginated user/brokerage tables
- Error: Permission denied redirects to /dashboard

## Feature: Workspace Settings & Billing
Purpose: Configure workspace, profile, intake page, tour settings, AI personalization, and billing.
User action: Realtor configures settings at `/s/[slug]/settings` and `/s/[slug]/configure`. Profile at `/s/[slug]/profile`. Billing at `/s/[slug]/billing`.
System output: Settings saved to SpaceSetting record. Profile updates to User record. Billing page shows subscription status.
Required in v1: Yes
Dependencies: Space and SpaceSetting records
Key states:
- Loading: Skeleton form
- Empty: Not applicable — settings page always renders with default values pre-filled
- Success: Settings saved with toast confirmation
- Error: Validation errors inline

## Feature: Marketing Pages
Purpose: Public-facing pages to acquire and convert visitors.
User action: Visitor browses pricing, features, FAQ, legal pages.
System output: Static marketing content with CTAs to sign up.
Required in v1: Yes
Dependencies: None
Key states:
- Loading: Not applicable (static/SSR)
- Success: Rendered pages with navigation
- Error: Static pages — server render failure returns Next.js default 500 page
