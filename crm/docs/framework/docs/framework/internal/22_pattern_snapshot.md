# 22 Pattern Snapshot System

> **TL;DR:** Defines a generated reference file that captures exact code conventions from the first built phases, ensuring every subsequent phase and sub-agent produces structurally identical code.
> **Covers:** snapshot generation, extraction commands, agent consumption rules, freshness policy, canonical template | **Depends on:** 09 | **Used by:** 04, 08, 09, 11 | **Phase:** 7 (generate), 9 (update)

## Purpose

By Phase 9 (Core Features), Claude's context has shifted from the foundational phases. Feature module 4 ends up looking different from feature module 1. Import paths drift. API route structure changes. Component usage becomes inconsistent.

The Pattern Snapshot System solves this by generating a single reference file — `docs/project/pattern_snapshot.md` — that captures the exact conventions established in the first built code. Every subsequent phase and every sub-agent reads from this one canonical source before writing any code.

---

## When to Generate

The snapshot is generated at the **end of Phase 7 (App Shell)**, because by then all foundational patterns are established:

- **Phase 4** set up the project structure, Prisma schema, and utility patterns
- **Phase 5** established auth middleware and API route patterns
- **Phase 6** built the onboarding flow and first form patterns
- **Phase 7** built the shell components and design token usage

The snapshot is **updated (not regenerated)** at the end of **Phase 9 (Core Features)** to add the Feature Module Template section. Only the new section is appended; existing sections are left intact unless a pattern was intentionally refactored during Phase 9.

---

## Where to Write

```
docs/project/pattern_snapshot.md
```

This file lives in project docs (app-specific), not in framework docs. It is subject to the same source-of-truth hierarchy as other project files — it takes highest priority when it conflicts with framework defaults.

---

## What to Capture

The snapshot contains eight sections. Each section captures a specific convention with real code extracted from the built project. Instructions for extracting each section follow.

### A. Project Structure Convention

**What:** The exact directory layout under `src/`, showing where components, API routes, types, utilities, and config files live.

**How to extract:**

**Directory extraction:** Run `find . -type d -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' -maxdepth 4 | sort` to capture both `src/` and `app/` directory structures. Include maxdepth 4 to capture feature module subdirectories.

Capture the full output. Annotate each top-level directory with its purpose. Example annotations:

- `src/app/(authenticated)/` — all logged-in pages
- `src/app/(public)/` — marketing and auth pages
- `src/app/api/` — API route handlers
- `src/components/ui/` — shared UI primitives
- `src/components/shell/` — app shell components
- `src/lib/` — shared utilities and config
- `src/types/` — shared TypeScript types

### B. Import Path Map

**What:** The canonical import paths for every shared module. This prevents `../../lib/auth` vs `@/lib/auth` drift.

**How to extract:**

**Import path extraction:** Check both `@/` alias and relative imports: `grep -rh "from ['\"]" src/ app/ --include='*.ts' --include='*.tsx' | head -20`. This captures the actual import convention regardless of alias configuration.

Organize the output into categories:

- **Auth:** `@/lib/auth`, `@/lib/session`
- **Database:** `@/lib/prisma`, `@/lib/db`
- **UI Components:** `@/components/ui/button`, `@/components/ui/card`, etc.
- **Shell Components:** `@/components/shell/sidebar`, `@/components/shell/top-bar`, etc.
- **Utilities:** `@/lib/utils`, `@/lib/validators`, `@/lib/constants`
- **Types:** `@/types/user`, `@/types/api`, etc.

### C. API Route Pattern

**What:** The exact structure of an API route handler — how it validates input, checks auth, checks permissions, queries the database, handles errors, and returns a response.

**How to extract:**

**'Non-trivial' API route:** Skip auth routes (login, signup, password reset) — these follow fixed patterns. Read the first feature-related API route (e.g., a CRUD endpoint for a core entity). If no feature routes exist yet (Phase 7), document the auth route pattern as a placeholder and update in Phase 9.

1. Read the first non-trivial API route (see above for selection criteria).
2. Extract the complete handler function.
3. Annotate each section of the handler.

The snapshot must include the full handler code as a **canonical template**, with comments marking:

```
// 1. Parse and validate request body
// 2. Authenticate the request (if protected route)
// 3. Check permissions (role/org scoping)
// 4. Execute database query
// 5. Return structured response
// 6. Error handling (catch block)
```

