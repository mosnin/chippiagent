# 08 UI System Internal

> **TL;DR:** Defines the internal product design system — canonical component catalog (cards, tables, forms, modals, badges, etc.), composition rules, state handling, and responsive behavior.
> **Covers:** component behavior, page header, sidebar, drawer, cards, tables, forms, modals, tabs, badges, empty states, loading skeletons, error blocks | **Depends on:** 01, 10, 11, 12, 13 | **Used by:** 04, 09, 17 | **Phase:** 7, 9 (read in Phase 7 as foundational; referenced again in Phase 9 for feature builds)

## Purpose

Define the internal product design system so that authenticated views remain polished, coherent, and usable. Every component below should be built once and reused across all feature modules.

## Implementation Stack

The UI system is built on these libraries (see `docs/framework/templates/05_tech_stack_template.md` for full details):

- **shadcn/ui** — component primitives built on Radix UI. Components are copied into the codebase (`components/ui/`) and customized to match framework specs. Not imported from node_modules.
- **Tailwind CSS** — styling via design tokens from `10_design_tokens_internal.md`
- **tailwind-merge + CVA** — class conflict resolution and typed component variants (size, density, intent)
- **Motion (framer-motion)** — animations for page transitions, toast enter/exit, drawer slides, modal backdrop fade
- **react-hook-form + zod** — form state and validation for all Form components
- **Sonner** — toast notification component (used by Form success states, bulk action confirmations)
- **Huge Icons** — icon library (@hugeicons/react + style packages). Tree-shakeable, modular architecture. Use stroke style for navigation/metadata (low emphasis), solid for active states/primary actions (high emphasis), duotone/bulk for empty states, onboarding, and feature highlights (decorative emphasis). Stick to one stroke shape (e.g., Stroke Rounded) across the app — use style weight for hierarchy, not shape.
- **nuqs** — URL state for Tabs (deep linking), Table (sort/filter/page), and filter persistence
- **next-themes** — dark mode toggle and system preference detection

### shadcn Component Mapping

Each canonical component maps to a shadcn primitive that is then customized:

| Framework Component | shadcn Base | Customization |
|---|---|---|
| Modal / Dialog | `dialog` | Size variants (sm/md/lg), mobile full-screen sheet |
| Form | `form` + `input` + `select` | react-hook-form integration, inline validation |
| Table | `table` | Optional Tanstack Table for complex sorting/filtering |
| Tabs | `tabs` | URL sync via nuqs, horizontal scroll on mobile |
| Badge | `badge` | Status color variants from design tokens |
| Card | `card` | Bordered/elevated/interactive variants |
| Action Bar | Custom | No shadcn equivalent — built from scratch |
| Empty State | Custom | No shadcn equivalent — built from scratch |
| Loading Skeleton | `skeleton` | Shape-matched to content it replaces |
| Page Header | Custom | App-specific, uses shadcn button for actions |

Components marked "Custom" follow the same file structure (`components/ui/`) and styling conventions as shadcn components.

## Core UI Principles

- Clarity over decoration — remove anything that does not serve the user's task
- Consistency over novelty — same patterns everywhere, no per-page inventions
- Reusable patterns over one-off layouts — extract after 3+ uses
- Explicit state handling — every component must account for its possible states
- Responsive behavior by default — mobile is not an afterthought
- Accessible interactions — keyboard navigable, screen reader friendly, sufficient contrast

## Canonical Internal Components

### App Shell
The persistent frame wrapping all authenticated pages. Contains top bar, sidebar/drawer, and main content area. Defined in detail in `01_app_shell.md`.

### Page Header
Appears at the top of every authenticated page inside the main content area.
- **Required**: Page title, primary action button (e.g., "New Invoice", "Add Client")
- **Optional**: Breadcrumbs, description text, secondary actions, filters, date range selector
- **Behavior**: Sticky on scroll (optional per product). Primary action always visible on mobile.

### Sidebar Nav
Desktop navigation panel. Rendered inside the shell.
- **Sections**: Core features (top), optional modules (middle), Settings and Admin (bottom)
- **Active state**: Highlight current route, support nested items with expand/collapse
- **Role filtering**: Hide items the user's role cannot access — do not show disabled items

### Mobile Drawer
Replaces sidebar on screens under 768px. Triggered by hamburger icon in top bar.
- **Behavior**: Slides in from left with backdrop overlay. Closes on backdrop tap, nav item selection, or swipe.
- **Content**: Same items as sidebar plus logout, billing shortcut, and user info header.

### Card
General-purpose content container.
- **Variants**: Default (bordered), elevated (shadow), interactive (hover state + click handler)
- **Structure**: Optional header (title + action), body content, optional footer
- **Sizing**: Full-width on mobile, grid-based on desktop (2-col, 3-col, 4-col)

### Stat Card
Specialized card for displaying a single metric in summary rows.
- **Structure**: Label, value (large text), optional trend indicator (up/down arrow with percentage), optional comparison period
- **Sizing**: Fixed height, equal width in a row. Stack vertically on mobile.

### Table
For displaying lists of structured data (invoices, clients, users, logs).
- **Features**: Sortable columns (click header), row actions (edit, delete, view), bulk select (optional), pagination
- **States**: Loading (skeleton rows), empty (message + CTA), error (retry prompt)
- **Mobile**: Switch to card layout below 768px — each row becomes a stacked card with key fields visible

