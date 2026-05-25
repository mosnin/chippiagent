# Phase 6 — Onboarding

## Trigger
Auth (Phase 5) is complete.

## Files to Read
- `docs/framework/internal/02_auth_and_onboarding.md` — onboarding sections

## What to Build

### Onboarding Flow
- Multi-step onboarding sequence (from project docs)
- Progress indicator
- Skip/back navigation where appropriate
- Workspace or organization creation (if applicable)

### First Value Event
- The specific action that makes new users say "this is useful"
- Guide users to complete it during or immediately after onboarding
- Track completion state

### Post-Onboarding
- Redirect to dashboard on completion
- Mark user as onboarded (prevent re-showing)
- Handle users who abandon onboarding mid-flow

### Verify
- New signup → onboarding → first value event → dashboard works end-to-end
- Returning onboarded users skip to dashboard
- Partially completed onboarding resumes correctly

### Run Validation Gates
Run all Phase 6 gates from `docs/framework/internal/21_validation_gates.md`:
- `gate:onboarding-flow` — Onboarding route exists
- `gate:onboarding-completion-flag` — Completion tracked in schema
- `gate:onboarding-redirect` — Non-onboarded users redirected

Plus regression: re-run all Phase 4–5 gates.

## Exit Condition
Onboarding flow is functional. All gates pass. Summarize and ask user to continue to **Phase 7**.
