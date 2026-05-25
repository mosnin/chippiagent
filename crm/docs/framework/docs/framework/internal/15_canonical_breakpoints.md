# 15 Canonical Breakpoints

> **TL;DR:** Single source of truth for responsive breakpoints (xs through 2xl) across internal product, public site, and email — with layout behavior, sidebar collapse, table collapse, chart behavior, and modal/drawer rules per breakpoint.
> **Covers:** breakpoint scale, layout per breakpoint, sidebar behavior, table collapse, chart behavior, modal/drawer sizing, form layout, navigation patterns, email rules | **Depends on:** None | **Used by:** 01, 04, 08, 09, 10, 11, 13, 16 | **Phase:** 7

## Purpose

This is the single source of truth for responsive breakpoints across the entire SaaS framework — internal product, public marketing site, and email templates. Every file in this framework that references responsive behavior uses these exact breakpoints with no exceptions. If a breakpoint value appears in any other document that contradicts this file, this file wins. No ad-hoc breakpoints. No per-page overrides. One scale, used everywhere.

## Canonical Breakpoint Scale

These values align with Tailwind CSS defaults. The framework is mobile-first: base styles target the smallest screens, and complexity is added upward through breakpoint prefixes.

| Name | Min Width | Range | CSS Variable | Tailwind Prefix | Intent |
|------|-----------|-------|--------------|-----------------|--------|
| xs | 0 | 0–639px | — | (default) | Mobile phones — portrait and landscape |
| sm | 640px | 640–767px | --breakpoint-sm | `sm:` | Large phones landscape, small tablets |
| md | 768px | 768–1023px | --breakpoint-md | `md:` | Tablets portrait |
| lg | 1024px | 1024–1279px | --breakpoint-lg | `lg:` | Tablets landscape, small laptops |
| xl | 1280px | 1280–1535px | --breakpoint-xl | `xl:` | Laptops, standard desktops |
| 2xl | 1536px | 1536px+ | --breakpoint-2xl | `2xl:` | Large desktops, ultrawide |

**Test targets:** 375px (iPhone SE), 768px (iPad portrait), 1024px (iPad landscape), 1280px (laptop), 1440px (desktop), 1920px (large desktop).

## Layout Behavior Per Breakpoint

### xs (0–639px) — Mobile

- **Grid:** Single column, full width
- **Sidebar:** Hidden — replaced by bottom nav or hamburger drawer
- **Tables:** Card layout (all column counts)
- **Charts:** Replace with headline number + trend indicator, or 180px height with minimal axis labels
- **Modals:** Full screen
- **Forms:** Single column, full-width inputs, stacked labels
- **Navigation:** Hamburger icon + slide-out drawer
- **Content padding:** 16px horizontal
- **Content max-width:** 100%

### sm (640–767px) — Large Phone / Small Tablet

- **Grid:** Single column, wider content area
- **Sidebar:** Still hidden
- **Tables:** Horizontal scroll for 3 or fewer columns; card layout for 4+
- **Charts:** 200px height, reduced axis labels, legend below chart
- **Modals:** Full screen or near-full (16px inset)
- **Summary cards:** 2-column grid
- **Content padding:** 16px horizontal
- **Content max-width:** 100%

### md (768–1023px) — Tablet Portrait

- **Grid:** 2 columns available
- **Sidebar:** Hidden by default, available as drawer on demand
- **Tables:** Full table for 3 or fewer columns; horizontal scroll with pinned first column for 4–6; card layout for 7+
- **Charts:** 240px height, standard axis labels, legend below chart
- **Summary cards:** 2-column grid
- **Content padding:** 24px horizontal
- **Content max-width:** 100%

### lg (1024–1279px) — Tablet Landscape / Small Laptop

- **Grid:** 2–3 columns available
- **Sidebar:** Collapsed (64px, icons only) or hidden with toggle
- **Tables:** Full layout for 6 or fewer columns; horizontal scroll with pinned first column for 7+
- **Charts:** 320px height, full axis labels, legend below chart
- **Summary cards:** Flex row, up to 4 items
- **Content padding:** 24px horizontal
- **Content max-width:** 100% (internal app), 1024px centered (public site)
- **Public site:** Hero stacks vertically, feature sections stack vertically

### xl (1280–1535px) — Laptop / Standard Desktop

- **Grid:** Full grid available
- **Sidebar:** Expanded (240px)
- **Tables:** Full layout
- **Charts:** Full layout, 320px+ height
- **All components:** At full intended spec
- **Content max-width:** Fluid (internal app), 1200px centered (public site)
- **Public site:** Full horizontal hero, side-by-side feature splits

### 2xl (1536px+) — Large Desktop

