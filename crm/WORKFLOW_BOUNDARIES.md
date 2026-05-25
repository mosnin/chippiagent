# WORKFLOW_BOUNDARIES.md

Workflow separation guide to prevent accidental cross-system coupling.

This document defines clear boundaries between each major workflow in Chippi. AI agents and contributors must respect these boundaries when making changes.

---

## 1. High-level boundary map

```
┌─────────────────────────────────────────────────────────┐
│                        AUTH                              │
│  Clerk session + middleware route protection             │
│  Boundary: identity/session only, no business state     │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌─────────────┐ ┌───────────┐ ┌──────────────┐
│ ONBOARDING  │ │  PUBLIC    │ │   CRM        │
│             │ │  INTAKE    │ │   WORKSPACE  │
│ User setup  │ │            │ │              │
│ + workspace │ │ Lead       │ │ Leads view   │
│ activation  │ │ ingestion  │ │ Contacts     │
│             │ │            │ │ Deals        │
│             │ │     │      │ │ AI assistant │
│             │ │     ▼      │ │ Settings     │
│             │ │ ┌────────┐ │ │              │
│             │ │ │SCORING │ │ │              │
│             │ │ └────────┘ │ │              │
└─────────────┘ └───────────┘ └──────────────┘
                                     │
                              ┌──────┘
                              ▼
                       ┌─────────────┐
                       │   BILLING   │
                       │ (not yet    │
                       │ implemented)│
                       └─────────────┘
```

---

## 2. Auth boundary

| Attribute | Detail |
|---|---|
| **Purpose** | Protect user and workspace access via identity and session |
| **Trigger** | Any route/API request requiring authentication |
| **Source of truth** | Clerk user/session + `middleware.ts` route matchers |
| **Key files** | `middleware.ts`, `app/(auth)/*` |
| **Can change** | Sign-in state, session validity, guarded access paths |
| **Must never change** | Business workflow states (onboarding, contacts, scoring) as side effect of auth operations |

### Route protection rules (from middleware)

| Pattern | Protection |
|---|---|
| `/dashboard(.*)` | Protected — requires auth |
| `/s/(.*)` | Protected — requires auth |
| `/onboarding(.*)` | Protected — requires auth |
| `/`, `/sign-in`, `/sign-up`, `/admin` | Public |
| `/apply/*` | Public (not in middleware matcher — prospect-facing) |
| `/legal/*` | Public |

---

## 3. Onboarding boundary

| Attribute | Detail |
|---|---|
| **Purpose** | Activate user and workspace; generate intake link |
| **Trigger** | Authenticated user enters onboarding flow |
| **Source of truth** | `User.onboardingCurrentStep`, `User.onboardingCompletedAt`, `Space` creation |
| **Key files** | `app/onboarding/*`, `app/api/onboarding/route.ts` |
| **Key records** | `User` (onboarding fields), `Space`, `SpaceSetting`, default `DealStage` rows |
| **Can change** | Onboarding progress/completion, workspace setup data, user profile fields |
| **Must never change** | Application submission records, Contact scoring outputs, CRM pipeline state |

### Onboarding actions (POST /api/onboarding)

| Action | What it does | What it must not do |
|---|---|---|
| `start` | Sets step to 1, marks started | Touch contacts or deals |
| `save_step` | Persists current step number | Touch contacts or deals |
| `save_profile` | Updates user name + SpaceSetting phone/business | Touch contacts or scoring |
| `create_space` | Creates Space + SpaceSetting + default stages | Touch existing contacts |
| `save_notifications` | Updates notification preferences | Touch scoring or contacts |
| `complete` | Sets `onboardingCompletedAt` + step 7 | Touch contacts, scoring, or pipeline |
| `check_slug` | Checks slug availability | Write anything |

### Onboarding completion semantics

- Completion is marked by `User.onboardingCompletedAt` being non-null
- `app/dashboard/page.tsx` and `app/s/[slug]/layout.tsx` both check this field
- Legacy accounts with space but no completion timestamp are auto-healed (completion set retroactively)

---

## 4. Application flow boundary

| Attribute | Detail |
|---|---|
| **Purpose** | Capture structured prospect applications via public intake form |
| **Trigger** | Public form submission at `/apply/[slug]` |
| **Source of truth** | `Contact` record created under the target `Space` |
| **Key files** | `app/apply/[slug]/*`, `app/api/public/apply/route.ts` |
| **Key records** | `Contact` (with tags `['application-link', 'new-lead']`, type `QUALIFICATION`) |
| **Can change** | Contact creation, intake metadata, scoring status fields on Contact |
| **Must never change** | `User.onboardingCompletedAt`, `Space` configuration, `DealStage` definitions |

### Application submission rules

