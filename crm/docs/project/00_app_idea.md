# 00 App Idea

## App Name

Chippi

## One Sentence Product Definition

Chippi is a real estate CRM for solo realtors that turns a single intake link into qualified, AI-scored renter leads with a clean pipeline for follow-up, tours, and deals.

## Core User

New solo realtors in the U.S. handling renter and leasing leads — early in their career or building a solo practice, needing a fast lightweight way to capture and qualify renter leads without enterprise CRM complexity.

## Core Problem

Solo realtors waste time switching between spreadsheets, email, social DMs, and generic CRMs to capture and qualify renter leads. This leads to missed follow-ups, no lead prioritization, and poor pipeline visibility.

## Core Outcome

Realtors go from sign-up to a live shareable intake link in under 5 minutes. Renter applications flow in, get AI-scored with explainable context (hot/warm/cold + summary), and appear in a clean CRM where the realtor can triage, follow up, schedule tours, and track deals — all from one place.

## First Value Event

Realtor generates their intake link and shares it. The first renter application arrives, is AI-scored, and appears in the leads view with a priority tier and plain-language summary.

## Main Product Workflow

Sign up → Create workspace → Generate intake link → Share link → Renter submits application → AI scores and triages lead → Realtor reviews in leads view → Promotes to contact → Schedules tour → Creates deal → Tracks through pipeline stages.

## Dashboard Definition

Summary stat cards: new applications (unread), total leads, clients in CRM, active deals (total value), upcoming tours, follow-ups due. Below: intake link card (copy/preview), tour booking link card, upcoming tours list, follow-up widget, recent applications list (with score badges), and pipeline stage breakdown by count and value.

## Onboarding Definition

Multi-step inline onboarding flow triggered on first sign-in at `/`. Steps include: account type selection (realtor vs broker), workspace creation (name + emoji), profile basics, and intake link setup. Broker-only users redirect to `/broker`. After completing onboarding, user lands in their workspace at `/s/[slug]`.

## Required Internal Modules

- Analytics (lead volume, conversion rates, pipeline value)
- AI Assistant (chat with RAG context over contacts and deals)
- Tour scheduling (booking links, calendar management, availability)
- Activity Logs (contact and deal activity tracking)
- Notifications (broker notifications for brokerage members)

## Product Specific Features

- Shareable public intake form (`/apply/[slug]`) with 9-step structured renter application
- AI lead scoring using OpenAI gpt-4o-mini with explainable priority tiers (hot/warm/cold/unqualified) and plain-language summaries
- Leads view with score badges, new-lead indicators, and filtering
- Contact CRM with lifecycle types (QUALIFICATION, TOUR, APPLICATION), activity logs, follow-up scheduling
- Deal pipeline with Kanban board, drag-and-drop reordering, stages, values, and close dates
- Tour scheduling with public booking pages (`/book/[slug]`), property profiles, buffer times, availability overrides, waitlist
- AI assistant (Chip) with conversation history and RAG over contacts/deals using vector embeddings
- Broker portal for brokerage owners/managers to oversee realtors, send invitations, manage members
- Public application status page (`/apply/[slug]/status`)

## Product Specific Entities

- User (clerkId, email, name, platformRole, accountType, onboarding state)
- Space (slug, name, emoji, ownerId, brokerageId)
- SpaceSetting (tour config, intake page config, AI personalization, billing, timezone)
- Contact (name, email, phone, budget, preferences, type, tags, leadScore, scoreLabel, scoreSummary, scoreDetails, applicationData, followUpAt)
- Deal (title, value, address, priority, stageId, position, status, closeDate, sourceTourId)
- DealStage (name, color, position per space)
- Tour (guestName, guestEmail, startsAt, endsAt, status, propertyProfileId, manageToken)
- TourPropertyProfile (name, address, duration, hours, days, buffer)
- Conversation / Message (AI chat history per space)
- Brokerage (name, ownerId, status, joinCode)
- BrokerageMembership (brokerageId, userId, role)
- Invitation (brokerageId, email, roleToAssign, token, status)
- DocumentEmbedding (vector embeddings for RAG)
- AuditLog, BrokerNotification, TourAvailabilityOverride, TourWaitlist

## Roles And Permissions

- **Platform Admin** (User.platformRole = 'admin'): Full access to `/admin` panel — user management, brokerage management, invitations, system overview.
- **Broker Owner** (BrokerageMembership.role = 'broker_owner'): Owns a brokerage. Access to `/broker` portal — view realtors, manage members, send invitations, brokerage settings.
- **Broker Manager** (BrokerageMembership.role = 'broker_admin'): Same as broker owner but cannot delete brokerage.
- **Realtor Member** (BrokerageMembership.role = 'realtor_member'): Member of a brokerage. Has their own workspace. Brokerage name shown in sidebar.
- **Realtor (solo)** (default): Own workspace at `/s/[slug]`. Full access to their space — leads, contacts, deals, tours, AI, analytics, settings, billing, profile.

## Integrations Or External Config

- Clerk (authentication, user management, session handling)
- Supabase (PostgreSQL database, RLS)
- OpenAI (lead scoring via gpt-4o-mini, embeddings via text-embedding-3-small, AI assistant)
- Resend (transactional email — tour confirmations, waitlist notifications, broker notifications)
- Upstash Redis (rate limiting)
- Amplitude (product analytics)
- Vercel (hosting, speed insights)
- Google Calendar (tour sync — OAuth tokens stored)

## Admin Requirements

- View all users with their account type, onboarding status, created date
- View individual user details and their space
- View all brokerages with owner, status, member count
- View individual brokerage details and members
- Manage invitations across all brokerages
- Platform admin access enforced at middleware level (Clerk publicMetadata.role or DB User.platformRole)

## V1 Scope

Auth (Clerk), multi-step onboarding, public intake form, AI lead scoring with explainable tiers, leads/contacts/deals CRM, Kanban deal pipeline, tour scheduling with booking pages, AI assistant with RAG, broker portal, analytics dashboard, workspace settings, billing page, admin panel, marketing pages (pricing, features, FAQ, legal). All pages mobile responsive.

## Non Goals

- Multi-currency support
- MLS integration
- Document signing / transaction management
- Email/SMS campaign automation
- Property listing management
- Multi-user workspaces (one space per user currently)
- White-label branding
- Public API
- Team collaboration features beyond brokerage membership

## UX Constraints

- Setup to live intake link must complete in under 5 minutes
- Dashboard should load within 2 seconds
- AI scoring must produce explainable labels (not opaque numbers)
- Mobile must support full read/triage workflow (not just viewing)
- UI tone: modern, calm, product-first — not cluttered or enterprise-y

## Technical Constraints

- Clerk for auth (already integrated deeply)
- Supabase for database (service_role key bypasses RLS)
- Must deploy to Vercel
- No self-hosted infrastructure — all managed services
- OpenAI for lead scoring and embeddings (API key required)

## Success Criteria

- Realtor goes from signup to live intake link in under 5 minutes
- Intake link generates application submissions consistently
- Lead scoring produces meaningful hot/warm/cold triage with explainable summaries
- Realtors return to check and act on leads (retention signal)
- Tour booking flow works end-to-end from public link to CRM