- **Grid:** Full grid with max-width containers centering content
- **Sidebar:** Expanded (240px), main content area has generous margin
- **Content max-width:** Fluid (internal app), 1200px centered (public site)
- **Everything:** At full intended layout with comfortable whitespace

## Sidebar Behavior

| Breakpoint | Internal App Sidebar | Public Website |
|------------|---------------------|----------------|
| xs | Hidden — hamburger drawer | Hidden — hamburger drawer |
| sm | Hidden — hamburger drawer | Hidden — hamburger drawer |
| md | Hidden — drawer on demand | Hidden — hamburger drawer |
| lg | Collapsed: 64px, icons only (toggle to expand) | N/A — no sidebar |
| xl | Expanded: 240px | N/A — no sidebar |
| 2xl | Expanded: 240px | N/A — no sidebar |

Transition between collapsed and expanded uses `200ms ease` animation on width.

## Table Collapse Rules

| Breakpoint | Columns 1–3 | Columns 4–6 | Columns 7+ |
|------------|-------------|-------------|------------|
| xs | Card layout | Card layout | Card layout |
| sm | Horizontal scroll | Card layout | Card layout |
| md | Full table | Horizontal scroll, pinned col 1 | Card layout or horizontal scroll |
| lg | Full table | Full table | Horizontal scroll, pinned col 1 |
| xl+ | Full table | Full table | Full table (or horizontal scroll if 10+) |

**Card layout rules:** Each row becomes a card. The first column value becomes the card title. Remaining columns render as label–value pairs stacked vertically. Action buttons move to the card footer.

## Chart Behavior

| Breakpoint | Height | Axis Labels | Legend | Tooltip | Alternative |
|------------|--------|-------------|--------|---------|-------------|
| xs | 180px | Minimal (every 3rd tick) | Below, stacked | Tap to show | Replace with headline number + trend arrow |
| sm | 200px | Reduced (every 2nd tick) | Below, horizontal | Tap to show | — |
| md | 240px | Standard | Below, horizontal | Hover | — |
| lg | 320px | Full | Below, horizontal | Hover | — |
| xl+ | 320px | Full | Below or side, horizontal | Hover | — |

On xs, if the chart conveys a single metric with trend, prefer replacing it with a stat card (headline number, delta badge, spark line) rather than rendering a compressed chart.

## Public Website Sections

| Breakpoint | Hero Layout | Feature Splits | Pricing Cards | Testimonials | Footer |
|------------|-------------|---------------|---------------|-------------|--------|
| xs | Stacked — text above image | Stacked | Single column, horizontal swipe | Single card, swipe | Single column, stacked sections |
| sm | Stacked — text above image | Stacked | Single column, horizontal swipe | Single card, swipe | Single column, stacked sections |
| md | Stacked — text above image | Stacked | 2-column grid | 2-column grid | 2-column grid |
| lg | Side-by-side | Side-by-side, alternating | 3-column grid | 2–3 column grid | 4-column grid |
| xl+ | Side-by-side | Side-by-side, alternating | 3–4 column grid | 3-column grid | 4-column grid |

**Hero CTA buttons:** Full width and stacked at xs–sm. Inline (side by side) at md+.

## Modal and Drawer Behavior

| Breakpoint | Modal | Drawer |
|------------|-------|--------|
| xs | Full screen | Full screen, slides from bottom or right |
| sm | Full screen or near-full (16px inset) | Slides from right, 90% width |
| md | Centered, max-width 560px | Slides from right, 400px |
| lg+ | Centered, max-width 560px (or 720px for complex forms) | Slides from right, 400px–480px |

Modals and drawers always include a visible close button. On xs–sm, include a swipe-down-to-dismiss gesture for bottom drawers.

**Modal scroll behavior:** Modal max-height: 90vh. If content exceeds max-height, modal body scrolls (not the modal itself). Modal header and footer (with action buttons) remain fixed/sticky. On mobile (xs-sm), modals become full-screen sheets — body scrolls naturally with fixed bottom action bar.

## Form Behavior

| Breakpoint | Layout | Label Position | Input Width | Button Alignment |
|------------|--------|---------------|-------------|-----------------|
| xs | Single column | Above input | 100% | Full width, stacked |
| sm | Single column | Above input | 100% | Full width, stacked |
| md | Single column (2-col for short fields) | Above input | 100% or 50% pairs | Right-aligned |
| lg+ | 2-column where logical | Above input or inline (settings) | Mixed widths | Right-aligned |

**'Logical' 2-column form layout:** Use 2 columns when two short fields are semantically paired: first name + last name, city + state, start date + end date, country + timezone. Never split a label-input pair across columns. If fields are unrelated or vary greatly in expected input length, use single column.

## Email Templates