- No auth required (public endpoint)
- Required fields: `slug`, `name`, `phone`
- Deduplication: same name + normalized phone within 2-minute window
- Contact created with `scoringStatus: 'pending'` then updated after scoring
- Timeline and notes are combined into the `notes` field as `Timeline: X\nnotes`
- Budget stored as `preferences` field

---

## 5. Scoring boundary

| Attribute | Detail |
|---|---|
| **Purpose** | Provide explainable lead triage metadata |
| **Trigger** | Called after Contact creation in `/api/public/apply` |
| **Source of truth** | Score fields on `Contact` record |
| **Key files** | `lib/lead-scoring.ts` |
| **Key fields** | `Contact.leadScore`, `Contact.scoreLabel`, `Contact.scoreSummary`, `Contact.scoringStatus` |
| **Can change** | Scoring-related fields on the specific Contact being scored |
| **Must never change** | Onboarding state, unrelated Contact records, CRM pipeline state, DealStage definitions, prompt text (without explicit instruction) |

### Scoring isolation rules

1. Scoring operates on a single Contact at a time
2. Scoring failure must not prevent Contact persistence
3. Scoring must not create or modify Deals, DealStages, or Messages
4. Scoring logic must not be modified as a side effect of other changes
5. Score thresholds (hot 75-100, warm 45-74, cold 0-44) are part of the prompt contract

---

## 6. CRM boundary

| Attribute | Detail |
|---|---|
| **Purpose** | Triage and follow-up operations for the authenticated realtor |
| **Trigger** | Authenticated workspace usage at `/s/[slug]/*` |
| **Source of truth** | `Contact`, `Deal`, `DealStage`, `DealContact`, `Message` records |
| **Key files** | `app/s/[slug]/*`, `app/api/contacts/*`, `app/api/deals/*`, `app/api/stages/*`, `app/api/ai/task/route.ts`, `app/api/ai/task/approve/[requestId]/route.ts` |
| **Can change** | CRM records, pipeline ordering, deal stage assignments, contact lifecycle type, messages |
| **Must never change** | Scoring prompt/contract, onboarding state, public intake form behavior, model configuration |

### CRM sub-workflows

| Sub-workflow | Purpose | Key operations |
|---|---|---|
| Leads view | Show intake-sourced leads, clear unread badges | Read contacts with `application-link` tag, remove `new-lead` tag |
| Contacts | Full CRUD for all contacts | Create, read, update, delete contacts; search/filter |
| Deals | Kanban pipeline management | Create/update/delete deals; drag/reorder; stage assignment |
| AI assistant | Chat with CRM context | Stream responses, persist messages, optional RAG enrichment |
| Settings | Workspace configuration | Update space name, notification prefs, AI keys, billing settings |

---

## 7. Billing boundary

| Attribute | Detail |
|---|---|
| **Purpose** | Billing preferences and settings (current visible scope) |
| **Trigger** | Settings page updates |
| **Source of truth** | `SpaceSetting.billingSettings` (string field) |
| **Key files** | `app/s/[slug]/settings/*`, `app/api/spaces/route.ts` |
| **Can change** | Billing settings field value |
| **Must never change** | Auth state, onboarding state, scoring logic, CRM core records, contact data |
| **Status** | Stripe workflow **not confirmed** in current codebase. Field and UI exist but no payment processing. |

### Billing implementation notes

- When billing is implemented, it must not gate existing CRM functionality without explicit product decision
- Billing state must not be coupled to onboarding completion
- Billing failures must not affect lead ingestion or scoring

---

## 8. Critical separation rule

### Onboarding completion and application submission are separate states

They must **never** share generic completion logic.

| Concept | Scope | Source of truth | What it means |
|---|---|---|---|
| Onboarding completion | User/workspace activation | `User.onboardingCompletedAt` | The realtor has set up their workspace and is ready to use the CRM |
| Application submission | Prospect/lead ingestion | `Contact` record with intake tags | A prospective renter has submitted their information |

These two events:
- Happen to different actors (realtor vs prospect)
- Are stored on different models (User vs Contact)
- Serve different purposes (activation vs ingestion)
- Must never share a boolean, timestamp, or status field

**Any change that blends these states requires explicit product and technical approval.**

---

## 9. Cross-boundary rules for agents

When working on a task:

1. **Identify** which workflow boundary the task falls within
2. **Stay** within that boundary. If the task requires crossing boundaries, flag it explicitly.
3. **Do not** modify scoring as a side effect of CRM changes
4. **Do not** modify onboarding as a side effect of intake changes
5. **Do not** modify auth as a side effect of any business logic change
6. **Do not** couple billing to any other workflow without explicit instruction
7. **Test** boundary integrity after changes using the checklist in `TESTING.md` section 5
