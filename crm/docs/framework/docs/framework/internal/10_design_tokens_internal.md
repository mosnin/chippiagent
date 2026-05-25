# 10 Design Tokens Internal

> **TL;DR:** Defines every visual token for the internal product — colors (light/dark), spacing scale, typography, border radii, shadows, motion, layout dimensions, and z-index layers.
> **Covers:** color system, spacing, typography, radii, shadows, motion, layout dimensions, z-index, Tailwind mapping | **Depends on:** 15 | **Used by:** 01, 04, 08, 09, 11, 12, 13, 16, 17 | **Phase:** 7

## Purpose

Define the canonical visual tokens for authenticated product pages. These tokens govern every visual decision inside the application shell — color, spacing, typography, shadows, radii, motion, and layout dimensions. They exist so Claude never improvises visual choices and every page feels like part of the same designed system.

The marketing site has its own design tokens in `docs/framework/website/design_system_tokens.md`. This file governs the internal product only. The two systems should feel related but distinct — the internal UI is denser, more operational, and more information-focused than the marketing site.

## Color System

### Philosophy

Use a neutral-dominant palette with a single accent color for primary actions and interactive elements. Status colors are reserved for semantic meaning only. Avoid decorative color. Let hierarchy come from surface layering, text weight, and spacing — not from color variety.

### Light Mode

#### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| surface-base | #FFFFFF | Page background, main content area |
| surface-raised | #FFFFFF | Cards, modals, dropdowns (elevated via shadow, not color) |
| surface-sunken | #F9FAFB | Sidebar background, page section backgrounds, code blocks |
| surface-overlay | #FFFFFF | Modals, drawers, popovers (elevated via shadow + backdrop) |
| surface-hover | #F3F4F6 | Row hover, button hover on neutral surfaces |
| surface-active | #E5E7EB | Active row, pressed state |
| surface-selected | #EFF6FF | Selected row or item (uses primary tint) |

#### Borders

| Token | Value | Usage |
|-------|-------|-------|
| border-default | #E5E7EB | Card borders, table cell borders, dividers |
| border-strong | #D1D5DB | Input borders (default state), section dividers |
| border-focus | {primary-500} | Input focus ring (2px), active tab underline |
| border-error | #EF4444 | Input error state border |

#### Text

| Token | Value | Usage |
|-------|-------|-------|
| text-primary | #111827 | Headings, primary content, table cell values |
| text-secondary | #6B7280 | Descriptions, helper text, secondary labels |
| text-tertiary | #9CA3AF | Placeholders, disabled text, timestamps |
| text-inverse | #FFFFFF | Text on primary-colored backgrounds, badges |
| text-link | {primary-600} | Inline links, breadcrumbs |

#### Primary (Accent)

The primary color is the single brand accent used for interactive elements. The framework defines the scale structure — the project layer sets the actual hue. Default to blue if no project preference is stated.

| Token | Default Value | Usage |
|-------|---------------|-------|
| primary-50 | #EFF6FF | Selected row background, light tint areas |
| primary-100 | #DBEAFE | Badge backgrounds, notification dots |
| primary-500 | #3B82F6 | Focus rings, active indicators, chart accents |
| primary-600 | #2563EB | Primary buttons, links, active sidebar items |
| primary-700 | #1D4ED8 | Primary button hover |

#### Status Colors

Reserved for semantic meaning. Never use for decoration.

| Token | Value | Usage |
|-------|-------|-------|
| status-success | #22C55E | Success badges, positive metrics, connected state |
| status-success-bg | #F0FDF4 | Success alert background, success badge background |
| status-warning | #F59E0B | Warning badges, approaching limits, attention needed |
| status-warning-bg | #FFFBEB | Warning alert background |
| status-error | #EF4444 | Error badges, failed states, destructive actions |
| status-error-bg | #FEF2F2 | Error alert background, error badge background |
| status-info | #3B82F6 | Info badges, neutral status, informational alerts |
| status-info-bg | #EFF6FF | Info alert background |
| status-neutral | #6B7280 | Inactive, archived, draft badges |
| status-neutral-bg | #F3F4F6 | Neutral badge background |

#### Chart Colors

Use in this order for multi-series data. Maximum 6 series before the palette repeats.

| Series | Value |
|--------|-------|
| chart-1 | {primary-500} |
| chart-2 | #8B5CF6 |
| chart-3 | #06B6D4 |
| chart-4 | #F59E0B |
| chart-5 | #EC4899 |
| chart-6 | #10B981 |

