# 14 Email System

> **TL;DR:** Defines the complete email system — auth, billing, onboarding, and notification email templates with structure rules, subject line rules, plain text fallbacks, dark mode handling, mobile rules, and frequency limits.
> **Covers:** email categories, layout structure, typography, CTA buttons, subject lines, preheaders, plain text, dark mode, mobile, frequency, testing checklist | **Depends on:** None | **Used by:** 09 | **Phase:** 12

## Purpose

Define the complete email system for SaaS products built with this framework. Every transactional, onboarding, and product email follows these rules. This file exists so Claude never improvises email structure, tone, or layout.

---

## Email Categories

### 1. Auth Emails

| Email | Trigger | Priority | Subject Formula | CTA |
|-------|---------|----------|----------------|-----|
| Email verification | User signs up | Critical | "[Product] Verify your email" | "Verify email" → verification link |
| Password reset | User requests reset | Critical | "[Product] Reset your password" | "Reset password" → reset link |
| Magic link | User requests passwordless login | Critical | "[Product] Your sign-in link" | "Sign in" → magic link |
| Account locked | Too many failed login attempts | Critical | "[Product] Account locked — action required" | "Unlock account" → unlock link |
| Email change confirmation | User changes email in settings | Critical | "[Product] Confirm your new email" | "Confirm email" → confirmation link |

**Tone**: Functional, reassuring, brief. No marketing. No personality.

**Structure**: Logo → greeting ("Hi [name]") → one paragraph explaining what happened → CTA button → security note ("If you didn't request this, ignore this email") → footer.

### 2. Billing Emails

| Email | Trigger | Priority | Subject Formula | CTA |
|-------|---------|----------|----------------|-----|
| Payment receipt | Successful payment | Important | "[Product] Payment receipt — [Month Year]" | "View invoice" → billing page |
| Payment failed | Payment attempt fails | Critical | "[Product] Payment failed — action needed" | "Update payment method" → billing page |
| Trial ending | 3 days before trial expiry | Important | "[Product] Your trial ends in 3 days" | "Choose a plan" → pricing page |
| Plan upgraded | User upgrades plan | Informational | "[Product] Welcome to [Plan Name]" | "Explore your new features" → dashboard |
| Plan downgraded | User downgrades plan | Informational | "[Product] Plan changed to [Plan Name]" | "View your plan" → billing page |
| Subscription canceled | User cancels subscription | Important | "[Product] Subscription canceled" | "Resubscribe" → pricing page |

**Tone**: Clear, transparent. No anxiety-inducing language. Payment failure is urgent but not alarming.

**Structure**: Logo → greeting → what happened (receipt amount, failure reason, trial date) → next steps → CTA button → billing support link → footer.

### 3. Onboarding Emails

| Email | Trigger | Timing | Subject Formula | CTA |
|-------|---------|--------|----------------|-----|
| Welcome | Account created | Immediate (day 0) | "Welcome to [Product]" | "Get started" → onboarding |
| Activation nudge | Setup not completed | Day 1 | "[Product] Finish setting up your account" | "Complete setup" → onboarding |
| Feature tip | First value event not reached | Day 3 | "Quick tip: [Specific feature]" | "Try it now" → feature page |
| Value check | 7 days post-signup | Day 7 | "How's it going with [Product]?" | "Explore more features" → dashboard |

**Tone**: Encouraging, specific, action-oriented. Not pushy. Focus on helping them succeed, not on selling.

**Structure**: Logo → greeting → one purpose (one email, one goal) → brief explanation → CTA button → "Need help? Reply to this email" → footer.

### 4. Product Notification Emails

| Email | Trigger | Priority | Subject Formula | CTA |
|-------|---------|----------|----------------|-----|
| Team invite | Admin invites user | Important | "[Name] invited you to [Org] on [Product]" | "Accept invite" → invite link |
| Activity alert | Configurable event occurs | Informational | "[Product] [Event summary]" | "View details" → relevant page |
| Weekly digest | Weekly (Monday morning) | Informational | "[Product] Your week in review" | "View dashboard" → dashboard |
| Usage limit warning | Usage hits 80% | Important | "[Product] You're approaching your [resource] limit" | "View usage" → usage page |
| Integration connected | OAuth flow completes | Informational | "[Product] [Integration] connected successfully" | "Configure" → integration page |
| Integration disconnected | Integration fails | Important | "[Product] [Integration] disconnected — action needed" | "Reconnect" → integration page |

