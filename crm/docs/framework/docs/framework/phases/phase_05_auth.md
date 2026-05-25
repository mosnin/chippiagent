# Phase 5 — Auth

## Trigger
Foundation (Phase 4) is complete.

## Files to Read
- `docs/framework/internal/02_auth_and_onboarding.md` — auth sections only

## What to Build

### Auth Pages
- Login page
- Signup page
- Password reset (request + confirm)
- Email verification

### Auth Infrastructure
- Session management (JWT or session-based)
- Auth middleware for protected routes
- Password hashing and validation
- Email sending for verification and reset

### Route Protection
- Protected route wrapper component
- Redirect logic for unauthenticated users
- Role-aware route guards (basic — refined in later phases)

### Verify
- Signup → email verification → login flow works end-to-end
- Password reset flow works
- Protected routes redirect to login
- Session persists across page refreshes

### Run Validation Gates
Run all Phase 5 gates from `docs/framework/internal/21_validation_gates.md`:
- `gate:auth-routes` — All auth API routes exist
- `gate:auth-pages` — Login and signup pages exist
- `gate:auth-middleware` — Auth middleware protects routes
- `gate:auth-password-hashing` — Passwords are hashed
- `gate:auth-no-secrets-exposed` — No server secrets in client code

Plus regression: re-run all Phase 4 gates.

## Exit Condition
Auth flows are functional. All gates pass. Summarize and ask user to continue to **Phase 6**.