**Color opacity usage:** To apply opacity to color tokens in Tailwind, use the `/` opacity modifier syntax: `bg-primary-500/50` for 50% opacity, `text-secondary/75` for 75% opacity. Never use raw `rgba()` in component code — always use token + opacity modifier. Common opacity values: 50 (overlays), 75 (disabled text), 10 (subtle backgrounds like hover states).

### Dark Mode

Dark mode uses the same token names with adjusted values. The principle: invert surfaces (dark base, light text), keep status colors recognizable, reduce contrast slightly to avoid eye strain.

#### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| surface-base | #0F172A | Page background |
| surface-raised | #1E293B | Cards, modals, dropdowns |
| surface-sunken | #0B1120 | Sidebar, section backgrounds |
| surface-overlay | #1E293B | Modals, drawers (with backdrop) |
| surface-hover | #334155 | Row hover, button hover |
| surface-active | #475569 | Active row, pressed state |
| surface-selected | #1E3A5F | Selected row (primary tint) |

#### Borders

| Token | Value |
|-------|-------|
| border-default | #334155 |
| border-strong | #475569 |
| border-focus | {primary-400} |
| border-error | #F87171 |

#### Text

| Token | Value |
|-------|-------|
| text-primary | #F1F5F9 |
| text-secondary | #94A3B8 |
| text-tertiary | #64748B |
| text-inverse | #0F172A |
| text-link | {primary-400} |

#### Status Colors (Dark Mode)

Same hues, slightly adjusted for dark backgrounds.

| Token | Value |
|-------|-------|
| status-success | #4ADE80 |
| status-success-bg | #052E16 |
| status-warning | #FBBF24 |
| status-warning-bg | #422006 |
| status-error | #F87171 |
| status-error-bg | #450A0A |
| status-info | #60A5FA |
| status-info-bg | #172554 |
| status-neutral | #94A3B8 |
| status-neutral-bg | #1E293B |

## Spacing Scale

Use a 4px base unit. All spacing in the product must use values from this scale. No arbitrary pixel values.

| Token | Value | Common Usage |
|-------|-------|--------------|
| space-0 | 0px | Reset |
| space-1 | 4px | Inline badge padding, icon-to-label gap |
| space-2 | 8px | Compact input padding, tight element gap |
| space-3 | 12px | Standard input padding-x, small card padding |
| space-4 | 16px | Standard card padding, section gap, form field gap |
| space-5 | 20px | Page header padding-y, medium section gap |
| space-6 | 24px | Card padding (relaxed), section divider margin |
| space-8 | 32px | Page section gap, modal padding |
| space-10 | 40px | Large section gap |
| space-12 | 48px | Page top padding, major section dividers |
| space-16 | 64px | Page bottom padding |

### Spacing Rules

- **Form fields**: space-4 (16px) vertical gap between fields
- **Form sections**: space-8 (32px) gap between field groups with a section header
- **Card content**: space-4 (16px) padding on compact cards, space-6 (24px) on relaxed cards
- **Table cells**: space-3 (12px) horizontal padding, space-2 (8px) vertical padding (compact), space-3 (12px) vertical padding (default)
- **Page sections**: space-8 (32px) gap between major page sections
- **Button icon gap**: space-2 (8px)
- **Badge padding**: space-1 (4px) vertical, space-2 (8px) horizontal

## Typography Scale

Use a system font stack for the internal product. Do not use custom display fonts inside the app — save those for the marketing site.

### Font Family

