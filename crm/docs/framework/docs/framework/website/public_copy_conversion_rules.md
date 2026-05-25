# Public Copy and Conversion Rules

> **TL;DR:** Defines enforceable rules for marketing copy including headline formulas, CTA hierarchy, proof/trust patterns, tone, pricing copy, FAQ structure, and form copy.
> **Covers:** headline rules, CTA hierarchy and placement, social proof copy, tone and word rules, pricing copy, FAQ copy, form copy, anti-patterns | **Depends on:** None | **Used by:** public_screen_archetypes.md, component_library_spec.md | **Phase:** 13

Rules for writing public-facing marketing copy that converts. Every rule here is specific and enforceable — if a rule could apply to any website for any product, it does not belong in this file.

---

## Headline Rules

### Hero Headline Formula

Structure: **what it does + for whom + why it matters**.

Patterns:

- `[Verb] [object] [qualifier]` — "Track customer health scores across every account"
- `[Outcome] for [audience]` — "Faster deployments for engineering teams"
- `[Pain removal] without [tradeoff]` — "Invoice clients without chasing payments"

The hero headline must pass this test: could a stranger read it and explain what the product does? If not, rewrite it. Keep hero headlines between 5 and 12 words.

### Section Headlines

Section headlines describe the mechanism, not the benefit. 6 to 10 words.

- Name the actual feature, workflow, or concept
- Use plain nouns and verbs — no metaphors
- If the section has a screenshot, the headline should caption what the reader sees

Bad: "Supercharge your productivity" / Good: "One inbox for every customer conversation"
Bad: "Built for the modern team" / Good: "Role-based dashboards for managers and ICs"

### Subheadline Rules

The subheadline expands the headline with specifics. 15 to 25 words.

- Must add information the headline did not contain
- Include at least one concrete detail: a number, a named feature, a use case
- Never repeat the headline in different words

Bad: "All-in-one platform" / "Everything you need in one place"
Good: "Track every deal from first touch to close" / "Pipeline stages, activity logs, and revenue forecasting in a single view — no spreadsheets, no tab switching."

### Headline Anti-Patterns

Never use in any headline:

- "Revolutionize" or "transform" — vague and overused
- "Seamless" or "seamlessly" — every product claims this
- "Cutting-edge" or "next-generation" — meaningless without proof
- "Unlock the power of" — filler that delays the actual message
- "All-in-one" as the primary value prop — it describes scope, not value
- "The future of [category]" — unprovable and arrogant
- Any headline that works equally well for a CRM, a project tool, and a note-taking app

---

## CTA Hierarchy

### Primary CTA

One primary CTA per page, repeated in multiple locations. Filled background, high contrast, largest button on page.

- Use a specific verb: "Start free trial", "Create your workspace", "Deploy your first app"
- Never use "Get started" — it describes nothing
- Include the value or format: "free trial", "in 2 minutes", "no credit card"
- 2 to 5 words on the button, supporting microcopy below if needed

### Secondary CTA

Lower-commitment alternative, paired visually with the primary CTA. Outline or text-only styling.

- Action requires no signup: "Watch 2-minute demo", "See pricing", "View example dashboard"
- Never duplicate the primary CTA's wording

### Ghost CTA

Text link styling, no button treatment. Addresses objections or serves comparison shoppers.

- Place near relevant content: comparison tables, FAQ, feature sections
- Examples: "Compare to [Competitor]", "Read the security whitepaper", "See full API docs"

### CTA Placement

1. **Hero**: Primary + secondary CTA. Always above the fold.
2. **After first proof section**: Primary CTA repeated. Reader now has context.
3. **After social proof or case study**: Primary CTA. Trust is highest here.
4. **Final section before footer**: Primary CTA with closing headline restating core value prop.

### Banned CTA Copy

- "Submit" — clinical, implies a form, not a benefit
- "Click here" — describes the mechanic, not the outcome
- "Learn more" alone — only acceptable with a specific destination ("Learn more about SSO")
- "Sign up" without context — always qualify: "Sign up free", "Sign up — no card required"
- "Buy now" on SaaS pages — SaaS is subscribed to, not bought

---

## Proof and Trust Copy

### Social Proof Placement

Place a proof element after every claim section. Pattern: claim, explain, prove, repeat. A "proof element" is one of: customer quote, stat, logo strip, case study snippet, or review score. Never stack multiple proof types back-to-back without content between them.

### Stat Formatting

