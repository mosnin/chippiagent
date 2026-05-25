# Phase 2 — Generate Project Docs

## Trigger
Discovery is complete. `docs/project/` does not exist or has fewer than 9 files.

## Files to Read
- `docs/framework/templates/*` — all 9 templates for structure and example tone

## What to Do

1. Create `docs/project/` directory
2. Generate all 9 files with concrete, app-specific content:

| File | Purpose |
|------|---------|
| `00_app_idea.md` | Product concept, users, core problem, v1 scope |
| `01_project_brief.md` | Project summary, tagline, value prop, success metrics |
| `02_feature_spec.md` | Feature definitions with scope and acceptance criteria |
| `03_user_flows.md` | Step-by-step flows for signup, onboarding, core actions |
| `04_edge_cases.md` | Error scenarios, race conditions, limits |
| `05_tech_stack.md` | Tech decisions — framework, database, auth, hosting |
| `06_permissions_matrix.md` | Role-permission matrix for routes, actions, data access |
| `07_acceptance_criteria.md` | Given/when/then criteria per feature |
| `08_qa_checklist.md` | Auth, billing, responsive, accessibility, edge case tests |

3. Present a summary: app name, core features, roles, entities, v1 scope
4. Ask user to review and confirm or request adjustments

### Rules
- Do not leave any file generic — every entry must be specific to this app
- Use template examples as reference for tone and depth
- Parallel file generation is fine — they're independent

## Exit Condition
User confirms project docs → **Phase 3**.
