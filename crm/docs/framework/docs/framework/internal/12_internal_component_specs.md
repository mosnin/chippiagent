# 12 Internal Component Specs

> **TL;DR:** Provides exact visual specs (dimensions, padding, colors, states, mobile behavior) for every canonical internal component — summary cards, tables, forms, modals, drawers, badges, toasts, timelines, and more.
> **Covers:** component dimensions, spacing, variants, states, density presets, mobile behavior | **Depends on:** 08, 10, 15 | **Used by:** 04, 09, 13, 16, 17 | **Phase:** 7 (read alongside 08), 9

## Purpose

Define the visual structure, spacing, density, states, and interaction rules for every canonical internal component. This file works alongside `08_ui_system_internal.md` (which defines component behavior) and `10_design_tokens_internal.md` (which defines the values). This file specifies how each component is built visually so Claude never guesses.

---

## Summary Card

### Role
Display a single key metric in a dashboard summary row.

### Visual Structure
```
┌─────────────────────────┐
│  Label          [Trend] │
│  Value                  │
│  Comparison text        │
└─────────────────────────┘
```

### Specs
- Container: surface-raised, border border-default, radius-lg, shadow-none
- Padding: space-6 all sides
- Label: text-sm, font-weight 400, text-secondary
- Value: text-2xl, font-weight 700, text-primary
- Trend indicator: text-xs, font-weight 500, status-success (up) or status-error (down), includes arrow icon (12px)
- Comparison text: text-xs, text-tertiary ("vs last month")
- Gap between label and value: space-1
- Gap between value and comparison: space-1

### Row Layout
- Flex row, gap space-4
- Equal width per card (flex-1)
- Max 5 cards per row
- Min-width per card: 180px

### States
- **Loading**: Skeleton block matching label + value shape
- **No data**: Show "—" as value, hide trend and comparison
- **Positive trend**: Green arrow up + percentage
- **Negative trend**: Red arrow down + percentage
- **Neutral**: No trend indicator shown

### Mobile
- 2-column grid below 768px
- Stack to single column below 480px

---

## Status Card

### Role
Display the state of an entity or system component (integration health, subscription status, system uptime).

### Visual Structure
```
┌─────────────────────────────┐
│  [Icon]  Title     [Badge]  │
│          Description         │
│          [Action link]       │
└─────────────────────────────┘
```

### Specs
- Container: surface-raised, border border-default, radius-lg
- Padding: space-4
- Icon: 20px, text-secondary (or status color if indicating health)
- Title: text-sm, font-weight 600, text-primary
- Badge: text-xs badge with status color background
- Description: text-sm, text-secondary, margin-top space-1
- Action link: text-sm, text-link, margin-top space-2
- Icon-to-title gap: space-3

### States
- **Connected**: status-success badge, green icon
- **Disconnected**: status-neutral badge, gray icon
- **Error**: status-error badge, red icon, description explains the issue
- **Loading**: Skeleton replacing title + badge

---

## Settings Card

### Role
Group related settings controls within a settings page section.

### Visual Structure
```
┌─────────────────────────────────┐
│  Section Title                  │
│  Section description text       │
│                                 │
│  [Form fields]                  │
│                                 │
│              [Save Button]      │
└─────────────────────────────────┘
```

### Specs
- Container: no border, no background (settings cards are sections, not elevated cards)
- Section title: text-lg, font-weight 600, text-primary
- Section description: text-sm, text-secondary, margin-top space-1
- Fields begin: margin-top space-6 below description
- Save button: right-aligned, margin-top space-6
- Divider between settings sections: border-default, margin-y space-8

### States
- **Saving**: Button shows spinner, fields disabled
- **Saved**: Brief success toast (not inline — toast from top-right)
- **Error**: Inline field errors + form-level error banner above save button

---

## Table

### Role
Display structured data collections with sorting, actions, and pagination.

### Visual Structure
```
┌──────────────────────────────────────────┐
│ Column A ▲  Column B   Column C  Actions │
├──────────────────────────────────────────┤
│ Cell       Cell       Cell       •••     │
│ Cell       Cell       Cell       •••     │
│ Cell       Cell       Cell       •••     │
├──────────────────────────────────────────┤
│                    Page 1 of 5  < >      │
└──────────────────────────────────────────┘
```

