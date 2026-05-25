# Phase 3 — Architecture Plan

## Trigger
All 9 project docs exist. No source code written yet.

## Files to Read
- `docs/project/*` — all 9 project files
- `docs/framework/internal/07_data_models.md` — entity patterns
- `docs/framework/internal/06_routes_and_permissions.md` — route structure
- `docs/framework/internal/04_feature_modules.md` — available module types
- `docs/framework/internal/09_build_rules_internal.md` — build order and constraints

## What to Do

Produce an architecture summary covering:

### 1. Entities
- List each entity with key fields and relationships
- Map to canonical entities from `07_data_models.md`
- Identify app-specific entities that extend the base set

### 2. Routes
- Full route table organized by category:
  - **Public**: marketing pages, auth pages
  - **Authenticated**: dashboard, features, settings
  - **Admin**: admin-only routes
- Include middleware/permission requirements per route

### 3. Modules
- Which optional modules apply (from `04_feature_modules.md`):
  - Analytics, Integrations, API, MCP, Webhooks, Notifications, Usage, Activity Logs
- Note which are v1 vs future

### 4. Build Order
- The 11 build phases with app-specific notes:
  - What each phase includes for THIS app
  - Key decisions or dependencies between phases

### 5. Custom Validation Gates
- Read `docs/framework/internal/21_validation_gates.md` for the gate system
- Define app-specific gates based on entities and features identified
- Write custom gates to `docs/project/custom_gates.md`
- Examples: tenant isolation checks, feature-specific structural checks

Present the full plan to the user for review.

## Exit Condition
User confirms architecture and custom gates → **Phase 4**.
