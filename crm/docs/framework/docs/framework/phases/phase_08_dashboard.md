# Phase 8 — Dashboard

## Trigger
App shell (Phase 7) is complete.

## Files to Read
- `docs/project/pattern_snapshot.md` — **MANDATORY** — read before writing any code, follow established conventions
- `docs/framework/internal/03_dashboard_system.md` — dashboard anatomy
- `docs/framework/internal/16_dashboard_archetypes.md` — concrete dashboard types
- `docs/framework/internal/13_internal_data_display_rules.md` — data display rules

## What to Build

### Dashboard Type Selection
Choose the appropriate archetype from `16_dashboard_archetypes.md`:
- **Queue**: task/ticket/order processing
- **Pipeline**: stage-based workflow
- **Analytics**: metrics and trends
- **Content Workspace**: content creation/management
- **Operations**: system/team oversight
- **Monitoring**: real-time system health
- **Admin Overview**: platform-wide admin view

### Dashboard Components
- **Summary row**: 3-5 key metrics with trend indicators
- **Main work area**: primary content for the chosen archetype
- **Secondary insights**: supporting charts, lists, or activity
- **Activity feed**: recent actions (if applicable)

### Four States
- **Loading**: skeleton placeholders matching layout
- **Empty**: first-use guidance with clear CTA
- **Success**: populated with data
- **Error**: graceful error with retry option

### Verify
- Dashboard renders with mock/seed data
- All four states display correctly
- Responsive at all breakpoints
- Metrics update correctly

### Run Validation Gates
Run all Phase 8 gates from `docs/framework/internal/21_validation_gates.md`:
- `gate:dashboard-page` — Dashboard route exists
- `gate:dashboard-four-states` — Loading, empty, success, and error states present
- `gate:dashboard-metrics` — Summary metrics implemented

Plus regression: re-run all Phase 4–7 gates.

### Update Pattern Snapshot
Update `docs/project/pattern_snapshot.md` Section D with dashboard-specific component patterns (data display, metrics, etc.).

## Exit Condition
Dashboard is functional with all states. All gates pass. Pattern snapshot updated. Summarize and ask user to continue to **Phase 9**.