### Specs
- Container: border border-default, radius-lg, overflow hidden
- Header row: surface-sunken background, border-bottom border-default
- Header cell: text-xs, font-weight 600, text-secondary, uppercase, letter-spacing 0.05em
- Header cell padding: space-3 horizontal, space-2 vertical
- Body cell: text-sm, text-primary
- Body cell padding: space-3 horizontal, space-2 vertical (compact) / space-3 vertical (default)
- Row border: border-bottom border-default (last row has no border)
- Row hover: surface-hover background
- Selected row: surface-selected background
- Sort indicator: 12px arrow icon next to sorted column header
- Actions column: right-aligned, "..." icon button opening a dropdown

### Row Density
| Preset | Row Height | Cell Padding-Y |
|--------|-----------|----------------|
| compact | 36px | 6px |
| default | 44px | 10px |
| relaxed | 52px | 14px |

### Pagination
- Right-aligned below table
- Text: "Page X of Y" in text-sm, text-secondary
- Previous/Next buttons: ghost button style, icon-only on mobile
- Margin-top: space-4

### States
- **Loading**: 5 skeleton rows matching column widths
- **Empty**: Centered empty state message inside the table container, 120px padding-y
- **Error**: Error block inside the table container with retry button
- **Sorting**: Column header shows active sort direction, data re-fetches with loading skeleton

### Row Interaction
Entire row is clickable (cursor: pointer). Hover: surface-hover background. Keyboard: Tab focuses row, Enter navigates to detail. Row actions ("..." menu) stop propagation — clicking menu does NOT navigate.

### Mobile
- Table container: horizontal scroll with shadow hint on edges, OR
- Switch to card layout: each row becomes a stacked card with key fields as label:value pairs

---

## Filter Bar

### Role
Search, filter, and optionally save views for a table index page.

### Visual Structure
```
┌──────────────────────────────────────────┐
│ [🔍 Search...]  [Status ▼] [Date ▼]  [+ Filter] │
└──────────────────────────────────────────┘
```

### Specs
- Container: no border, no background (sits directly below page header)
- Layout: flex row, gap space-3, align center
- Search input: min-width 280px, border border-strong, radius-md, padding space-2 space-3
- Search icon: 16px, text-tertiary, inside input left
- Filter dropdowns: border border-strong, radius-md, text-sm, padding space-2 space-3
- Active filter: primary-100 background, primary-600 text (to show it is filtering)
- Gap between filter bar and table: space-4

### Pill Placement
Active filter pills appear in a row below the filter bar. Pills wrap to a second line if needed. If more than 5 active filters, show first 4 pills + "+N more" pill that expands on click.

### Mobile
- Search: full width
- Filters: collapse into a "Filters" button that opens a drawer with stacked filter controls
- Active filter count shown as badge on the Filters button

---

## Search Bar

### Role
Text search across entity fields. Always debounced (300ms).

### Specs
- Border: border-strong, radius-md
- Padding: space-2 vertical, space-3 horizontal
- Icon: search icon 16px, text-tertiary, left side
- Placeholder: text-sm, text-tertiary ("Search invoices...")
- Value: text-sm, text-primary
- Focus: border-focus ring (2px), remove default browser outline
- Clear button: X icon 14px, appears when input has value, right side

### Debounce and Interaction
Debounce delay: 300ms. Show inline spinner (12px) while searching. Clear button (x) appears when input has value. Escape clears input and removes focus.

---

## Tab Bar

### Role
Switch between views within a single page without navigation.

### Visual Structure
```
───────────────────────────────
  Tab A    Tab B    Tab C
  ═══════
```

### Specs
- Container: border-bottom border-default
- Tab item: text-sm, font-weight 500, text-secondary, padding space-2 horizontal, space-3 vertical
- Active tab: text-primary, font-weight 600, border-bottom 2px primary-600
- Hover: text-primary
- Gap between tabs: space-1

### Keyboard Navigation
Arrow keys move focus between tabs. Home/End jump to first/last tab. Enter/Space activates the focused tab. Focus moves to the tab panel's first focusable element on activation.

### States
- Tabs are always visible — do not lazy-load tab labels
- Content below tabs can show loading skeleton when switching