- Use exact numbers: "2,437 teams" not "thousands of teams"
- Round only if counts change frequently: "2,400+" is acceptable
- Pair every stat with a timeframe or qualifier: "12,000 projects shipped this quarter"
- Format large numbers with commas. Avoid percentages without a base.

Bad: "Thousands of happy customers" / Good: "2,400+ teams across 40 countries"
Bad: "99.9% uptime" / Good: "99.95% uptime over the last 12 months — check our public status page"

### Testimonial Criteria

A valid testimonial must include: full name, company name, role/title, and a specific result or named workflow.

Bad: "This product is amazing! Highly recommend." — Jane D.
Good: "We cut onboarding from 3 weeks to 4 days. The automated checklists handle what used to take two coordinators." — Maria Chen, Head of Ops, Lateral Inc.

Limit to 2 to 3 sentences. Single-sentence pull quotes work if the result is specific enough.

### Logo Strip

- 5 to 8 real customer logos in grayscale or subdued treatment
- Roughly equal visual weight — no single logo dominates
- Label: "Trusted by" or "Used by teams at" — not "Our amazing customers"
- Never show logos without explicit permission

### Case Study Summaries

Formula: **[Company] + [problem] + [what they did] + [measurable result].**

Example: "Lateral Inc. was losing 15 hours per week to manual onboarding. They automated their checklist flow and cut onboarding from 3 weeks to 4 days."

2 to 3 sentences max. Link to the full case study with a ghost CTA.

---

## Tone Rules

### Voice and Register

Confident, clear, specific, technically credible. Write like a practitioner explaining their tool to a peer — not a marketer selling to a lead.

- Professional but not corporate: "We built this because existing tools were too slow" — fine. "Our innovative solution leverages synergies" — not fine.
- Direct but not aggressive: state facts, skip pressure. "Your trial ends in 3 days" not "Don't miss out! Act now!"
- Technically accurate: if the product uses WebSockets, say WebSockets — not "real-time magic."

### Word Rules

Avoid:

- Hype words: "incredible", "amazing", "game-changing", "disruptive"
- Superlatives without proof: "the best", "the fastest", "the most powerful"
- Passive voice: "Reports are generated" becomes "Generate reports"
- Jargon without explanation: first use of a technical term gets a brief parenthetical
- Filler adverbs: "very", "really", "extremely", "actually", "basically"
- Weasel phrases: "helps you", "enables you to", "allows you to" — say what the user does directly

### Sentence and Paragraph Length

- Prefer short sentences. Under 15 words is ideal. Maximum 25 words.
- Mix lengths for rhythm: a 7-word sentence followed by a 20-word sentence reads better than five 14-word sentences.
- 2 to 3 sentences per paragraph. Single-sentence paragraphs for emphasis — max once per section.
- If a section exceeds 3 paragraphs, break it into a list or grid layout.

---

## Pricing Copy Rules

### Price Anchoring

- Show monthly and annual pricing. Default toggle to annual.
- Display savings explicitly: "Save 20%" or "$X/mo billed annually (save $Y/year)"
- Never hide monthly pricing — let the reader compare

### Plan Naming

- Descriptive, scale-based: "Starter", "Team", "Business", "Enterprise"
- Never metal/gem tiers: "Silver", "Gold", "Platinum" communicate rank, not fit
- "Pro", "Plus", "Premium" acceptable only when paired with audience label ("Pro — for growing teams")

### Feature Descriptions

- Describe what the feature enables, not what it is
- Bad: "Custom fields" / Good: "Custom fields — track any data point specific to your workflow"
- Bad: "API access" / Good: "API access — connect to your existing tools"
- 6 to 8 items per plan. Link to full comparison for the rest.
- Bold the 1 to 2 features that differentiate each plan from the tier below

### Enterprise Path

- Label: "Talk to sales" or "Request a quote" — never "Contact us"
- Qualifying context: "For teams over 50", "Custom contracts and SLAs"
- List 3 to 4 enterprise-specific features justifying custom pricing
- Never make "Talk to sales" the only option for any standard plan

### Billing Transparency

- State terms near the price: "Billed annually" or "Billed monthly, cancel anytime"
- State what happens when a trial ends: "After 14 days, pick a plan or your workspace pauses"
- If no credit card required, say so beneath the CTA
- Never use "starting at $X" if that price requires specific conditions

---

## FAQ Copy Rules

### Structure

- Lead with the direct answer. First sentence answers the question. Context follows.
- 2 to 3 sentences max. Link to a help doc if more is needed.
- Write questions in the user's voice: "Can I cancel anytime?" not "What is the cancellation policy?"

### Required Topics

Every SaaS FAQ must cover:

