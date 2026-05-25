# Phase 4 — Foundation

## Trigger
Architecture plan confirmed. No source code exists yet.

## Files to Read
- `docs/framework/internal/09_build_rules_internal.md` — Phase 4 (Foundation) section
- `docs/framework/internal/21_validation_gates.md` — validation gate system and Phase 4 gates

## What to Build

### Project Setup
- Initialize Next.js with app router, TypeScript, Tailwind CSS
- Configure Prisma with PostgreSQL
- Set up project structure per architecture plan

### Database Schema
- Create Prisma schema from entity plan
- Include all canonical entities (User, Organization, Membership, Subscription, etc.)
- Add app-specific entities
- Set up relationships and indexes

### Shared Infrastructure
- Types and interfaces
- Constants and configuration
- Utility functions
- API route helpers
- Error handling utilities

### Verify
- Project builds without errors
- Database migrates successfully
- Dev server starts cleanly

### Run Validation Gates
Run all Phase 4 gates from `docs/framework/internal/21_validation_gates.md`:
- `gate:foundation-builds` — TypeScript compiles
- `gate:foundation-schema` — Prisma validates
- `gate:foundation-entities` — All architecture entities in schema
- `gate:foundation-env` — Env template exists
- `gate:foundation-structure` — Expected directories exist

All gates must pass before proceeding.

## Exit Condition
Foundation is running. All Phase 4 gates pass. Summarize what was set up and ask user to continue to **Phase 5**.