### Mobile
- Horizontal scroll if tabs overflow
- No wrapping to multiple lines
- Scroll indicator (fade gradient) on edges when overflowing

---

## Badge

### Role
Inline status indicator or category label.

### Specs
- Padding: space-1 vertical, space-2 horizontal
- Radius: radius-full (pill shape)
- Text: text-xs, font-weight 500
- Variants:

| Variant | Background | Text |
|---------|-----------|------|
| success | status-success-bg | status-success |
| warning | status-warning-bg | status-warning |
| error | status-error-bg | status-error |
| info | status-info-bg | status-info |
| neutral | status-neutral-bg | status-neutral |
| primary | primary-100 | primary-700 |

### Usage Rules
- Max one badge per table cell
- Do not use badges for numeric counts in tables — use plain text
- Badge text should be 1-2 words max ("Active", "Past Due", "Draft")

---

## Alert Banner

### Role
System-level or page-level notification that requires awareness (not action). Persists until dismissed or resolved.

### Visual Structure
```
┌──────────────────────────────────────┐
│ [Icon]  Alert message text     [X]   │
└──────────────────────────────────────┘
```

### Specs
- Full width of content area (inside page padding)
- Padding: space-3 vertical, space-4 horizontal
- Radius: radius-lg
- Icon: 16px, left-aligned, uses variant color
- Text: text-sm, font-weight 400
- Dismiss X: 14px, right-aligned, text-secondary
- Variants use status color backgrounds:

| Variant | Background | Border | Icon/Text Color |
|---------|-----------|--------|----------------|
| info | status-info-bg | status-info (left border 3px) | status-info |
| warning | status-warning-bg | status-warning (left border 3px) | status-warning |
| error | status-error-bg | status-error (left border 3px) | status-error |
| success | status-success-bg | status-success (left border 3px) | status-success |

- Margin-bottom: space-4 (above the content it relates to)

---

## Empty State

### Role
Shown when a data view has zero items. Must guide the user to take their first action.

### Visual Structure
```
        ┌─────────────┐
        │   [Icon]     │
        │   Heading    │
        │ Description  │
        │  [CTA Button]│
        └─────────────┘
```

### Specs
- Centered horizontally and vertically in the content area
- Icon/illustration: 64px, text-tertiary color (muted, not vibrant)
- Heading: text-lg, font-weight 600, text-primary, margin-top space-4
- Description: text-sm, text-secondary, margin-top space-2, max-width 320px, text-center
- CTA button: primary button, margin-top space-6
- Overall container max-width: 400px

### Rules
- Always be specific ("No invoices yet" not "No data")
- Always include a CTA ("Create your first invoice")
- The page header and shell remain visible — the empty state replaces only the content area

---

## Loading Skeleton

### Role
Placeholder that matches the shape of content while it loads.

### Specs
- Color: surface-hover (light gray)
- Animation: horizontal shimmer, surface-hover → surface-sunken → surface-hover, duration 1.5s, ease-in-out, infinite
- Text skeleton: rounded rectangle, height matches text line-height, width varies (80% for first line, 60% for second)
- Card skeleton: full card shape with radius-lg
- Table row skeleton: full row with cell-width rectangles
- Stat skeleton: label (60px wide) + value (100px wide, taller)
- Radius: radius-sm for text lines, radius-md for inputs, radius-lg for cards

### Rules
- Match the exact layout of the loaded content to prevent layout shift
- Show 3-5 skeleton rows for tables
- Show all stat cards as skeletons simultaneously (do not stagger)
- Do not use pulsing opacity — use directional shimmer only

---

## Form

### Role
Standard layout for data input and editing.

### Field Specs
- Label: text-sm, font-weight 500, text-primary, margin-bottom space-1
- Input: border border-strong, radius-md, padding space-2 space-3, text-sm, text-primary
- Input height: 40px (default), 36px (compact)
- Input focus: border-focus (2px ring), shadow-none
- Helper text: text-xs, text-secondary, margin-top space-1
- Error text: text-xs, status-error, margin-top space-1 (replaces helper text)
- Error input: border border-error
- Required indicator: red asterisk after label
- Field gap: space-4 between fields
- Section gap: space-8 between field groups