1. **Pricing**: "Is there a free tier?" / "What happens when my trial ends?"
2. **Setup**: "How long does setup take?" / "Do I need a developer?"
3. **Security**: "Where is my data stored?" / "Do you support SSO?"
4. **Integrations**: "Does it work with [common tool]?" / "Is there an API?"
5. **Support**: "How do I get help?" / "What's your response time?"
6. **Migration**: "Can I import from [competitor]?" / "Can I export my data?"
7. **Trial terms**: "Do I need a credit card to start?" / "What's included in the trial?"

When an answer references a deeper topic, link to it: "Yes, we support SSO via SAML 2.0. See our security docs for setup instructions."

---

## Form Copy Rules

### Field Labels and Placeholder Text

- Labels: short and specific. "Work email" not "Please enter your email address"
- Sentence case: "Company name" not "Company Name"
- Mark required fields with an asterisk (*) per WCAG 2.1 Section 3.3.2. Also mark optional fields with "(optional)" text for clarity
- Placeholder shows format: "jane@company.com" not "Enter your email"
- Never use the label as placeholder — it disappears on focus

### Submit Buttons and Trust Microcopy

- Button names the action: "Request demo", "Join waitlist", "Create account"
- Never use "Submit" — describe the user goal, not the form mechanic
- Match button text to page context: demo request form says "Request demo", not "Send"
- Place one line of trust copy beneath the button: "No credit card required", "Free 14-day trial", "Setup takes under 2 minutes", or "We'll never share your email"
- Pick the line that addresses the reader's most likely hesitation

### Error Messages

- Specific: "That email is already registered — try signing in" not "Invalid input"
- Helpful: include the next action: "Password must be at least 8 characters. Try adding a number."
- Inline: show next to the field, not in a banner at the top
- Never blame the user: "We couldn't find that account" not "You entered the wrong email"

---

## Page-Level Copy Patterns

### Home Page

Conversion funnel. Section order: **attention, trust, explanation, proof, conversion**.

1. Hero: headline + subheadline + primary CTA + secondary CTA
2. Logo strip: establish credibility immediately after hero
3. Problem statement: name the pain in 2 to 3 sentences
4. Solution overview: features grid or short walkthrough
5. Social proof: testimonial or case study snippet
6. Feature deep-dives: 2 to 3 sections with headline + paragraph + screenshot
7. Additional proof: second testimonial, stat block, or review aggregate
8. Final CTA: restated value prop + primary CTA

### Product Page

Explains the mechanism — how it works, not what it promises.

- Open with the workflow: "Here's what happens when you [core action]"
- Show, do not describe: screenshots, short videos, annotated diagrams
- Organize by workflow stage, not feature list
- End each section with micro-proof: a stat, a quote, or "used by X teams"

### Pricing Page

Supports a decision. Does not pressure one.

- Default to annual toggle, show both options
- Highlight most popular plan: "Most popular" or "Best for most teams"
- Comparison table below cards for detailed feature breakdowns
- Pricing-specific FAQ section
- Final CTA: "Not sure? Start a free trial and pick a plan later."

### Solutions Pages

Map the product to a specific persona or use case.

- Open with the persona's problem in their language
- Show 3 to 4 features most relevant to that persona
- Include a testimonial from someone in that role or industry
- CTA references the persona: "Start your [role/use case] workspace"

### Case Study Pages

Evidence format: **problem, action, result**.

- Headline is the result: "Lateral Inc. cut onboarding from 3 weeks to 4 days"
- First section: the problem in the customer's words
- Second section: what they implemented and how
- Third section: measurable outcomes with specific numbers
- Sidebar: company size, industry, products used, timeline
- Close with customer quote and trial CTA

---

## Anti-Patterns

These patterns reduce trust and conversion. Never use them.

1. **"We're different because we care"** — show the mechanism, not the sentiment
2. **Feature lists without context** — "Webhooks" means nothing alone; say what it enables
3. **Testimonials without attribution** — no name, no company, no context means delete it
4. **Gated pricing on every plan** — reserve "Talk to sales" for genuinely custom deals
5. **Identical CTAs everywhere** — if every button says "Get started", nothing has signal
6. **Hero copy that fits any product** — if it works for Slack, Notion, and a CRM, it says nothing
7. **Stacking proof without content between** — three testimonials in a row is padding
8. **Stock photos of people** — use real photos or skip people imagery entirely
9. **Hiding the product behind marketing language** — if the reader finishes the page without understanding what the product does, the copy failed
10. **"Trusted by industry leaders" without naming any** — name them or remove the claim
