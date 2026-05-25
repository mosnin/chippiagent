# 21 Validation Gates

> **TL;DR:** Machine-checkable structural assertions that run after each build phase. Catches drift, missing states, and spec violations before they compound.
> **Covers:** per-phase checks, gate commands, pass criteria, regression testing, custom gates | **Depends on:** 09 | **Used by:** all phase files | **Phase:** 4–14

## Purpose

Quality gates in `09_build_rules_internal.md` are prose ("all pages handle loading, empty, success, error states"). This file converts them into **commands Claude can actually run** after each phase. Not unit tests — structural smoke checks that verify the built code matches what the framework spec requires.

## How to Run

After completing each build phase:

1. Run **all gates for that phase**
2. Run **regression gates** from previous phases (re-run Phase 4 gates even when you're in Phase 9)
3. If any gate fails → fix before presenting the phase as complete
4. Present the gate results summary to the user alongside the phase summary

### Gate Result Format

```
## Validation Gates — Phase [N]

### Phase [N] Gates
- ✅ [gate-name]: [description] — PASS
- ❌ [gate-name]: [description] — FAIL: [what's wrong]

### Regression (Phases 4–[N-1])
- ✅ All [X] prior gates passing
  OR
- ❌ [gate-name]: REGRESSION — [what broke]
```

## Gate Escalation

If a gate fails:
1. **Fix the issue immediately** — do not skip
2. **Re-run the failed gate** to confirm the fix
3. **Re-run regression gates** to confirm the fix didn't break prior work
4. Only then present the phase as complete

If a gate is genuinely inapplicable (e.g., no Stripe in v1), document the skip with a reason — don't silently ignore.

## Gate Interpretation Rules

These gates are **structural smoke checks**, not unit tests. They verify that expected files, patterns, and structures exist. They cannot verify logical correctness.

**Pass/fail determination:**
- **Bash command gates**: Pass if exit code is 0 AND output matches the described pass criteria
- **Grep-based gates**: Pass if grep finds at least one match in production code (not comments). If a grep match appears only in a comment, it's a false positive — verify manually.
- **File existence gates**: Pass if the specified file/directory exists and is non-empty

**When in doubt:** If a gate result is ambiguous, inspect the matched code manually. The goal is catching missing structure, not proving correctness.

---

## Phase 4 — Foundation Gates

### gate:foundation-builds
**What:** Project compiles without errors.
```bash
npx tsc --noEmit 2>&1 | tail -5
```
**Pass:** Exit code 0, no errors.
**Common failure:** Missing type imports, unresolved module paths.

### gate:foundation-schema
**What:** Prisma schema is valid and contains expected entities.
```bash
npx prisma validate 2>&1
```
**Pass:** "The schema at prisma/schema.prisma is valid."
**Common failure:** Missing relations, invalid field types.

### gate:foundation-entities
**What:** All entities from the architecture plan exist in the schema.
```bash
grep -c "^model " prisma/schema.prisma
```
**Pass:** Count matches the number of entities in the architecture plan. At minimum: User, Organization, Membership, Subscription.
**Common failure:** App-specific entities forgotten.

### gate:foundation-env
**What:** Environment template exists with required variables.
```bash
cat .env.example 2>/dev/null || cat .env.local.example 2>/dev/null || echo "NO ENV TEMPLATE"
```
**Pass:** File exists and contains DATABASE_URL at minimum.
**Common failure:** No env template, secrets hardcoded.

### gate:foundation-structure
**What:** Expected directory structure exists.
```bash
ls -d src/app src/lib src/components prisma 2>&1
```
**Pass:** All four directories exist.
**Common failure:** Flat structure without separation.

---

## Phase 5 — Auth Gates

### gate:auth-routes
**What:** All auth route handlers exist.
```bash
ls src/app/api/auth/*/route.ts 2>/dev/null || ls src/app/api/auth/*/route.tsx 2>/dev/null || echo "NO AUTH ROUTES"
```
**Pass:** At minimum: login, signup (or register), forgot-password (or reset-password), verify-email routes exist.
**Common failure:** Missing password reset or email verification route.

### gate:auth-pages
**What:** Auth page components exist.
```bash
find src/app -path "*/login/page.tsx" -o -path "*/signup/page.tsx" -o -path "*/forgot-password/page.tsx" 2>/dev/null
```
**Pass:** At least login and signup pages exist.
**Common failure:** Pages exist but under wrong route group.

### gate:auth-middleware
**What:** Auth middleware or route protection exists.
```bash
find src/ -name "middleware.ts" -o -name "middleware.tsx" | head -5
grep -rl "getSession\|getServerSession\|auth()\|getUser\|currentUser\|validateSession" src/lib/ src/middleware* 2>/dev/null | head -5
```
**Pass:** Middleware file exists AND at least one auth helper function found.
**Common failure:** Auth pages exist but no middleware protecting routes.

### gate:auth-password-hashing
**What:** Password hashing is used, not plain text.
```bash
grep -r "bcrypt\|argon2\|scrypt\|hashPassword\|hash(" src/lib/ src/app/api/auth/ 2>/dev/null | head -5
```
**Pass:** At least one hashing reference found.
**Common failure:** Storing plain text passwords.

### gate:auth-no-secrets-exposed
**What:** No secrets in client-side code.
```bash
grep -r "process\.env\." src/app/ --include="*.tsx" --include="*.ts" | grep -v "NEXT_PUBLIC_" | grep -v "server" | grep -v "api/" | grep -v "layout" | head -10
```
**Pass:** No server-only env vars referenced in client components. (Some false positives from server components are OK — inspect manually if flagged.)
**Common failure:** DATABASE_URL or API secrets in client code.

---

## Phase 6 — Onboarding Gates

### gate:onboarding-flow
**What:** Onboarding route/page exists.
```bash
find src/app -path "*onboarding*" -name "page.tsx" 2>/dev/null
```
**Pass:** At least one onboarding page found.
**Common failure:** Onboarding logic crammed into the signup page instead of its own flow.

### gate:onboarding-completion-flag
**What:** User model tracks onboarding completion.
```bash
grep -i "onboard\|hasCompleted\|setupComplete\|isOnboarded" prisma/schema.prisma
```
**Pass:** At least one field found that tracks completion state.
**Common failure:** No persistent flag — onboarding re-shows on every login.

### gate:onboarding-redirect
**What:** Non-onboarded users are redirected to onboarding.
```bash
grep -r "onboarding\|onboard" src/middleware* src/lib/ 2>/dev/null | head -10
```
**Pass:** Middleware or layout logic references onboarding check.
**Common failure:** Users can skip onboarding by navigating directly to dashboard.

---

## Phase 7 — App Shell Gates

### gate:shell-layout
**What:** Authenticated layout with shell components exists.
```bash
find src/app -path "*(authenticated)*" -name "layout.tsx" 2>/dev/null || find src/app -path "*(app)*" -name "layout.tsx" 2>/dev/null
```
**Pass:** At least one authenticated layout file found.
**Common failure:** No route group for authenticated pages.

### gate:shell-sidebar
**What:** Sidebar/navigation component exists.
```bash
find src/components -iname "*sidebar*" -o -iname "*nav*" -o -iname "*navigation*" 2>/dev/null | head -5
```
**Pass:** At least one sidebar or navigation component found.
**Common failure:** Navigation only in the top bar, no sidebar.

### gate:shell-responsive
**What:** Mobile drawer/responsive behavior implemented.
```bash
grep -r "lg:\|md:\|drawer\|Sheet\|mobile" src/components/ --include="*.tsx" 2>/dev/null | head -10
```
**Pass:** Responsive breakpoint classes or drawer component found in shell components.
**Common failure:** Desktop-only shell with no mobile adaptation.

### gate:shell-dark-mode
**What:** Dark mode token support configured.
```bash
grep -r "dark:" src/app/ src/components/ --include="*.tsx" 2>/dev/null | head -5
grep -r "darkMode\|dark-mode\|class.*dark" tailwind.config* 2>/dev/null | head -3
```
**Pass:** `dark:` Tailwind variants found in components AND dark mode configured in Tailwind config.
**Common failure:** Tailwind dark mode not enabled in config.

### gate:shell-page-header
**What:** Reusable page header component exists.
```bash
find src/components -iname "*page*header*" -o -iname "*PageHeader*" 2>/dev/null | head -3
```
**Pass:** Page header component found.
**Common failure:** Each page implements its own header instead of reusing a shared component.

---

## Phase 8 — Dashboard Gates

### gate:dashboard-page
**What:** Dashboard route exists.
```bash
find src/app -path "*dashboard*" -name "page.tsx" 2>/dev/null
```
**Pass:** Dashboard page found under authenticated route group.
**Common failure:** Dashboard at root `/` instead of `/dashboard`.

### gate:dashboard-four-states
**What:** Dashboard implements loading, empty, success, and error states.
```bash
# Check for loading state
grep -l "loading\|skeleton\|Skeleton\|Suspense" src/app/*dashboard*/*.tsx src/app/*/dashboard*/*.tsx 2>/dev/null | head -3
# Check for empty state
grep -rl "empty\|no data\|get started\|No .* yet" src/app/*dashboard*/ src/app/*/dashboard*/ 2>/dev/null | head -3
# Check for error state
grep -rl "error\|Error\|retry\|try again" src/app/*dashboard*/ src/app/*/dashboard*/ 2>/dev/null | head -3
```
**Pass:** Evidence of all three non-success states found (success state is implied if the page renders data).
**Common failure:** Only success state implemented. Empty and error states missing.

### gate:dashboard-metrics
**What:** Dashboard includes summary metrics.
```bash
grep -r "metric\|stat\|count\|total\|summary\|KPI\|trend" src/app/*dashboard*/ src/app/*/dashboard*/ src/components/*dashboard* 2>/dev/null | head -10
```
**Pass:** Metric/stat references found.
**Common failure:** Dashboard is just a list view without summary metrics.

---

## Phase 9 — Core Features Gates

### gate:features-exist
**What:** All feature modules from the feature spec have corresponding routes.
```bash
find src/app -path "*(authenticated)*" -name "page.tsx" 2>/dev/null | grep -v dashboard | grep -v settings | grep -v admin | grep -v onboarding
```
**Pass:** Count matches the number of core features in `docs/project/02_feature_spec.md`.
**Common failure:** Features partially built or routes missing.

### gate:features-four-states
**What:** Every feature module handles loading, empty, success, and error states.
```bash
# For each feature directory, check all four states
for dir in $(find src/app -path "*(authenticated)*" -type d -name "[a-z]*" | grep -v dashboard | grep -v settings | grep -v admin | grep -v onboarding | grep -v components); do
  echo "=== $dir ==="
  echo "Loading: $(grep -rl 'loading\|skeleton\|Skeleton\|Suspense' "$dir" 2>/dev/null | wc -l) files"
  echo "Empty: $(grep -rl 'empty\|No .* yet\|get started' "$dir" 2>/dev/null | wc -l) files"
  echo "Error: $(grep -rl 'error\|Error.*boundary\|retry\|try again' "$dir" 2>/dev/null | wc -l) files"
done
```
**Pass:** Every feature directory has at least 1 file for each state.
**Common failure:** Happy path only — no empty or error states.

### gate:features-permissions
**What:** Permission checks exist in feature API routes.
```bash
grep -rl "permission\|authorize\|canAccess\|role\|isAdmin\|isMember\|forbidden\|403" src/app/api/ 2>/dev/null | wc -l
```
**Pass:** Permission references found in API routes (count > 0 for each feature API).
**Common failure:** API routes return data without checking user role or ownership.

### gate:features-org-isolation
**What:** Database queries filter by organization for multi-tenancy.
```bash
grep -r "organization_id\|organizationId\|orgId\|where.*org" src/app/api/ src/lib/ --include="*.ts" 2>/dev/null | head -15
```
**Pass:** Organization filtering present in data queries.
**Common failure:** Users can access other organizations' data by manipulating IDs.

### gate:features-validation
**What:** Forms have client-side validation.
```bash
grep -r "required\|validate\|zodSchema\|z\.object\|z\.string\|useForm\|formState.*errors" src/app/ src/components/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -15
```
**Pass:** Validation library usage or required attributes found in form components.
**Common failure:** Forms submit without validation, relying entirely on server-side checks.

---

## Phase 10 — Settings & Billing Gates

### gate:settings-pages
**What:** Settings route group with expected sub-pages exists.
```bash
find src/app -path "*settings*" -name "page.tsx" 2>/dev/null
```
**Pass:** At least profile and billing settings pages exist.
**Common failure:** Settings is a single monolithic page.

### gate:billing-stripe
**What:** Stripe integration code exists.
```bash
grep -r "stripe\|Stripe\|STRIPE_" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -10
```
**Pass:** Stripe SDK or API references found.
**Common failure:** Billing page exists but no actual Stripe integration.

### gate:billing-webhook
**What:** Stripe webhook endpoint exists.
```bash
find src/app/api -path "*webhook*" -name "route.ts" 2>/dev/null
grep -r "stripe.*webhook\|constructEvent\|webhook.*secret" src/app/api/ 2>/dev/null | head -5
```
**Pass:** Webhook route exists with signature verification.
**Common failure:** Webhook endpoint missing or doesn't verify signatures.

### gate:settings-permissions
**What:** Settings routes enforce appropriate roles.
```bash
grep -r "admin\|owner\|permission\|role\|authorize" src/app/*settings*/ src/app/*/settings*/ 2>/dev/null | head -10
```
**Pass:** Role checks found (billing/team settings restricted to admin+).
**Common failure:** Any member can modify billing or delete workspace.

---

## Phase 11 — Admin Gates

### gate:admin-routes
**What:** Admin route group exists with protection.
```bash
find src/app -path "*admin*" -name "page.tsx" 2>/dev/null
```
**Pass:** Admin pages found.
**Common failure:** Admin routes exist but under the regular authenticated group without extra protection.

### gate:admin-middleware
**What:** Admin routes are middleware-protected, not just UI-hidden.
```bash
grep -r "admin\|isAdmin\|role.*admin\|ADMIN" src/middleware* src/app/*admin*/layout* src/app/*/admin*/layout* 2>/dev/null | head -5
```
**Pass:** Admin role check in middleware or layout, not just conditional rendering.
**Common failure:** Nav hides admin link but the route is accessible to any authenticated user.

### gate:admin-audit-log
**What:** Admin actions are logged.
```bash
grep -r "auditLog\|adminLog\|logAction\|AdminRecord\|adminAction" src/app/api/ src/lib/ 2>/dev/null | head -5
```
**Pass:** Logging references found in admin API routes.
**Common failure:** Admin can delete users without any record of the action.

---

## Phase 12 — Email Gates

### gate:email-templates
**What:** Email template components exist.
```bash
find src/ -path "*email*" -o -path "*mail*" | grep -i "template\|component\|tsx\|html" | head -10
```
**Pass:** Email template files found for auth, billing, and onboarding categories.
**Common failure:** Email "templates" are just inline strings in API routes.

### gate:email-plain-text
**What:** Plain text fallbacks exist.
```bash
grep -r "text:\|plainText\|text/plain\|textContent" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -i "mail\|email\|send" | head -5
```
**Pass:** Plain text versions referenced in email sending logic.
**Common failure:** HTML only — breaks in email clients with HTML disabled.

### gate:email-send-function
**What:** Centralized email sending utility exists.
```bash
find src/lib -iname "*email*" -o -iname "*mail*" -o -iname "*send*" 2>/dev/null | head -5
grep -r "sendEmail\|sendMail\|resend\|sendgrid\|SES" src/lib/ 2>/dev/null | head -5
```
**Pass:** Centralized email helper found (not raw API calls scattered in route handlers).
**Common failure:** Each route handler implements its own email sending logic.

---

## Phase 13 — Marketing Gates

### gate:marketing-pages
**What:** Core public pages exist.
```bash
find src/app -path "*(public)*" -name "page.tsx" 2>/dev/null || find src/app -path "*(marketing)*" -name "page.tsx" 2>/dev/null
ls src/app/page.tsx 2>/dev/null
```
**Pass:** At minimum: home page and pricing page exist.
**Common failure:** Marketing pages missing — only the app exists.

### gate:marketing-responsive
**What:** Marketing pages use responsive classes.
```bash
grep -r "sm:\|md:\|lg:\|xl:" src/app/*public*/ src/app/*marketing*/ src/app/page.tsx 2>/dev/null | wc -l
```
**Pass:** Significant number of responsive utility classes found (> 20).
**Common failure:** Fixed-width marketing layout.

### gate:marketing-cta
**What:** CTAs link to signup/login.
```bash
grep -r "signup\|sign-up\|register\|login\|get.started\|start.free\|/auth" src/app/*public*/ src/app/*marketing*/ src/app/page.tsx 2>/dev/null | head -10
```
**Pass:** CTA links pointing to auth routes found.
**Common failure:** CTAs are placeholder `#` links.

### gate:marketing-separate-tokens
**What:** Marketing site uses public design tokens, not internal product tokens.
```bash
# This is a heuristic — check that public pages don't import internal-only components
grep -r "from.*components/app\|from.*components/dashboard\|from.*components/admin" src/app/*public*/ src/app/*marketing*/ 2>/dev/null | head -5
```
**Pass:** No internal component imports found in public pages.
**Common failure:** Marketing pages reuse internal app components with wrong visual density.

---

## Phase 14 — Polish Gates

### gate:typescript-clean
**What:** Full TypeScript compilation passes.
```bash
npx tsc --noEmit 2>&1 | tail -10
```
**Pass:** Exit code 0, zero errors.
**Common failure:** Type errors accumulated across phases.

### gate:no-any-types
**What:** No `any` types in production code.
```bash
grep -rn ": any\|as any\|<any>" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.test\.\|\.spec\." | head -10
```
**Pass:** Zero results (or only in test files).
**Common failure:** Quick `any` casts added during development and never cleaned up.

### gate:no-console-logs
**What:** No stray console.log statements in production code.
```bash
grep -rn "console\.log" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.test\.\|\.spec\." | head -10
```
**Pass:** Zero results (console.error and console.warn are acceptable).
**Common failure:** Debug logs left in from development.

### gate:all-states-audit
**What:** Every authenticated page handles all four states.
```bash
for dir in $(find src/app -path "*(authenticated)*" -type d -mindepth 2 -maxdepth 3 | grep -v components); do
  loading=$(grep -rl 'loading\|skeleton\|Skeleton\|Suspense' "$dir" 2>/dev/null | wc -l)
  empty=$(grep -rl 'empty\|No .* yet\|get started\|nothing' "$dir" 2>/dev/null | wc -l)
  error=$(grep -rl 'error\|Error\|retry\|try again' "$dir" 2>/dev/null | wc -l)
  if [ "$loading" -eq 0 ] || [ "$empty" -eq 0 ] || [ "$error" -eq 0 ]; then
    echo "❌ $dir — loading:$loading empty:$empty error:$error"
  fi
done
```
**Pass:** No output (all directories have all three states).
**Common failure:** Several pages missing empty or error states.

### gate:accessibility-basics
**What:** Basic accessibility attributes present.
```bash
# Check for alt text on images
grep -r "<img\|<Image" src/ --include="*.tsx" 2>/dev/null | grep -v "alt=" | head -5
# Check for aria labels on interactive elements
grep -r "aria-label\|aria-describedby\|role=" src/components/ --include="*.tsx" 2>/dev/null | wc -l
```
**Pass:** No images without alt text. Aria attribute count > 0.
**Common failure:** Images without alt text, buttons without accessible names.

### gate:full-regression
**What:** Re-run every gate from Phases 4–13.
**Pass:** All prior gates still pass.
**Common failure:** Later phases broke earlier guarantees (e.g., new feature introduced a TypeScript error, or a refactor removed an auth middleware import).

---

## Adding Custom Gates

During **Phase 3 (Architecture)**, define app-specific gates based on the entities and features identified. Add them to `docs/project/custom_gates.md`.

### Template for Custom Gates

```markdown
### gate:[feature]-[check-name]
**What:** [1-2 sentence description]
```bash
[command to run]
```
**Pass:** [expected output]
**Common failure:** [what typically goes wrong]
```

### Examples of Custom Gates

**For a project management app:**
```markdown
### gate:projects-kanban
**What:** Kanban board component handles drag-and-drop.
```bash
grep -r "dnd\|draggable\|Draggable\|useDrag\|onDragEnd" src/app/*projects*/ src/components/*kanban* 2>/dev/null
```
**Pass:** Drag-and-drop library references found.
**Common failure:** Kanban board is static — no drag-and-drop.
```

**For a multi-tenant SaaS:**
```markdown
### gate:tenant-isolation
**What:** Every Prisma query that returns user data includes organization filter.
```bash
grep -rn "prisma\.\w*\.find" src/ --include="*.ts" | grep -v "organization" | grep -v "user\.find" | head -10
```
**Pass:** No unfiltered queries (except user lookups by auth token).
**Common failure:** Some queries fetch across all organizations.
```

### When to Define Custom Gates

- After architecture plan is confirmed (Phase 3)
- When a unique feature requires specialized verification
- When the user identifies specific quality concerns
- When a non-standard integration (beyond Stripe) needs validation

---

## Gate Summary by Phase

| Phase | # Gates | Focus |
|-------|---------|-------|
| 4 Foundation | 5 | Build compiles, schema valid, structure exists |
| 5 Auth | 5 | Routes exist, middleware works, no secrets exposed |
| 6 Onboarding | 3 | Flow exists, completion tracked, redirect works |
| 7 App Shell | 5 | Layout exists, responsive, dark mode, reusable header |
| 8 Dashboard | 3 | Page exists, four states, metrics present |
| 9 Core Features | 5 | All features exist, four states, permissions, validation |
| 10 Settings | 4 | Pages exist, Stripe integrated, webhooks, permissions |
| 11 Admin | 3 | Routes protected, middleware-level, audit logging |
| 12 Email | 3 | Templates exist, plain text fallbacks, centralized sending |
| 13 Marketing | 4 | Pages exist, responsive, CTAs work, separate tokens |
| 14 Polish | 6 | TypeScript clean, no any, no console.log, all states, a11y, full regression |
| **Total** | **46** | |