```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
font-family-mono: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| text-xs | 12px | 400 | 16px | Badges, captions, tertiary metadata |
| text-sm | 14px | 400 | 20px | Table cells, form labels, helper text, secondary content |
| text-base | 16px | 400 | 24px | Body text, input values, primary content |
| text-lg | 18px | 600 | 28px | Card titles, section headers within a page |
| text-xl | 20px | 600 | 28px | Page titles in page header |
| text-2xl | 24px | 700 | 32px | Dashboard stat values, large metric displays |
| text-3xl | 30px | 700 | 36px | Hero metrics on dashboard (use sparingly) |

### Type Rules

- **Page title**: text-xl, font-weight 600, text-primary
- **Section header**: text-lg, font-weight 600, text-primary
- **Card title**: text-sm, font-weight 600, text-primary (not large — cards are compact)
- **Table header**: text-xs, font-weight 600, text-secondary, uppercase, letter-spacing 0.05em
- **Table cell**: text-sm, font-weight 400, text-primary
- **Form label**: text-sm, font-weight 500, text-primary
- **Helper text**: text-sm, font-weight 400, text-secondary
- **Button text**: text-sm, font-weight 500
- **Badge text**: text-xs, font-weight 500
- **Stat value**: text-2xl, font-weight 700, text-primary
- **Stat label**: text-sm, font-weight 400, text-secondary

## Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| radius-none | 0px | Table cells, dividers |
| radius-sm | 4px | Badges, small tags |
| radius-md | 6px | Buttons, inputs, dropdowns |
| radius-lg | 8px | Cards, modals, drawers, popovers |
| radius-xl | 12px | Large cards (dashboard summary), onboarding panels |
| radius-full | 9999px | Avatars, circular indicators, pills |

### Radius Rules

- All interactive elements use radius-md (6px)
- All container elements use radius-lg (8px)
- Do not mix rounded and sharp corners on the same page
- Nested elements use the same or smaller radius than their parent

## Shadow Scale

Use shadows for elevation hierarchy. Do not combine shadows with colored borders on the same element — use one or the other.

| Token | Value | Usage |
|-------|-------|-------|
| shadow-none | none | Flat elements, bordered cards |
| shadow-sm | 0 1px 2px rgba(0,0,0,0.05) | Subtle lift for inputs, small cards |
| shadow-md | 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1) | Dropdowns, popovers, elevated cards |
| shadow-lg | 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1) | Modals, drawers, command palettes |
| shadow-xl | 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1) | Full-screen overlays (rare) |

**Combining shadows with borders:** The rule 'do not combine shadows with colored borders' exists because colored borders + shadows create visual noise and competing elevation cues. Exception: `border-error` with shadow-sm is allowed on form fields in error state — the border signals the error semantically while shadow provides baseline elevation.

### Shadow Rules (Dark Mode)

In dark mode, shadows are less visible. Compensate with stronger border-default values and slight surface color differences between layers. Do not increase shadow opacity — it looks muddy on dark backgrounds.

## Motion and Animation

### Motion Timing Table (Internal Product)

These are the canonical durations and easings for every animated interaction in the authenticated app. Motion (framer-motion) handles structural transitions. CSS `transition` handles simple state changes.

| Pattern | Duration | Easing | Implementation |
|---------|----------|--------|----------------|
| Hover feedback | 150ms | ease-out | CSS transition |
| Toast enter/exit | 200ms | ease-out / ease-in | Motion |
| Drawer slide | 250ms | ease-out | Motion |
| Modal backdrop + content | 200ms | ease-out | Motion |
| Page content fade-in | 300ms | ease-out | Motion (opacity 0→1, y: 8→0) |
| Staggered list items | 300ms + 50ms stagger | ease-out | Motion (staggerChildren) |

### Easing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| ease-out | cubic-bezier(0, 0, 0.2, 1) | Elements entering view (primary easing) |
| ease-in | cubic-bezier(0.4, 0, 1, 1) | Elements exiting view |
| ease-default | cubic-bezier(0.4, 0, 0.2, 1) | CSS hover/focus transitions |

### Legacy Duration Tokens (CSS transitions only)

| Token | Value | Usage |
|-------|-------|-------|
| duration-instant | 0ms | Tab switches, immediate feedback |
| duration-fast | 150ms | Hover feedback, button state changes, tooltips |
| duration-slower | 500ms | Skeleton shimmer cycle |

### Where to Use Motion vs CSS

**Use Motion (framer-motion):**
- Page-level content entrance (fade + slight y shift on mount)
- Staggered list/card reveals (dashboard stats, feature grid)
- Drawer/modal enter/exit (AnimatePresence)
- Toast notifications (slide in, fade out)
- Empty state illustrations (gentle fade-in)
- Hover lift on interactive cards (y: -2, shadow increase)
- Layout animations (AnimatePresence for tab content swap)

**Use CSS transitions (never Motion):**
- Table row rendering (too many elements, performance)
- Inline text changes (jittery)
- Form field focus/validation states
- Navigation active state highlights
- Skeleton shimmer (CSS @keyframes, more performant)
- Color/opacity changes on hover

### Motion Rules

- Prefer opacity and transform. Do not animate layout properties (width, height, padding).
- Skeleton loaders use a horizontal shimmer via CSS @keyframes at 1.5s duration, not Motion.
- Do not animate color changes on hover — use CSS transition at duration-fast.
- Page content entrance: opacity 0→1, y: 8→0, 300ms ease-out. Subtle — users should feel it, not notice it.
- Never exceed 300ms for any internal product animation (excluding skeleton shimmer).
- Do not use spring physics or bounce easing in the internal product.
- Always respect `prefers-reduced-motion` — skip animation or reduce to simple opacity fade.
- Define all Motion variants in a shared `lib/animations.ts` file for consistency.

## Layout Dimensions

### Page Layout

| Token | Value | Usage |
|-------|-------|-------|
| sidebar-width | 240px | Desktop sidebar at rest |
| sidebar-width-collapsed | 64px | Collapsed sidebar (icon-only, if supported) |
| topbar-height | 56px | Top navigation bar |
| page-padding-x | 24px | Horizontal padding of main content area (desktop) |
| page-padding-x-mobile | 16px | Horizontal padding of main content area (mobile) |
| page-padding-top | 24px | Top padding below page header |
| page-max-width | 1280px | Maximum width of page content (centered) |
| page-max-width-narrow | 768px | Settings pages, form-heavy pages |

### Modal Sizes

| Token | Value | Usage |
|-------|-------|-------|
| modal-sm | 400px | Confirmations, quick inputs |
| modal-md | 560px | Standard forms, detail views |
| modal-lg | 720px | Complex forms, multi-step wizards |
| modal-xl | 960px | Data-heavy views, comparison panels (rare) |

On mobile (below 640px), all modals become full-width with 16px horizontal margin.

### Drawer Size

| Token | Value | Usage |
|-------|-------|-------|
| drawer-width | 320px | Detail panels, filters, mobile navigation |
| drawer-width-wide | 480px | Extended detail views, edit panels |

### Table Density

| Preset | Row Height | Cell Padding-Y | Usage |
|--------|-----------|----------------|-------|
| compact | 36px | 6px | Admin logs, activity feeds, dense data |
| default | 44px | 10px | Standard data tables |
| relaxed | 52px | 14px | Client-facing tables with more breathing room |

## Z-Index Layers

| Token | Value | Usage |
|-------|-------|-------|
| z-base | 0 | Default page content |
| z-dropdown | 10 | Dropdown menus, popovers, tooltips |
| z-sticky | 20 | Sticky page headers, table headers |
| z-drawer | 30 | Side drawers, filter panels |
| z-modal | 40 | Modals, dialogs |
| z-toast | 50 | Toast notifications |
| z-overlay | 60 | Backdrop overlays behind modals/drawers |
| z-command | 70 | Command palette (highest interactive element) |

**Z-index stacking for nested layers:** If a tooltip appears inside a dropdown, it inherits the dropdown's stacking context. Use `z-tooltip` (60) — it's above `z-dropdown` (40) regardless of nesting. For nested modals (avoid if possible), second modal uses `z-modal + 10` (60). Maximum z-index in the system: 70 (reserved for dev tools overlay). Never use arbitrary z-index values.

## Responsive Breakpoints

For the canonical breakpoint scale (shared across internal product, public website, and email), see `15_canonical_breakpoints.md`. That file defines:
- Breakpoint names and widths (aligned with Tailwind defaults)
- Layout behavior per breakpoint (grid, sidebar, tables, charts)
- Sidebar collapse rules
- Table-to-card conversion rules
- Chart behavior rules

Do not define breakpoints ad hoc — always reference the canonical scale.

## Implementation Notes

### Tailwind Mapping

These tokens should be implemented as Tailwind theme extensions in `tailwind.config.ts`. Map token names to Tailwind utility classes:

- `surface-base` → `bg-surface-base`
- `text-primary` → `text-primary` (extend the color palette, not the default text utilities)
- `space-4` → Use Tailwind's default `p-4`, `gap-4`, `m-4` (the spacing scale aligns with Tailwind's 4px base)
- `shadow-md` → `shadow-md` (align with Tailwind defaults where possible)

### Project-Level Overrides

The project layer (`docs/project/05_tech_stack.md` or a dedicated `docs/project/09_design_config.md`) can override:

- The primary color hue (swap blue for indigo, emerald, violet, etc.)
- The font family (if the product has a brand font)
- The border radius preference (more rounded or more sharp)

Everything else — spacing scale, shadow scale, motion, layout dimensions, z-index, status colors — should remain stable across projects.

## Final Principle

Design tokens are not suggestions. They are constraints. When Claude builds an internal page, every color, every spacing value, every shadow, every font size must come from this file. If a value is not in this file, it should not be in the product.