Also capture:
- The exact response shape: `{ data, error, message }` or whatever convention was established
- HTTP status code usage conventions
- How validation errors are returned (field-level vs generic)

### D. Component Usage Patterns

**What:** How the established shell and UI components are used in pages. This prevents pages from reimplementing layout or skipping state handling.

**How to extract:**

**Which pages to sample:** Read the dashboard page and one settings/form page — these represent the two main patterns (data display and form input). If patterns differ, document both as named variants (e.g., 'Data Page Pattern' and 'Form Page Pattern').

1. Read the sampled pages from `src/app/(authenticated)/` built in Phases 7–8.
2. Extract the patterns for:

- **Page wrapper:** How the shell layout wraps page content (exact import + JSX)
- **Page header:** How the page header component is invoked (exact props)
- **Loading state:** How `loading.tsx` files are structured
- **Error state:** How `error.tsx` files are structured
- **Empty state:** How empty states are rendered when a list has no items
- **Data fetching:** Whether pages use server components with `async` or client components with `useEffect`/SWR

Include the real code for each pattern.

### E. Prisma Query Patterns

**What:** How database queries are structured — filtering by organization, using transactions, structuring includes/selects.

**How to extract:**

```bash
grep -rn "prisma\." src/ --include="*.ts" | head -30
```

Then read the files containing the most representative queries. Capture:

- **Scoped queries:** How every query filters by `organizationId` (or equivalent tenant scope)
- **Includes:** The convention for eager loading relations (`include` vs `select`)
- **Transactions:** How `prisma.$transaction()` is used for multi-step writes
- **Error handling:** How Prisma errors (unique constraint, not found) are caught and mapped to HTTP responses

Include 1–2 real query examples verbatim.

### F. Form Patterns

**What:** How forms handle validation, submission, loading state, and error display.

**How to extract:**

1. Find form components built in Phases 5–6 (login, signup, onboarding):
   ```bash
   find src/ -name "*.tsx" | xargs grep -l "onSubmit\|handleSubmit\|useForm" | head -5
   ```
2. Extract the pattern for:

- **Client component declaration:** `"use client"` placement
- **Form state management:** React Hook Form, `useState`, or server actions
- **Validation approach:** Zod schema, inline validation, or HTML5 attributes
- **Submission handler:** API call pattern, loading state toggle, error handling
- **Error display:** How field-level and form-level errors render
- **Success handling:** Redirect, toast, or state update after success

Include one complete form component as the canonical reference.

### G. File Naming Conventions

**What:** The exact naming conventions used for files and exports.

**How to extract:**

```bash
# Component files
find src/components/ -name "*.tsx" | head -15

# Route segments
find src/app/ -type d -maxdepth 4 | sort

# Type files
find src/types/ -name "*.ts" | head -10

# Lib files
find src/lib/ -name "*.ts" | head -10
```

Document:
- **Component files:** PascalCase (`Button.tsx`) or kebab-case (`button.tsx`)?
- **Component exports:** Named exports or default exports?
- **Route segments:** kebab-case (`user-settings`) or camelCase?
- **Type files:** Singular (`user.ts`) or plural (`users.ts`)?
- **Utility files:** What naming convention (`formatDate.ts` vs `date.ts` vs `format-date.ts`)?
- **Barrel exports:** Are `index.ts` files used? Where?

### H. Feature Module Template (Added After Phase 9)

**What:** The complete directory structure and file inventory of the first feature module built in Phase 9. This becomes the blueprint for all subsequent feature modules.

**How to extract:**

After the first feature module is built in Phase 9:

```bash
# Replace [feature] with the actual feature directory name
find src/app/(authenticated)/[feature]/ -type f | sort
find src/components/[feature]/ -type f 2>/dev/null | sort
find src/lib/[feature]/ -type f 2>/dev/null | sort
```

Capture:
- **Directory layout:** The full tree of the feature module
- **File list with purposes:** Each file and its role (list page, detail page, form, API route, types, utils)
- **Route structure:** The route segments and how they map to pages
- **Component breakdown:** Which components are feature-specific vs shared
- **Data flow:** How data moves from API → page → components

Include the actual file tree and a brief annotation of each file.

