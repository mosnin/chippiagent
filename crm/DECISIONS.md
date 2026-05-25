# DECISIONS.md

Decision log for product and technical choices in the Chippi repository.

Use this to record meaningful decisions and avoid re-litigating context. When a decision is made (by a human or during AI-assisted work), log it here with full context so future contributors understand why.

---

## How to use this file

1. Add new decisions at the top of the log section (most recent first).
2. Fill in all fields in the template.
3. Mark decisions as `[CONFIRMED]` if backed by repo evidence or explicit instruction, or `[PLACEHOLDER]` if inferred.
4. Set a follow-up review date when the decision may need revisiting.

---

## Decision template

```md
## [YYYY-MM-DD] <Decision title>

- **Status**: [CONFIRMED] or [PLACEHOLDER]
- **Decision**: <short statement of what was decided>
- **Context**: <why this decision was needed>
- **Options considered**:
  1. <option A — description>
  2. <option B — description>
  3. <option C — description>
- **Chosen option**: <which option and why>
- **Expected impact**: <benefits and constraints>
- **Risks**: <known downsides or trade-offs>
- **Follow-up review date**: <YYYY-MM-DD>
```

---

## Log

## [CONFIRMED] Protect launch wedge over generic CRM expansion

- **Status**: [CONFIRMED] — product context and codebase both support this
- **Decision**: Prioritize renter/leasing qualification speed and clarity over broad CRM feature expansion.
- **Context**: Chippi's initial user is a new solo realtor handling renter leads. The codebase is built around intake → scoring → CRM triage. Expanding to generic CRM breadth would dilute the activation value and increase setup friction.
- **Options considered**:
  1. Expand to generic CRM breadth now — serve more use cases, risk losing focus
  2. Maintain focused wedge — serve the specific user well, expand later
- **Chosen option**: 2 — Maintain focused wedge. The product should do one thing well before expanding.
- **Expected impact**: Better activation rates, clearer user value, simpler product to maintain.
- **Risks**: Some users may request broader CRM features early. Narrow scope limits addressable market initially.
- **Follow-up review date**: [TBD — revisit after initial user feedback]

---

## [CONFIRMED] Explainable scoring contract

- **Status**: [CONFIRMED] — implemented in `lib/lead-scoring.ts`
- **Decision**: Lead scoring must produce an explainable contract: numeric score (0-100), label (hot/warm/cold/unscored), and plain-language summary (max 300 chars).
- **Context**: Realtors need to quickly triage leads. An opaque score number is not actionable. The summary explains *why* a lead scored the way it did.
- **Options considered**:
  1. Opaque numeric score only
  2. Score + label (no summary)
  3. Score + label + explainable summary (chosen)
- **Chosen option**: 3 — Full explainable contract. The summary drives trust and actionability.
- **Expected impact**: Realtors can make faster follow-up decisions with confidence. Scoring feels practical, not magical.
- **Risks**: Prompt/schema drift could break the contract. Summary quality depends on model output.
- **Follow-up review date**: [TBD — revisit if scoring accuracy feedback emerges]

---

## [CONFIRMED] OpenAI for scoring, embeddings, and assistant

- **Status**: [CONFIRMED] — implemented in `lib/lead-scoring.ts` and `lib/ai.ts`
- **Decision**: Use OpenAI exclusively — gpt-4o-mini for lead scoring (structured JSON output) and gpt-4.1-mini for the AI assistant.
- **Context**: Scoring requires structured JSON output with strict schema validation. Consolidating on a single provider reduces complexity and surface area.
- **Options considered**:
  1. OpenAI only for everything (chosen)
  2. Anthropic only for everything
  3. OpenAI for scoring + embeddings, dual-provider for assistant
- **Chosen option**: 1 — OpenAI handles all AI workloads.
- **Expected impact**: Reliable scoring via structured output. Simpler provider management.
- **Risks**: Single provider dependency; mitigated by OpenAI's reliability.
- **Follow-up review date**: [TBD]

---

## [CONFIRMED] Onboarding completion and application submission are separate states

- **Status**: [CONFIRMED] — implemented in `User.onboardingCompletedAt` (user-level) vs `Contact` records (per-lead)
- **Decision**: Onboarding completion and application submission must remain separate states with no shared completion logic.
- **Context**: Onboarding is a user/workspace activation flow. Application submission is a prospect/lead ingestion flow. Coupling these would create fragile shared state and confusing edge cases.
- **Options considered**:
  1. Shared "completion" flag for both
  2. Separate state tracking (chosen)
- **Chosen option**: 2 — Separate states. Onboarding is on `User`, applications create `Contact` records.
- **Expected impact**: Clean workflow boundaries. Agents cannot accidentally couple these flows.
- **Risks**: None significant — separation is the safer default.
- **Follow-up review date**: N/A

---

## [PLACEHOLDER] Billing implementation approach

- **Status**: [PLACEHOLDER] — billing field exists but no implementation confirmed
- **Decision**: Billing approach not yet decided.
- **Context**: `SpaceSetting.billingSettings` exists as a string field. Settings UI has a billing input. No Stripe package or payment routes are in the codebase. Intended pricing is $97/month with 7-day free trial (per product context, not confirmed in code).
- **Options considered**:
  1. Stripe Checkout / Billing portal
  2. Alternative payment processor
  3. Manual billing initially
- **Chosen option**: Not yet decided
- **Expected impact**: Unknown until implemented
- **Risks**: Billing touches auth, access control, and workspace lifecycle. Must be carefully bounded.
- **Follow-up review date**: [TBD — when billing implementation begins]
