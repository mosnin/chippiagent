# Phase 9 — Core Features

## Trigger
Dashboard (Phase 8) is complete.

## Files to Read
- `docs/framework/internal/08_ui_system_internal.md` — component behaviors
- `docs/framework/internal/11_internal_screen_archetypes.md` — page patterns
- `docs/framework/internal/12_internal_component_specs.md` — component visual specs
- `docs/framework/internal/17_error_state_taxonomy.md` — error handling

## Required Reading (Before Building)
- `docs/project/pattern_snapshot.md` — canonical code conventions (all agents must read this)

## What to Build

Build the product-specific feature modules defined in `docs/project/02_feature_spec.md`.

### For Each Feature Module
1. **Index/list view** — table or card grid with filters, search, pagination
2. **Detail view** — full entity view with related data
3. **Create/edit forms** — validation, error states, success feedback
4. **Delete/archive** — confirmation, undo where appropriate

### Screen Archetypes to Follow
- **Table Index**: filterable, sortable, paginated lists
- **Detail**: entity detail with tabs or sections
- **Form Setup**: multi-field forms with inline validation
- Reference `11_internal_screen_archetypes.md` for layout rules

### Error Handling
- Apply error taxonomy from `17_error_state_taxonomy.md`
- Client validation, server validation, network errors, empty states
- Each error type maps to specific UI components

### Four States on Every View
- Loading (skeletons)
- Empty (guidance + CTA)
- Success (data populated)
- Error (message + retry)

### Verify
- All CRUD operations work end-to-end
- Permissions enforced (users can't access others' data)
- Forms validate correctly
- All four states render properly
- Responsive at all breakpoints

### Run Validation Gates
Run all Phase 9 gates from `docs/framework/internal/21_validation_gates.md`:
- `gate:features-exist` — All feature modules from spec have routes
- `gate:features-four-states` — Every feature handles loading, empty, success, error
- `gate:features-permissions` — Permission checks in API routes
- `gate:features-org-isolation` — Queries filter by organization
- `gate:features-validation` — Forms have client-side validation

Plus regression: re-run all Phase 4–8 gates.

### Update Pattern Snapshot
After the first feature module is built, update `docs/project/pattern_snapshot.md` to add Section H (Feature Module Template). All subsequent feature agents must read this before building.

## Exit Condition
Core features are functional. All gates pass. Pattern snapshot updated with feature template. Summarize what was built and ask user to continue to **Phase 10**.