---

## How to Generate (Step-by-Step)

At the end of Phase 7, Claude must execute these steps:

1. **Announce:** "Generating the pattern snapshot from established code conventions."
2. **Extract each section** using the commands and instructions above.
3. **Write the snapshot** to `docs/project/pattern_snapshot.md` using the template below.
4. **Verify completeness:** Every section must contain real code references, not placeholders.
5. **Report:** "Pattern snapshot generated. All future phases will reference this file for code consistency."

At the end of Phase 9, Claude must:

1. **Read** the existing snapshot.
2. **Extract** the Feature Module Template (Section H) from the first built feature.
3. **Append** Section H to the snapshot.
4. **Update** the `Last updated` marker to `Phase 9`.
5. **Update** any sections where the pattern was intentionally changed during Phase 9.

---

## How Agents Use It

### Mandatory Read Rule

Every sub-agent dispatched in **Phase 9 or later** MUST read `docs/project/pattern_snapshot.md` before writing any code. This is non-negotiable. The snapshot is listed as a required read in agent prompts alongside the relevant project docs.

### Agent Prompt Integration

When dispatching a sub-agent for a feature module, the prompt must include:

```
Before writing any code, read these files:
1. docs/project/pattern_snapshot.md — canonical code conventions
2. docs/project/02_feature_spec.md — what to build
3. docs/project/06_permissions_matrix.md — access rules
```

### Fallback When Snapshot Is Missing

If `docs/project/pattern_snapshot.md` does not exist (e.g., phases were run out of order or the snapshot step was skipped), the agent must:

1. Read `src/app/(authenticated)/dashboard/page.tsx` for page structure and component usage
2. Read one API route from `src/app/api/` for the route handler pattern
3. Read one form component for form conventions

These three files provide enough signal to infer the project's conventions. The agent should note in its output that no snapshot was found and that patterns were inferred from existing code.

### Conflict Resolution

If the snapshot contradicts a framework file (e.g., `08_ui_system_internal.md`), the snapshot wins. The snapshot reflects what was actually built. The framework file reflects what was planned. Built code is the higher authority — this follows the source-of-truth hierarchy where `docs/project/*` overrides `docs/framework/internal/*`.

---

## Snapshot Freshness

### Last Updated Marker

The snapshot includes a metadata block at the top:

```markdown
<!-- Pattern Snapshot Metadata -->
<!-- Last updated: Phase 7 -->
<!-- Generated by: Claude Code -->
<!-- Project: [App Name] -->
<!-- version: 1 -->
```

**Snapshot versioning:** Include a version counter in metadata: `version: 1` (Phase 7), `version: 2` (Phase 9 update). Increment on each update. This allows agents to verify they have the latest snapshot.

This marker is updated whenever the snapshot changes.

### Source File References

Every section includes a `Source file:` line pointing to the file the pattern was extracted from. If the source file is later refactored, the snapshot can be re-extracted from the updated source.

### When to Update

- **End of Phase 7:** Initial generation (all sections except H)
- **End of Phase 9:** Add Section H (Feature Module Template), update any changed patterns
- **After any intentional refactor:** If a pattern is changed on purpose (not drift), update the relevant snapshot section immediately
- **Never update for drift:** If code drifts from the snapshot, fix the code — not the snapshot. The snapshot is the authority.

---

## Canonical Snapshot Template

Below is the exact structure Claude must produce when generating `docs/project/pattern_snapshot.md`. Placeholder content shows the expected format.

````markdown
# Pattern Snapshot

<!-- Pattern Snapshot Metadata -->
<!-- Last updated: Phase 7 -->
<!-- Generated by: Claude Code -->
<!-- Project: [App Name] -->

> This file captures the exact code conventions established in Phases 4–7. Every subsequent phase must follow these patterns. If you are a sub-agent, read this file completely before writing any code.

---

## A. Project Structure

```
src/
├── app/
│   ├── (authenticated)/
│   │   ├── dashboard/
│   │   ├── settings/
│   │   └── layout.tsx
│   ├── (public)/
│   │   ├── login/
│   │   ├── signup/
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/
│   │   └── webhooks/
│   └── layout.tsx
├── components/
│   ├── shell/
│   │   ├── sidebar.tsx
│   │   ├── top-bar.tsx
│   │   └── page-header.tsx
│   └── ui/
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── badge.tsx
├── lib/
│   ├── auth.ts
│   ├── prisma.ts
│   ├── utils.ts
│   ├── validators.ts
│   └── constants.ts
└── types/
    ├── user.ts
    ├── api.ts
    └── database.ts
```

