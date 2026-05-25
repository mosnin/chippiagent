# 03 User Flows

> **TL;DR:** Template for documenting step-by-step user journeys from signup through repeat usage and admin support.
> **Covers:** signup, onboarding, first value event, repeat usage, billing upgrade, admin flows | **Phase:** 2

## Instructions

Document each key product flow as a numbered sequence of steps. Include the trigger, each screen/action, decision points, and the end state. Note where the flow branches based on user choices or system state.

### Flow: Visitor To Signup

> Example:
> 1. Visitor lands on marketing home page
> 2. Clicks "Get Started Free" CTA in hero or header
> 3. Arrives at /signup with email, password, and name fields
> 4. Submits form → system creates account and sends verification email
> 5. User sees "Check your email" confirmation screen
> 6. User clicks verification link → redirected to /onboarding
>
> Branch: If user already has an account, show "Already registered" with link to /login.

### Flow: Signup To Onboarding

> Example:
> 1. User arrives at /onboarding after email verification
> 2. Step 1: Business profile — name, logo upload (optional), address
> 3. Step 2: Connect Stripe — OAuth flow to link Stripe account
> 4. Step 3: Add first client — name and email minimum
> 5. Step 4: Create first invoice — pre-filled with the client just added
> 6. Progress bar shows completion. Skip available after step 2.
> 7. On completion → redirect to /dashboard
>
> Branch: If user skips steps 3-4, dashboard shows contextual prompts to complete them.

### Flow: Onboarding To First Value

> Example:
> 1. User is on /dashboard after onboarding
> 2. Dashboard shows "Send your first invoice" CTA if no invoices exist
> 3. User clicks CTA → opens invoice builder with guided hints
> 4. User completes and sends invoice
> 5. Confirmation toast: "Invoice sent to [client email]"
> 6. Dashboard updates to show the invoice in "Sent" status
>
> First value event is achieved.

### Flow: Repeat Usage

> Example:
> 1. User logs in → lands on /dashboard
> 2. Reviews summary row (outstanding, paid this month, overdue)
> 3. Clicks "New Invoice" to create another invoice, or
> 4. Clicks an overdue invoice to resend reminder, or
> 5. Checks analytics for revenue trends
>
> The dashboard is the daily operational surface.

### Flow: Billing Upgrade

> Example:
> 1. User hits a plan limit (e.g., max clients on free tier)
> 2. System shows upgrade prompt with plan comparison
> 3. User clicks "Upgrade" → redirected to Stripe Checkout
> 4. After payment → Stripe webhook updates subscription
> 5. User returns to app with new plan active
> 6. Settings > Billing reflects updated plan and next billing date
>
> Branch: If payment fails, show error and prompt to update payment method.

### Flow: Admin Support

> Example:
> 1. Admin logs in → sees admin nav section in sidebar
> 2. Navigates to /admin/users to view all workspace accounts
> 3. Can search/filter users, view their subscription status
> 4. Clicks a user → sees workspace details, invoice volume, billing status
> 5. Can suspend account, change plan, or view audit log
> 6. All admin actions are logged to Admin Record entity
