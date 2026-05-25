# Phase 7 — App Shell

## Trigger
Onboarding (Phase 6) is complete.

## Files to Read
- `docs/framework/internal/01_app_shell.md` — shell structure
- `docs/framework/internal/08_ui_system_internal.md` — component behavior system (foundational for all authenticated UI)
- `docs/framework/internal/10_design_tokens_internal.md` — visual tokens
- `docs/framework/internal/12_internal_component_specs.md` — component visual specs
- `docs/framework/internal/15_canonical_breakpoints.md` — responsive breakpoints
- `docs/framework/internal/22_pattern_snapshot.md` — pattern capture instructions (generate snapshot at end of this phase)

## What to Build

### Shell Components
- **Top bar**: logo, search, notifications, user menu
- **Sidebar**: navigation links, workspace switcher (if applicable), collapse behavior
- **Page header**: title, breadcrumbs, action buttons
- **User menu**: profile, settings, logout
- **Mobile drawer**: responsive sidebar replacement

### Design System Setup
- Configure design tokens (colors, spacing, typography, shadows, radii)
- Light and dark mode token sets
- Tailwind theme extension with token values

### Responsive Layout
- Sidebar visible at lg+ (1024px), drawer below
- Content area adapts across all 6 breakpoints
- Mobile-first implementation

### Navigation
- Route-based active states
- Role-aware nav items (hide items user can't access)
- Workspace switching (if multi-tenant)

### Verify
- Shell renders correctly at all breakpoints (375px → 1536px+)
- Sidebar collapses to drawer on mobile
- Dark mode toggles correctly
- Navigation highlights active route

### Run Validation Gates
Run all Phase 7 gates from `docs/framework/internal/21_validation_gates.md`:
- `gate:shell-layout` — Authenticated layout exists
- `gate:shell-sidebar` — Sidebar/nav component exists
- `gate:shell-responsive` — Mobile responsive classes present
- `gate:shell-dark-mode` — Dark mode configured and used
- `gate:shell-page-header` — Reusable page header component exists

Plus regression: re-run all Phase 4–6 gates.

### Generate Pattern Snapshot
Read `docs/framework/internal/22_pattern_snapshot.md` and follow its instructions to generate `docs/project/pattern_snapshot.md`. This captures the canonical code conventions from Phases 4–7 so all future phases stay consistent.

## Exit Condition
App shell is responsive and functional. All gates pass. Pattern snapshot generated. Summarize and ask user to continue to **Phase 8**.