### Field Types
- **Text input**: single line, 40px height
- **Textarea**: min-height 80px, resize vertical only
- **Select**: same dimensions as text input, chevron icon right side
- **Checkbox**: 16px box, radius-sm, primary-600 when checked, space-2 gap to label
- **Radio**: 16px circle, primary-600 dot when selected, space-2 gap to label
- **Toggle**: 36px wide, 20px tall, surface-hover (off) / primary-600 (on), radius-full

### Layout
- Single column only (never side-by-side fields except name pairs like First/Last)
- Max form width: 560px
- Submit button: right-aligned, margin-top space-6
- Cancel button: ghost/secondary style, left of submit button, gap space-3

### States
- **Default**: Fields are editable, submit button is primary style
- **Submitting**: Submit button shows spinner, all fields disabled
- **Success**: Toast notification, redirect or reset form
- **Validation error**: Inline error per field, scroll to first error

---

## Modal / Dialog

### Specs
- Backdrop: black at 50% opacity (light mode), black at 70% opacity (dark mode)
- Container: surface-overlay, radius-lg, shadow-lg
- Padding: space-6
- Header: text-lg, font-weight 600, text-primary + close X button (16px, text-secondary, top-right)
- Body: text-sm, text-primary, margin-top space-4
- Footer: margin-top space-6, flex row, justify-end, gap space-3
- Primary action: primary button (right)
- Secondary action: ghost button (left of primary)

### Sizes
| Size | Width | Usage |
|------|-------|-------|
| sm | 400px | Confirmations, simple prompts |
| md | 560px | Forms, detail previews |
| lg | 720px | Complex forms, multi-step |

### Stacking Behavior
Avoid nested modals. If a second modal is needed, close the first and open the second. If truly unavoidable, second modal renders at z-modal + 10 with a second backdrop overlay.

### Destructive Confirmation
- Header: "Delete [entity]?" or "Are you sure?"
- Body: Explain what happens, use text-secondary
- Primary action: status-error background, white text ("Delete", "Remove")
- Secondary action: "Cancel" ghost button

### Mobile
- Full width with space-4 horizontal margin
- Max-height 90vh, overflow-y scroll for body
- Footer buttons: full width, stacked (primary on top)

---

## Drawer / Side Panel

### Specs
- Width: 320px (default) or 480px (wide)
- Background: surface-overlay
- Shadow: shadow-lg on the leading edge
- Padding: space-6
- Header: text-lg, font-weight 600, text-primary + close X button
- Slides in from right (or left for navigation drawer)
- Backdrop: same as modal
- Animation: 250ms ease-out on open, 250ms ease-in on close (Motion — see Motion Timing Table in 10_design_tokens_internal.md)

### Mobile
- Full width (100vw)
- Close button always visible

---

## Dropdown Menu

### Specs
- Container: surface-raised, border border-default, radius-lg, shadow-md
- Padding: space-1 vertical (inside container)
- Item: text-sm, text-primary, padding space-2 space-3, radius-md (inside item)
- Item hover: surface-hover background
- Item icon: 16px, text-secondary, space-2 gap to label
- Destructive item: status-error text color, status-error icon
- Divider: border-default, margin-y space-1
- Min-width: 180px
- Max-height: 320px, overflow-y scroll

### Placement
- Opens below trigger by default
- Flips above if insufficient space below
- Right-aligned to trigger for action menus
- z-index: z-dropdown

---

## Pagination

### Visual Structure
```
                    Page 1 of 12  [<] [>]
```

### Specs
- Container: flex row, align center, justify end
- Text: text-sm, text-secondary
- Buttons: ghost style, 32px square, radius-md, text-secondary
- Active page (if showing numbers): primary-600 text, font-weight 600
- Disabled button: text-tertiary, cursor not-allowed
- Gap between elements: space-2

### Mobile
- Simplify to Previous/Next only
- Full width, space-between layout

---

## Toast Notification

### Specs
- Position: top-right, 24px from top edge, 24px from right edge
- Container: surface-raised, border border-default, radius-lg, shadow-md
- Padding: space-3 space-4
- Icon: 16px, status color, left side
- Text: text-sm, text-primary
- Close X: 14px, text-tertiary, right side
- Max-width: 400px
- Animation: slide in from right, 200ms ease-out on enter, 200ms ease-in on exit (Motion — see Motion Timing Table in 10_design_tokens_internal.md)
- Auto-dismiss: 5 seconds
- Stack: multiple toasts stack vertically with space-2 gap, newest on top
- z-index: z-toast