**Tone**: Informative, scannable, not spammy. Digest is summary-focused. Alerts are action-focused.

---

## Email Structure Rules

### Standard Layout
Every email follows this structure:

```
┌──────────────────────── 600px max ────────────────────────┐
│                                                           │
│  [Logo — 120px max width, centered or left-aligned]       │
│                                                           │
│  ─────────────────────────────────────────────────────    │
│                                                           │
│  Hi [First Name],                                         │
│                                                           │
│  [Body paragraph — 1-3 short paragraphs max]              │
│                                                           │
│              [CTA Button — centered]                       │
│                                                           │
│  [Optional secondary info or link]                        │
│                                                           │
│  ─────────────────────────────────────────────────────    │
│                                                           │
│  [Footer — company name, address, unsubscribe if needed]  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Dimensions and Spacing
- Max width: 600px
- Padding: 32px horizontal, 40px top, 32px bottom
- Section gap: 24px between major sections
- Paragraph gap: 16px between paragraphs
- Logo to content gap: 32px

### Typography
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (system fonts — no web fonts in email)
- Heading: 24px, font-weight 700, #111827 (near black)
- Body: 16px, line-height 1.5, #374151 (dark gray)
- Small text: 14px, #6B7280 (muted gray)
- Footer text: 12px, #9CA3AF (light gray)
- Link color: primary brand color

### CTA Button
- Height: 44px
- Padding: 12px vertical, 24px horizontal
- Background: primary brand color
- Text: 16px, font-weight 600, white, no underline
- Border-radius: 8px
- Centered in email body
- MSO-specific fallback for Outlook (use `<v:roundrect>` or padding hack)

### Footer
- Company name
- Company address (required for CAN-SPAM)
- Unsubscribe link (for non-transactional emails)
- "Sent by [Product]" with logo (optional)
- All text: 12px, #9CA3AF, centered

---

## Transactional vs Marketing Boundary

| Category | Type | Unsubscribe Required | Can Include Marketing |
|----------|------|---------------------|-----------------------|
| Auth emails | Transactional | No | No |
| Billing receipts/failures | Transactional | No | No |
| Team invites | Transactional | No | No |
| Onboarding emails | Product | Yes (or frequency control) | Minimal |
| Activity alerts | Product | Yes (configurable per type) | No |
| Weekly digest | Product | Yes | Minimal (feature tips OK) |
| Usage warnings | Product | No (operational) | No |

**Rules**:
- Never mix marketing content into transactional emails
- Onboarding emails may include product tips but not promotional offers
- Users must be able to control notification email frequency from settings
- Digest emails should be opt-out (on by default, can be disabled)

---

## Subject Line Rules

- Max 50 characters (avoid truncation on mobile)
- Start with `[Product]` for recognition
- Be specific: "Your invoice for March" not "Something for you!"
- Auth: verb-first ("Verify your email", "Reset your password")
- Billing: state what happened ("Payment receipt", "Payment failed")
- Onboarding: helpful, not salesy ("Quick tip: [feature]")
- Never use ALL CAPS, excessive punctuation, or emoji in subjects

### Preheader Text
- 40-90 characters
- Extends the subject line, doesn't repeat it
- Example: Subject "Payment receipt — March 2026" → Preheader "Your $29.00 payment was processed successfully"

---

## Plain Text Fallback Rules

Every HTML email must have a plain text version:

```
Hi [Name],

[Body text as plain paragraphs]

[CTA as bare URL]:
https://app.product.com/action

