# Phase 14 — Edge Cases & Polish

## Trigger
Marketing site (Phase 13) is complete.

## Files to Read
- `docs/framework/internal/17_error_state_taxonomy.md` — 12 error types
- `docs/framework/internal/18_testing_strategy.md` — testing layers and strategy
- `docs/framework/internal/19_i18n_posture.md` — i18n and formatting
- `docs/project/04_edge_cases.md` — app-specific edge cases
- `docs/project/07_acceptance_criteria.md` — acceptance criteria
- `docs/project/08_qa_checklist.md` — QA checklist

## What to Do

### Error State Audit
Walk through all 12 error types from `17_error_state_taxonomy.md`:
- Client validation, server validation, auth, authorization
- Network, timeout, empty state, partial success
- Integration, background job, billing, system errors
- Ensure each maps to the correct UI component

### Edge Case Pass
- Review `docs/project/04_edge_cases.md`
- Implement handling for each identified edge case
- Test boundary conditions (empty inputs, long strings, concurrent actions)

### QA Checklist
- Walk through `docs/project/08_qa_checklist.md` item by item
- Auth flows, billing flows, responsive behavior
- Accessibility basics (keyboard nav, focus management, ARIA labels)
- Cross-browser spot check

### Acceptance Criteria
- Verify each criterion in `docs/project/07_acceptance_criteria.md`
- Flag any that aren't met for discussion

### Dark Mode Polish
- Verify all pages and components in dark mode
- Fix contrast issues, missing token usage

### Responsive Audit
- Test every page at 375px, 640px, 768px, 1024px, 1280px, 1536px
- Fix layout breaks, overflow, touch targets

### Formatting
- Ensure dates, numbers, currencies use Intl API per `19_i18n_posture.md`

### Run Full Validation Gate Suite
Run ALL gates from `docs/framework/internal/21_validation_gates.md` as a final regression:
- `gate:typescript-clean` — Full TypeScript compilation passes
- `gate:no-any-types` — No `any` types in production code
- `gate:no-console-logs` — No stray console.log statements
- `gate:all-states-audit` — Every authenticated page handles all four states
- `gate:accessibility-basics` — Alt text, aria labels present
- `gate:full-regression` — Re-run every gate from Phases 4–13

Plus any custom gates from `docs/project/custom_gates.md`.

Present the full gate report to the user.

## Exit Condition
QA checklist is passing. Acceptance criteria are met. All validation gates pass (46 standard + custom). Summarize the final state of the project. The v1 build is complete.