Email rendering is constrained by email client support. Apply these rules:

| Rule | Value |
|------|-------|
| Max width | 600px centered |
| Below 480px viewport | Images become 100% width |
| Below 480px viewport | CTA buttons become full width (min 44px tap target) |
| Breakpoint strategy | Use `@media` with `max-width` queries only |
| Column layout | Always single column — do not rely on multi-column in email |
| Font sizes | Body: 16px minimum. Headings: 20–24px. Do not go below 14px. |

Email clients have inconsistent `@media` support. Design the single-column layout to work without media queries; use queries only to adjust spacing and image sizing.

## Implementation Rules

1. **Mobile-first always.** Base styles target xs. Add complexity upward with `sm:`, `md:`, `lg:`, `xl:`, `2xl:` prefixes.
2. **Use Tailwind prefixes.** Do not write raw `@media` queries unless Tailwind cannot express the rule (e.g., email templates, third-party widget overrides).
3. **No custom breakpoints** unless a documented exception is added to this file. The 480px boundary is not a Tailwind default — handle sub-640px distinctions with max-width utilities or container queries, not custom breakpoints.
   **Container queries vs viewport breakpoints:** Use viewport breakpoints (Tailwind responsive prefixes) for page-level layout decisions (sidebar visibility, grid columns, navigation pattern). Use container queries for component-level responsiveness when a component appears in different-width containers (e.g., a card component used in both a full-width dashboard and a narrow sidebar). Syntax: `@container (min-width: 300px)` in CSS. Tailwind: use `@container` plugin. Prefer viewport breakpoints unless the same component renders at materially different widths on the same page.
4. **Container queries** may supplement breakpoints for component-level responsiveness (e.g., a card grid that adapts to its container width rather than viewport width). Container queries do not replace viewport breakpoints — they complement them.
5. **Touch targets** must be at least 44px on xs–md breakpoints per WCAG 2.5.8.
   **Touch target specification (WCAG 2.5.8):** Minimum touch target size: 44×44px (width × height). This applies to buttons, links, form controls, and interactive icons. If the visual element is smaller than 44px (e.g., a 24px icon button), add transparent padding to reach 44×44px. Spacing between adjacent touch targets: minimum 8px.
6. **Test at these widths:** 375px, 768px, 1024px, 1280px, 1440px, 1920px.
7. **Hide-vs-reflow:** Prefer reflowing content to a simpler layout over hiding it entirely. Content hidden at a breakpoint must still be accessible via navigation (drawer, accordion, "show more").

## Navigation Patterns

| Breakpoint | Primary Nav | Secondary Nav | Breadcrumbs |
|------------|------------|---------------|-------------|
| xs | Hamburger + drawer | Hidden in drawer | Hidden or truncated to current + parent |
| sm | Hamburger + drawer | Hidden in drawer | Truncated to current + parent |
| md | Hamburger + drawer | Horizontal tabs or pills | Full path, truncated middle segments |
| lg | Sidebar (collapsed) | Horizontal tabs or pills | Full path |
| xl+ | Sidebar (expanded) | Horizontal tabs or pills | Full path |

**Bottom navigation (mobile):** On xs–sm, apps with 3–5 primary sections may use a fixed bottom nav bar (56px height) instead of a hamburger. The bottom nav replaces the hamburger — never show both simultaneously.

## Typography Scaling

Font sizes do not change per breakpoint in the internal app — the type scale defined in `10_design_tokens_internal.md` is fixed. Responsive adjustments come from layout changes (single column vs. multi-column), not from scaling text.

**Exception — Public website:** Hero headings may use responsive sizing:

| Breakpoint | Hero H1 | Hero Subhead |
|------------|---------|-------------|
| xs | 32px / 2rem | 16px / 1rem |
| sm | 36px / 2.25rem | 18px / 1.125rem |
| md | 40px / 2.5rem | 18px / 1.125rem |
| lg+ | 48px / 3rem | 20px / 1.25rem |

## Cross-Reference

This breakpoint system is referenced by:

- `docs/framework/internal/01_app_shell.md` — sidebar collapse behavior
- `docs/framework/internal/08_ui_system_internal.md` — component responsive variants
- `docs/framework/internal/10_design_tokens_internal.md` — spacing and layout tokens
- `docs/framework/internal/11_internal_screen_archetypes.md` — page-level responsive rules
- `docs/framework/internal/13_internal_data_display_rules.md` — table and chart responsive rules
- `docs/framework/website/saas_home_page_system.md` — marketing page layout breakpoints

If any of those files contain breakpoint values that differ from this document, this document is authoritative.

## Final Principle

One breakpoint scale. No exceptions. No per-page custom values. Every responsive decision in this framework traces back to this file.