[Footer text]
[Unsubscribe URL if applicable]
```

- No HTML tags
- No image descriptions (skip images entirely)
- CTA as labeled bare URL on its own line
- Line width: max 72 characters (for email client compatibility)
- **OAuth/button-only CTAs in plain text:** If the CTA is an OAuth action (e.g., 'Sign in with GitHub'), use format: 'Sign in with GitHub: [URL]'. If the CTA is a styled button with no meaningful text alternative, use the action description followed by bare URL.

---

## Dark Mode Considerations

- Use transparent PNGs for logos (not JPGs with white backgrounds)
- Do not rely on background-color for visual structure — dark mode inverts backgrounds
- Use borders for visual separation instead of background color blocks
- CTA button: use inline styles with both `background-color` and MSO padding for Outlook
- Test: light mode renders on white bg, dark mode renders on dark bg
- Set `color-scheme: light dark` and `supported-color-schemes: light dark` in meta
- **Dark mode implementation:** Add `<meta name='color-scheme' content='light dark'>` in `<head>`. Add `<style>` block with `@media (prefers-color-scheme: dark)` overrides for background colors and text colors. Logo images: provide both light and dark variants, swap with CSS `display:none` / `display:block` in media query. Test in Apple Mail (best support), Gmail (partial), Outlook (no support — falls back to light).

---

## Mobile Email Rules

- Single column layout always (no multi-column email layouts)
- CTA button: full width on mobile (use `max-width: 100%` with media query)
- Body font: minimum 14px (16px preferred)
- Heading font: minimum 20px
- Tap targets: minimum 44px height
- Image width: 100% max with `style="max-width:100%; height:auto;"`
- Padding: reduce to 24px horizontal on mobile

---

## Frequency and Timing

| Category | Timing | Throttle |
|----------|--------|---------|
| Auth | Immediate | No throttle (security-critical) |
| Billing receipts | Immediate | No throttle |
| Payment failure | Immediate, retry reminders at day 1, 3, 7 | Max 4 failure emails per billing cycle |
| Trial ending | 3 days before expiry | Single email |
| Welcome | Immediate on signup | Single email |
| Activation nudge | Day 1 if setup incomplete | Single email |
| Feature tip | Day 3 if first value not reached | Single email |
| Value check | Day 7 | Single email |
| Activity alerts | As configured, batched if high volume | Max 1 per hour per event type |
| Weekly digest | Monday 9am user timezone | Once per week |
| Usage warnings | At 80% and 95% thresholds | Once per threshold per billing cycle |

**Hard rule**: Never send more than 1 non-auth email per day unless the event is critical (billing failure, security alert).

**Daily email limit clarification:** The 1 non-auth email per day limit applies to marketing/engagement emails. Transactional emails triggered by user actions (e.g., invoice receipt after payment, team invite after admin action) are exempt from this limit. Onboarding sequence emails (welcome, activation nudge, value check) are spaced per the onboarding timeline (Day 0, Day 2, Day 5, Day 7) — never more than one per day.

---

## Email Testing Checklist

Before shipping any email template:

- [ ] Renders correctly in Gmail (web + mobile)
- [ ] Renders correctly in Outlook (desktop + web)
- [ ] Renders correctly in Apple Mail
- [ ] Dark mode renders correctly (no invisible text, logo visible)
- [ ] Plain text version exists and is readable
- [ ] All links work and point to correct destinations
- [ ] CTA button is tappable on mobile (44px+ height)
- [ ] Subject line is under 50 characters
- [ ] Preheader text is set and doesn't repeat subject
- [ ] Unsubscribe link works (for non-transactional)
- [ ] Personalization tokens render correctly ([name], [product], etc.)
- [ ] Fallback values exist for missing personalization data

**Personalization fallback values:** `{{first_name}}` → 'there' (as in 'Hi there'). `{{company_name}}` → 'your team'. `{{plan_name}}` → 'your plan'. `{{feature_name}}` → omit the sentence entirely. Never show raw template tokens like `{{first_name}}` to users.

**Email client compatibility tiers:**
- **Tier 1 (must work perfectly):** Gmail (web + mobile), Apple Mail (macOS + iOS), Outlook 365 (web)
- **Tier 2 (must be readable):** Outlook desktop (Windows), Yahoo Mail, Samsung Mail
- **Tier 3 (best effort):** Thunderbird, older Outlook versions (2016-)

Test Tier 1 clients before every email template ships. Tier 2 on initial template creation. Tier 3 only if user reports issues.

---

## Final Principle

SaaS emails are product surfaces, not afterthoughts. Every email should look intentional, read clearly on any device, and drive exactly one action. If an email doesn't have a clear purpose and CTA, it shouldn't be sent.
