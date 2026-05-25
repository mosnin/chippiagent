# 02 Auth And Onboarding

> **TL;DR:** Defines the canonical auth routes, page layouts, email verification, onboarding sequence, and first value event delivery for user activation.
> **Covers:** login, signup, password reset, email verification, invite flow, onboarding steps, first value event | **Depends on:** 07 (User, Membership entities), 14 (email templates) | **Used by:** 06, 09 | **Phase:** 5, 6

## Purpose

Define the canonical user entry and activation flow for SaaS applications.

This file is split into two sections for phased reading:
- **Section A: Auth** (Phase 5) — Auth routes through Email Verification Rules
- **Section B: Onboarding** (Phase 6) — Onboarding Purpose through end of file

---

# Section A: Auth

Read this section during **Phase 5**.

## Auth Routes

### Required Routes

- login
- sign up
- forgot password
- reset password
- verify email
- invite acceptance when relevant

### Optional Routes

- magic link
- social auth
- SSO
- two factor challenge

## Auth Page Layout

### Desktop

Use a split layout.

Left:
- form
- page heading
- support copy
- auth options

Right:
- branded visual
- testimonial
- trust statement

### Mobile

- single column
- form first
- reduce visual clutter
- prioritize fast completion

## Auth Form Fields

### Signup
- **Email**: required, validated format, unique check
- **Name**: required, display name (2–100 chars)
- **Password**: required, minimum 8 characters, shown/hidden toggle

### Login
- **Email**: required
- **Password**: required
- **Remember me**: optional checkbox (extends session duration)

### Forgot Password
- **Email**: required — always show success message regardless of whether email exists (prevent enumeration)

### Reset Password
- **New password**: required, minimum 8 characters
- **Confirm password**: required, must match
- Token valid for 1 hour. Expired tokens show clear message with link to request again.

## Auth Rules

1. All forms need validation — inline errors below each field on blur and on submit.
2. All forms need loading and error states.
3. Success states must clearly explain what happens next.
4. Login and sign up should link to each other.
5. Sensitive changes may require reauthentication.
6. Password requirements: minimum 8 characters. Show strength indicator on signup.
7. Rate limit login attempts: lock after 5 failed attempts for 15 minutes.

## Invite Flow

If team invites exist, invite acceptance must show:

- invited workspace or team
- inviter identity when available
- accept and continue path
- clean merge into signup or login

## Email Verification Rules

1. Make verification state visible when it matters.
2. Support resend actions with rate limiting (max 3 resends per 10 minutes).
3. Do not create dead end screens.
4. Verification tokens valid for 24 hours. Expired tokens show message with resend option.
5. Email templates defined in `14_email_system.md`.

---

# Section B: Onboarding

Read this section during **Phase 6**.

## Onboarding Purpose

The purpose of onboarding is to get the user to first value quickly.

It is not a dumping ground for every possible preference.

## Required Onboarding Goals

- identify user type or use case
- capture required setup inputs
- connect required services or data
- establish defaults
- deliver first useful output

## Canonical Onboarding Sequence

1. role or use case
2. required configuration
3. integrations or data connection if needed
4. preferences or defaults
5. first output or first workspace

## Branching Logic

Onboarding may branch by:

- role
- use case
- plan
- technical sophistication
- whether data connection is mandatory
- whether team or solo workflow applies

## First Value Event

Every product must define a first value event in `docs/project/03_user_flows.md`. The first value event is the moment a new user gets tangible benefit from the product — e.g., seeing their first dashboard with real data, sending their first invoice, or completing their first workflow.

## Onboarding Rules

1. Each step should have one clear objective.
2. Users should understand progress — show step indicator (e.g., "Step 2 of 4").
3. Skip optional setup when possible.
4. Preserve progress if the flow is interrupted — store current step in Settings entity (`onboarding_step` field per `07_data_models.md`).
5. Support validation, loading, success, and failure states.
6. Route users to the most relevant first destination after completion.
7. Maximum 5 steps for v1. If more setup is needed, defer to a post-onboarding checklist.

## Incomplete Setup Handling

If a user leaves onboarding early:

- preserve progress
- show setup checklist
- keep required next steps obvious
- do not block all usage unless necessary

## Final Principle

Onboarding should be dynamic to the app, but the system around it should remain reusable and activation focused.