---

## B. Import Path Map

### Auth & Session
```typescript
import { getCurrentUser, requireAuth } from "@/lib/auth"
import { getSession } from "@/lib/session"
```

### Database
```typescript
import { prisma } from "@/lib/prisma"
```

### UI Components
```typescript
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
```

### Shell Components
```typescript
import { PageHeader } from "@/components/shell/page-header"
import { Sidebar } from "@/components/shell/sidebar"
```

### Utilities
```typescript
import { formatDate, formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
```

### Types
```typescript
import type { User, UserRole } from "@/types/user"
import type { ApiResponse, ApiError } from "@/types/api"
```

---

## C. API Route Pattern

**Source file:** `src/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const requestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      )
    }

    // 2. Execute business logic
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    // 3. Return structured response
    return NextResponse.json({ data: { user: { id: user.id, email: user.email } } })
  } catch (error) {
    // 4. Error handling
    console.error("[POST /api/auth/login]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Conventions established:**
- Response shape: `{ data }` on success, `{ error, details? }` on failure
- Validation: Zod schemas defined above the handler
- Error logging: `[METHOD /path]` prefix
- Status codes: 200 success, 422 validation, 401 auth, 403 permission, 404 not found, 500 server error

---

## D. Component Usage Patterns

### Page Structure

**Source file:** `src/app/(authenticated)/dashboard/page.tsx`

```typescript
import { PageHeader } from "@/components/shell/page-header"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  const user = await getCurrentUser()

  const data = await prisma.someEntity.findMany({
    where: { organizationId: user.organizationId },
  })

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your workspace"
      />
      <div className="p-6">
        {/* Page content */}
      </div>
    </div>
  )
}
```

### Loading State

**Source file:** `src/app/(authenticated)/dashboard/loading.tsx`

```typescript
import { PageHeader } from "@/components/shell/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your workspace" />
      <div className="p-6 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}
```

### Error State

**Source file:** `src/app/(authenticated)/dashboard/error.tsx`

```typescript
"use client"

import { ErrorBlock } from "@/components/ui/error-block"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBlock
      title="Something went wrong"
      message="We couldn't load your dashboard. Please try again."
      onRetry={reset}
    />
  )
}
```

### Empty State

```typescript
import { EmptyState } from "@/components/ui/empty-state"

// Inside a list component:
if (items.length === 0) {
  return (
    <EmptyState
      title="No projects yet"
      description="Create your first project to get started."
      action={{ label: "Create Project", href: "/projects/new" }}
    />
  )
}
```

---

## E. Prisma Query Patterns

**Source file:** `src/lib/queries/[entity].ts`

### Scoped Query (Always Filter by Organization)
```typescript
const projects = await prisma.project.findMany({
  where: { organizationId: user.organizationId },
  orderBy: { createdAt: "desc" },
  include: { owner: { select: { id: true, name: true, email: true } } },
})
```

### Transaction
```typescript
const result = await prisma.$transaction(async (tx) => {
  const project = await tx.project.create({
    data: { name, organizationId: user.organizationId, ownerId: user.id },
  })
  await tx.activityLog.create({
    data: { action: "project.created", entityId: project.id, userId: user.id },
  })
  return project
})
```

### Error Handling
```typescript
import { Prisma } from "@prisma/client"

try {
  await prisma.entity.create({ data })
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Already exists" }, { status: 409 })
    }
  }
  throw error
}
```

---

## F. Form Patterns

**Source file:** `src/app/(public)/login/login-form.tsx`

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export function LoginForm() {
  const router = useRouter()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})
    setFormError(null)

    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData)
    const parsed = loginSchema.safeParse(data)

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors).map(
            ([k, v]) => [k, v?.[0] ?? ""]
          )
        )
      )
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      })

      if (!res.ok) {
        const { error } = await res.json()
        setFormError(error)
        return
      }

      router.push("/dashboard")
    } catch {
      setFormError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        name="email"
        type="email"
        label="Email"
        error={errors.email}
      />
      <Input
        name="password"
        type="password"
        label="Password"
        error={errors.password}
      />
      {formError && (
        <p className="text-sm text-status-error">{formError}</p>
      )}
      <Button type="submit" loading={isLoading} className="w-full">
        Sign in
      </Button>
    </form>
  )
}
```