### Variants
| Variant | Icon | Left accent |
|---------|------|-------------|
| success | check-circle | status-success (3px left border) |
| error | x-circle | status-error (3px left border) |
| warning | alert-triangle | status-warning (3px left border) |
| info | info | status-info (3px left border) |

---

## Inline Validation

### Specs
- Error text: text-xs, status-error, margin-top space-1 below the input
- Error icon: 12px, status-error, inline before error text (optional)
- Input border changes to border-error
- Error text replaces helper text (do not show both)
- Trigger: on blur (first pass), then on change (after first error)

---

## Section Divider

### Specs
- Full width of container
- Border: border-default (1px solid)
- Margin: space-8 vertical
- No text labels on dividers (use section headers instead)

---

## Activity Timeline

### Role
Chronological list of events (activity log, audit trail, change history).

### Visual Structure
```
  ●  User created invoice #1042
  │  2 hours ago
  │
  ●  Payment received for #1041
  │  5 hours ago
  │
  ○  Invoice #1040 sent
     Yesterday
```

### Specs
- Timeline line: 2px wide, border-default color, left-aligned
- Event dot: 8px circle, primary-600 (filled for recent), border-default (outline for older)
- Event text: text-sm, text-primary
- Timestamp: text-xs, text-tertiary, margin-top space-1
- Gap between events: space-6
- Dot to text gap: space-3
- Left margin for timeline line: 12px (centered on dot)

### Pagination
Show 10 events initially. "Show more" button loads 10 more (not infinite scroll). After 50 events, switch to date-grouped pagination. Very old events (>90 days) are collapsed into monthly summaries.

### Mobile
- Same layout — timeline is already single-column

---

---

## Universal Component State Rules

Every interactive component must handle these states. If a component spec above doesn't explicitly list all states, apply these defaults:

| State | Visual Treatment |
|-------|-----------------|
| **Default** | As specified in component spec |
| **Hover** | `surface-hover` background (or specified hover). Transition: `duration-fast`, `ease-default` |
| **Focus** | 2px ring using `border-focus` (primary-500) with 2px offset. Outline: none |
| **Active/Pressed** | `surface-active` background. Scale: none (no press animation in internal product) |
| **Disabled** | Opacity 0.5, cursor `not-allowed`, no hover/focus state changes |
| **Loading** | Replace content with skeleton matching component shape. Or show spinner on action button |
| **Error** | `border-error` border. Error text below in `text-sm`, `status-error` color |

### Async Validation Pattern
When a component requires server-side validation (e.g., checking email uniqueness):
1. Show inline spinner (12px) next to the field after debounce (300ms)
2. On success: show check icon in `status-success`
3. On failure: show error text below field per standard validation pattern
4. Never block form submission for async validation — validate server-side on submit as well

### Toast Auto-Dismiss
- Success toasts: auto-dismiss after 5 seconds
- Error toasts: persist until manually dismissed (user must acknowledge)
- Timer pauses on hover (accessibility requirement)

---

## Cross-File Authority

This file defines **visual dimensions, spacing, and density** for components. For other concerns:
- **Component behavior and composition rules** → `08_ui_system_internal.md`
- **Design token values (colors, shadows, motion)** → `10_design_tokens_internal.md`
- **Page-level layout patterns** → `11_internal_screen_archetypes.md`
- **Data display decisions (table vs card vs chart)** → `13_internal_data_display_rules.md`
- **Error state taxonomy and escalation** → `17_error_state_taxonomy.md`
- **Responsive breakpoint behavior** → `15_canonical_breakpoints.md`

If specs in this file conflict with `10_design_tokens_internal.md` token values, the token file wins. If specs conflict with `08_ui_system_internal.md` behavior rules, the behavior file wins.

## Final Principle

Every component in this file defines a contract. When Claude builds a page, it assembles these components without modifying their internal structure. Visual consistency comes from components looking the same everywhere, not from per-page adjustments.