### List
Simpler alternative to table for non-tabular data (activity feeds, notifications, search results).
- **Structure**: Avatar/icon + primary text + secondary text + timestamp + optional action
- **Behavior**: Click to navigate to detail. Infinite scroll or "Load more" for pagination.

### Form
Standard form layout for create/edit operations.
- **Layout**: Single column, label above input. Group related fields with section headers.
- **Validation**: Inline errors below each field on blur or submit. Required fields marked with asterisk.
- **Actions**: Primary submit button (right-aligned), secondary cancel button. Disable submit while loading.
- **States**: Default, loading (spinner on submit button), success (toast notification), error (inline + optional banner)

### Modal / Dialog
For confirmations, quick actions, and focused input that does not warrant a full page.
- **Variants**: Confirm (destructive action warning), form (quick create/edit), info (detail view)
- **Behavior**: Backdrop click closes (unless form has unsaved changes). Escape key closes. Focus trapped inside modal.
- **Sizing**: Small (confirm), medium (form), large (detail). Max-width on desktop, full-width on mobile.

### Tabs
For switching between views within a single page context.
- **Behavior**: Content changes without page navigation. Active tab is visually distinct. URL updates with tab ID for deep linking.
- **Mobile**: Horizontal scroll if tabs overflow. Do not wrap to multiple lines.

### Badge
Inline status indicator.
- **Variants**: Status (active/green, warning/yellow, error/red, neutral/gray), count (notification count), label (category tag)
- **Sizing**: Small (inline with text), default (standalone)

### Empty State
Displayed when a list, table, or dashboard section has no data.
- **Structure**: Illustration or icon (optional), heading ("No invoices yet"), description ("Create your first invoice to get started"), primary CTA button
- **Rule**: Never show a blank area. Every empty state must explain what goes here and how to populate it.

### Loading Skeleton
Placeholder shown while data loads. Must match the shape of the content it replaces.
- **Types**: Text lines (paragraph skeleton), table rows (row skeleton), cards (card skeleton), stat values (number skeleton)
- **Animation**: Subtle pulse or shimmer. No spinning loaders except on buttons.

### Error Block
Displayed when a page or section fails to load.
- **Structure**: Error icon, heading ("Something went wrong"), description (user-friendly, not a stack trace), retry button
- **Placement**: Replaces the content area that failed. Does not replace the entire shell.

### Action Bar
Fixed bar at the bottom of the page for bulk operations or unsaved changes.
- **Trigger**: Appears when user selects multiple items (bulk) or modifies a form (unsaved changes)
- **Structure**: Count/status text (left), action buttons (right: Save, Discard, Delete Selected)
- **Behavior**: Sticky to bottom of viewport. Disappears when action completes or selection is cleared.

## Component Composition Rules

1. Components nest but do not duplicate — a Page Header inside a Modal is wrong.
2. State handling is per-component — a Table inside a Card can be loading while the Card header is visible.
3. Mobile behavior is defined per-component — each component knows how it degrades.
4. Interactive components (buttons, links, form inputs) must have visible focus states for keyboard navigation.
5. Destructive actions (delete, remove, disconnect) always require a confirmation Modal.

## Related Visual Pack

This file defines component behavior and structure. The deeper visual specificity layer lives in four companion files:

- `10_design_tokens_internal.md` — exact colors, spacing, typography, shadows, radii, motion, layout dimensions
- `11_internal_screen_archetypes.md` — canonical page patterns (dashboard, table index, detail, settings, etc.)
- `12_internal_component_specs.md` — visual specs for every component (dimensions, padding, variants, states)
- `13_internal_data_display_rules.md` — when to use tables vs cards vs charts, metric formatting, density rules

When building any authenticated page, read this file for component behavior, then read the visual pack for how it looks.

## Library Integration Notes

- **shadcn init**: Run `npx shadcn@latest init` during Phase 4 setup. Select "New York" style, CSS variables, and the project's primary color.
- **Adding components**: Use `npx shadcn@latest add [component]` to scaffold, then customize to match framework specs. Never use shadcn components as-is without verifying they match the spec in `12_internal_component_specs.md`.
- **Motion animations**: Define animation variants in a shared `lib/animations.ts` file. Use the internal motion timing table from `10_design_tokens_internal.md`. Motion is reserved for structural UI transitions (drawer slide, modal enter/exit, toast, page content entrance, staggered list reveals). Do not use Motion for table rows, inline text changes, form field focus, nav highlights, or skeleton shimmer — use CSS transitions for those. Always respect `prefers-reduced-motion`.
- **Form pattern**: Every form uses `useForm` from react-hook-form with a zod schema via `zodResolver`. The zod schema is defined in a shared `lib/validations/` directory and reused in the corresponding API route or server action.
- **Toast pattern**: Import `toast` from Sonner. Use after successful mutations (`toast.success("Saved")`), errors (`toast.error("Failed to save")`), and async operations (`toast.promise()`).
- **URL state pattern**: Use `useQueryState` from nuqs for any state that should survive page refresh or be shareable — active tab, sort column, filter values, pagination page.

## Final Principle

The internal UI system should create a stable visual and interaction language so the product feels like one system regardless of how many modules it includes.