**Conventions established:**
- `"use client"` at the top of form components
- Zod schema defined above the component
- `useState` for errors, loading, and form-level error
- Native `FormData` extraction with Zod validation
- `fetch()` for API calls (not server actions — unless the project chose server actions)
- Field-level errors via `errors` object, form-level error via `formError`
- `finally` block always clears loading state

---

## G. File Naming Conventions

| Category | Convention | Example |
|---|---|---|
| Component files | kebab-case | `page-header.tsx`, `button.tsx` |
| Component exports | Named export | `export function PageHeader()` |
| Route segments | kebab-case | `user-settings/`, `team-members/` |
| Type files | Singular, kebab-case | `user.ts`, `api-response.ts` |
| Utility files | Topic-based, kebab-case | `auth.ts`, `prisma.ts`, `utils.ts` |
| Barrel exports | Only in `components/ui/` | `components/ui/index.ts` |
| API route files | `route.ts` (Next.js convention) | `api/auth/login/route.ts` |
| Loading/error files | Next.js convention | `loading.tsx`, `error.tsx` |

---

## H. Feature Module Template

> **Added after Phase 9.** This section captures the structure of the first feature module built.

**Source feature:** `[feature-name]`

### Directory Layout
```
src/
├── app/(authenticated)/[feature]/
│   ├── page.tsx              # List view
│   ├── loading.tsx           # List loading skeleton
│   ├── error.tsx             # List error boundary
│   ├── new/
│   │   └── page.tsx          # Create form page
│   └── [id]/
│       ├── page.tsx          # Detail view
│       ├── loading.tsx       # Detail loading skeleton
│       ├── error.tsx         # Detail error boundary
│       └── edit/
│           └── page.tsx      # Edit form page
├── app/api/[feature]/
│   ├── route.ts              # GET (list) + POST (create)
│   └── [id]/
│       └── route.ts          # GET (detail) + PUT (update) + DELETE
├── components/[feature]/
│   ├── [feature]-list.tsx    # List component with empty state
│   ├── [feature]-card.tsx    # Card component for list items
│   ├── [feature]-form.tsx    # Shared create/edit form
│   └── [feature]-detail.tsx  # Detail view component
├── lib/[feature]/
│   └── queries.ts            # Prisma queries scoped to this feature
└── types/[feature].ts        # Feature-specific types
```

### File Responsibilities
- **`page.tsx` (list):** Server component. Fetches data, renders list component or empty state.
- **`page.tsx` (detail):** Server component. Fetches single entity, renders detail component.
- **`[feature]-form.tsx`:** Client component. Handles both create and edit (accepts optional `initialData` prop).
- **`queries.ts`:** All Prisma queries for this feature. Every query scoped by `organizationId`.
- **`route.ts`:** Follows the API route pattern from Section C.
````

---

## Integration with Build Phases

### Phase 7 Exit Checklist (Updated)

The existing Phase 7 exit checklist gains one additional item:

- [ ] Pattern snapshot generated at `docs/project/pattern_snapshot.md`
- [ ] All sections A–G populated with real code references
- [ ] No placeholder content remains

### Phase 9 Checkpoint (After First Feature Module)

After the first feature module is complete:

- [ ] Section H added to the pattern snapshot
- [ ] `Last updated` marker changed to `Phase 9`
- [ ] Subsequent feature modules reference the snapshot before building

### Sub-Agent Dispatch Template

When dispatching a sub-agent for any Phase 9+ work:

```
## Required Reading (in order)
1. docs/project/pattern_snapshot.md
2. docs/project/02_feature_spec.md — Section: [relevant feature]
3. docs/project/06_permissions_matrix.md — Rows: [relevant roles]

## Build Constraint
Your output must match the patterns in the snapshot. Do not introduce new conventions for:
- Import paths
- API response shapes
- Component structure
- File naming
- Error handling approach

If you need a pattern not covered by the snapshot, flag it in your output so the snapshot can be updated.
```
