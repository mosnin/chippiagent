# 11 Internal Screen Archetypes

> **TL;DR:** Defines the canonical page patterns (dashboard, analytics, table index, detail, settings, billing, integration config, form setup, admin overview, empty state, loading state, error recovery) that every internal page must map to.
> **Covers:** page archetypes, visual hierarchy, layout rules, density, mobile behavior, common mistakes | **Depends on:** 08, 10 | **Used by:** 04, 09, 15 | **Phase:** 9

## Purpose

Define the canonical screen patterns for authenticated product pages. Every internal page must map to one of these archetypes. This prevents Claude from inventing new layouts per page and ensures every screen feels like part of the same designed product.

Each archetype specifies the visual hierarchy, required blocks, layout rules, density, and mobile behavior. Use `10_design_tokens_internal.md` for all visual values. Use `08_ui_system_internal.md` for component behavior. Use this file for how screens are composed from those components.

---

## Cross-Archetype Composition

When a page requires elements from multiple archetypes:
- **Embedded table in dashboard:** Use dashboard archetype for layout. Table follows Table Index density but is capped at 5 visible rows with 'View all →' link. No pagination controls in embedded tables.
- **Embedded chart in detail page:** Use Detail Page archetype for layout. Chart fills the full content width, follows Analytics archetype chart rules but without the comparison toggle.
- **Settings with 20+ categories:** Use collapsible sidebar groups. Group related categories under headings (Account, Workspace, Integrations, Billing). Sidebar scrolls independently. Max 6 top-level groups.
- **General rule:** The page's primary archetype controls layout (width, spacing, header). Embedded elements from secondary archetypes follow their own internal specs but inherit the host page's width constraints.

---

## Archetype: Dashboard Page

### Purpose
The primary operational surface. Answers: what is happening, what needs attention, what should I do next.

### Visual Hierarchy
1. Page header (title + primary action like "New [Entity]")
2. Summary row (3-5 stat cards in a horizontal row)
3. Main work area (the core content — a list, table, pipeline, or feed)
4. Secondary insights (sidebar panel or below-fold section with activity, alerts, recommendations)

### Layout
- Full width within page-max-width (1280px)
- Summary row: equal-width stat cards in a flex row, gap space-4
- Main work area: takes 2/3 width when secondary panel exists, full width otherwise
- Secondary panel: 1/3 width on desktop, collapses below main content on tablet

### Density
Relaxed. The dashboard is the first thing users see — give it breathing room. Use space-6 between major sections. Stat cards use space-6 internal padding.

### Mobile Behavior
- Summary row: stack to 2-column grid at sm breakpoint, single column at xs. Do not use horizontal scroll for summary cards — it hides data. Reserve horizontal scroll for data tables only.
- Main work area: full width, table switches to card layout
- Secondary panel: collapses below main content
- Primary action button: floating action button (FAB) at bottom-right if the page header scrolls out of view

### Common Mistakes to Avoid
- Cramming too many metrics into the summary row (max 5)
- Using large charts as the main work area when the user needs an actionable list
- Treating the dashboard as an analytics page — dashboards are operational, not analytical
- Showing an empty dashboard with no guidance (always show empty state with CTA to first value event)

---

## Archetype: Analytics Page

### Purpose
Deep data exploration. Shows trends, segments, and metrics over time. This is where users go to understand patterns, not take immediate action.

### Visual Hierarchy
1. Page header (title + date range selector as primary control)
2. Metric cards row (key numbers for the selected period)
3. Primary chart area (large chart — line, bar, or area — showing the main trend)
4. Secondary charts or breakdowns (2-column grid of smaller charts or tables)
5. Optional: data table below charts for drill-down

### Layout
- Full width within page-max-width
- Primary chart: full width, fixed height 320px desktop / 240px mobile
- Secondary charts: 2-column grid on desktop, stack on mobile, fixed height 240px each
- Metric cards: same pattern as dashboard summary row

### Density
Default. Charts need breathing room but surrounding elements can be tighter. Use space-8 between the metric row, primary chart, and secondary section.

### Mobile Behavior
- Date range selector: moves into a dropdown or bottom sheet
- Primary chart: full width, reduced height (240px)
- Secondary charts: stack to single column
- Data tables below charts: switch to card layout or horizontal scroll

### Common Mistakes to Avoid
- Using pie charts (they are almost always worse than bar charts for comparison)
- Showing too many chart series (max 6 per chart, per the chart color palette)
- No empty state for charts with zero data — show "No data for this period" with illustration
- Forgetting the date range selector — analytics pages always need time controls
- Making charts interactive when they do not need to be (tooltips are fine, click-to-drill is only if the data supports it)

---

## Archetype: Table Index Page

### Purpose
List view for browsing, searching, filtering, and acting on a collection of entities (invoices, clients, users, integrations, logs).

### Visual Hierarchy
1. Page header (title + primary action "New [Entity]")
2. Filter/search bar (search input + filter dropdowns + optional saved views)
3. Table (with column headers, sortable columns, row actions)
4. Pagination (bottom of table)
5. Optional: bulk action bar (appears when rows are selected)

### Layout
- Full width within page-max-width
- Filter bar: horizontal row, left-aligned search input (min 280px), filter dropdowns to the right, gap space-3
- Table: full width, default density (44px rows)
- Pagination: right-aligned below table, space-4 margin-top

### Density
Default to default density. Switch to compact density for admin logs and activity feeds where high volume scanning matters.

### Mobile Behavior
- Search bar: full width, filters collapse into a "Filters" button that opens a drawer
- Table: switches to card layout — each row becomes a vertical card showing key fields
- Row actions: move into a "..." menu on each card
- Bulk select: hidden on mobile (too complex for touch)
- Pagination: simplified (Previous / Next only, no page numbers)

### Common Mistakes to Avoid
- Showing too many columns (max 6-7 visible columns on desktop, prioritize the rest into a detail view)
- Not making any column sortable (at minimum: name/title, date created, status)
- Using a table for fewer than 5 items — use a simple list or card grid instead
- Forgetting the empty state when no results match the current filter
- Placing the primary action ("New [Entity]") somewhere other than the page header

---

## Archetype: Detail Page

### Purpose
View and edit a single entity (an invoice, a client, a user profile, a webhook configuration).

### Visual Hierarchy
1. Page header (entity name/title + status badge + primary action like "Edit" or "Send")
2. Metadata bar (key-value pairs: created date, owner, status, last updated — horizontal on desktop)
3. Primary content area (the main body — fields, sections, or a tabbed view)
4. Related content (secondary section below or in a sidebar — related entities, activity log, notes)
5. Action bar (fixed bottom bar if the page is in edit mode with unsaved changes)

### Layout
- Narrow max-width (page-max-width-narrow: 768px) for form-heavy detail pages
- Full max-width (1280px) for detail pages with related data tables or sidebars
- Metadata bar: horizontal flex row with dividers between items, space-4 gap
- Tabbed content: tabs below metadata bar, content area below tabs

### Density
Relaxed for display mode (reading), default for edit mode (form fields). Use space-6 between sections.

### Mobile Behavior
- Metadata bar: wraps to 2-column grid or vertical stack
- Tabs: horizontal scroll
- Related content sidebar: collapses below primary content
- Action bar: sticky at bottom of viewport

### Common Mistakes to Avoid
- Showing a detail page as a modal when the entity has enough fields to warrant a full page
- Not showing a clear "back" navigation (breadcrumbs or back arrow) to the index page
- Mixing edit and display modes on the same page without clear visual separation
- Forgetting the activity log or audit trail section for entities that change over time

---

## Archetype: Settings Page

### Purpose
Configure account, workspace, profile, notifications, or security preferences. Settings are not frequently visited — prioritize clarity over density.

### Visual Hierarchy
1. Settings sidebar navigation (left panel listing setting categories)
2. Settings content area (right panel with the active setting section)
3. Section headers within content area (group related settings)
4. Form fields (the actual controls)
5. Save action (per-section save button, not a global save)

### Layout
- Two-column layout: sidebar (200px fixed) + content area (rest of page-max-width-narrow: 768px)
- Settings sidebar: vertical nav list with active state highlighting
- Content area: sections separated by space-8 and border-default dividers
- Each section: header (text-lg) + description (text-sm, text-secondary) + fields + save button

### Density
Relaxed. Settings pages should feel calm, not cramped. Use space-6 padding inside setting sections.

### Mobile Behavior
- Settings sidebar: collapses to a dropdown selector or horizontal scrolling tabs at the top
- Content area: full width with space-4 padding
- Save buttons: full width on mobile

### Common Mistakes to Avoid
- Using a single global save button for all settings (use per-section saves with optimistic UI)
- Nesting settings more than 2 levels deep (sidebar category → section within that page, no deeper)
- Not providing helper text on settings that have consequences (e.g., "Deleting your workspace is permanent")
- Making the settings page look like a form dump — use section headers and visual grouping

---

## Archetype: Billing Page

### Purpose
Display current plan, payment method, usage, and invoice history. Allow plan changes and billing management.

### Visual Hierarchy
1. Page header (title: "Billing")
2. Current plan card (plan name, price, billing interval, next payment date, upgrade/downgrade CTA)
3. Usage section (if usage-based pricing — meter bars showing consumption against limits)
4. Payment method section (card on file, update button)
5. Invoice history table (date, amount, status, PDF download link)

### Layout
- Narrow max-width (page-max-width-narrow: 768px)
- Current plan card: full width, elevated (shadow-sm), radius-lg, space-6 padding
- Usage meters: full width bars with labels and percentage values
- Invoice history: compact table (no row actions beyond PDF download)

### Density
Relaxed. Billing is sensitive — users need to feel confident they understand what they are paying for. Use space-8 between sections.

### Mobile Behavior
- Current plan card: full width, stack price and CTA vertically
- Usage meters: full width, no change needed
- Invoice table: switch to card layout (date, amount, status, download button per card)

### Common Mistakes to Avoid
- Not showing the next billing date prominently
- Using vague language for plan changes ("Contact us" instead of clear upgrade/downgrade paths)
- Hiding the cancel option (it must be accessible, even if de-emphasized)
- Not showing what happens on downgrade (feature loss warnings)

---

## Archetype: Integration Configuration Page

### Purpose
Connect, configure, and monitor a third-party integration (Stripe, Slack, GitHub, etc.).

### Visual Hierarchy
1. Page header (integration name + logo + connection status badge)
2. Connection status section (connected/disconnected state, connect/disconnect button)
3. Configuration section (integration-specific settings — webhook URLs, API scopes, sync preferences)
4. Activity/health section (recent sync events, errors, last successful sync timestamp)

### Layout
- Narrow max-width (page-max-width-narrow: 768px)
- Connection status: card with status badge, connected account info, and action button
- Configuration: form fields grouped by purpose
- Activity: compact table or list of recent events

### Density
Default. Configuration pages are task-focused — not too dense, not too relaxed.

### Mobile Behavior
- All sections stack vertically
- Connect/disconnect buttons: full width
- Activity table: switch to list format

### Common Mistakes to Avoid
- Not showing what the integration does before asking the user to connect
- Showing raw OAuth URLs or API keys without explanation
- Not handling the disconnected state as a first-class screen (it should have clear value prop + connect CTA)
- Forgetting error states for failed syncs or expired tokens

---

## Archetype: Form-Heavy Setup Page

### Purpose
Multi-step or long-form data entry (onboarding, entity creation wizard, import flow).

### Visual Hierarchy
1. Page header or step indicator (progress bar with step count)
2. Form title and description for the current step
3. Form fields (single column, grouped by section)
4. Navigation (Back + Next/Submit buttons)

### Layout
- Narrow max-width (page-max-width-narrow: 768px), centered
- Progress indicator: full width, above the form content
- Form: single column, space-4 gap between fields, space-8 between sections
- Navigation buttons: right-aligned (Back left, Next/Submit right), sticky on long forms

### Density
Relaxed. Setup pages should feel approachable. Extra whitespace reduces cognitive load during complex input.

### Mobile Behavior
- Progress indicator: simplified (Step 2 of 4 text instead of full bar if space is tight)
- Form: full width, space-4 horizontal padding
- Navigation buttons: full width, stacked (Submit on top, Back below)

### Common Mistakes to Avoid
- Showing all steps on one page instead of progressive disclosure
- Not preserving form state when the user goes back a step
- Using a horizontal multi-column form layout (always single column)
- Not validating each step before allowing progression to the next

---

## Archetype: Admin Overview Page

### Purpose
System-level dashboard for administrators. Shows health metrics, user counts, billing status, and system alerts.

### Visual Hierarchy
1. Page header (title: "Admin" or "System Overview")
2. System health cards (active users, MRR, total workspaces, system status)
3. Alerts section (flagged accounts, failed payments, system issues)
4. Quick actions (links to user management, billing overview, logs)

### Layout
- Full width within page-max-width
- Health cards: 4-column grid on desktop, 2-column on tablet, stack on mobile
- Alerts: full width list with severity badges
- Quick actions: card grid (2-3 columns)

### Density
Default. Admin pages balance information density with scannability.

### Mobile Behavior
- Health cards: 2-column grid or stack
- Alerts: full width cards
- Quick actions: stack vertically

### Common Mistakes to Avoid
- Making admin look different from the rest of the product (it should use the same shell, page header, and components)
- Showing raw database counts without context (show "1,234 active users" not "1234")
- Not including a link to audit logs from the overview

---

## Archetype: Admin User Detail Page

### Purpose
View and manage a specific user or organization from the admin perspective.

### Visual Hierarchy
1. Page header (user name/email + role badge + status badge)
2. User info section (profile data, organization, plan, last login, signup date)
3. Action section (change role, suspend, unsuspend, reset password)
4. Activity section (recent actions, login history)
5. Related data (their invoices, workspaces, subscription history — in compact tables)

### Layout
- Follow the Detail Page archetype with narrow max-width
- Action buttons: grouped in a card with clear labels and confirmation modals for destructive actions
- Activity: compact table or timeline list

### Density
Default. Admin needs to scan information quickly.

### Mobile Behavior
- Same as Detail Page archetype
- Action buttons: full width, vertically stacked

### Common Mistakes to Avoid
- Allowing admin actions without confirmation dialogs
- Not logging admin actions to the audit trail
- Showing edit capabilities for fields that should not be admin-editable (like password hash)

---

## Archetype: Empty State Page

### Purpose
Shown when a page has no data to display. Must guide the user toward creating their first item.

### Visual Hierarchy
1. Page header (same as the page would normally have)
2. Centered empty state block (illustration/icon + heading + description + CTA button)

### Layout
- Empty state block: centered horizontally and vertically in the main content area
- Max-width 400px for the text block
- Illustration/icon: 120px max height, muted colors (use text-tertiary for icon color)
- Heading: text-lg, text-primary
- Description: text-sm, text-secondary, max 2 lines
- CTA button: primary button, centered below description

### Density
Very relaxed. Empty states should feel inviting, not sparse.

### Mobile Behavior
- Same layout, slightly smaller illustration (80px)
- CTA button: full width

### Common Mistakes to Avoid
- Generic messaging ("No data found" — always be specific: "No invoices yet")
- Missing the CTA (every empty state must have an action the user can take)
- Using the empty state illustration as the only visual — the page header and shell must still be present
- Showing a loading skeleton that resolves to empty — show the empty state immediately when the query returns zero results

---

## Archetype: Loading State Page

### Purpose
Shown while page data is being fetched. Must match the shape of the loaded page to prevent layout shift.

### Visual Hierarchy
Match the target archetype exactly, replacing dynamic content with skeleton placeholders.

### Layout Rules
- Page header: render the static title immediately, show skeleton for dynamic parts (counts, status)
- Summary row: skeleton stat cards matching the exact card dimensions
- Tables: skeleton rows (3-5 rows) matching column widths
- Charts: skeleton rectangle matching chart dimensions
- Forms: skeleton inputs matching field layout

### Density
Same as the target archetype.

### Skeleton Rules
- Use surface-hover color for skeleton elements
- Apply a horizontal shimmer animation at duration-slower (500ms)
- Do not use spinning loaders for page content — only for buttons in loading state
- Show at least 3 skeleton rows for tables, at least 3 skeleton cards for grids
- Never show a loading spinner centered on a blank white page

### Mobile Behavior
- Match mobile layout of the target archetype with skeleton equivalents

### Common Mistakes to Avoid
- Skeleton that does not match the actual loaded layout (causes jarring layout shift)
- Showing skeleton for too long without a fallback (after 10 seconds, show error state)

**Loading timeout:** If skeleton/spinner persists beyond 10 seconds, show a timeout message: 'This is taking longer than expected. [Retry]'. See `17_error_state_taxonomy.md` for timeout escalation pattern. Never show a spinner indefinitely.
- Using a single generic skeleton for all pages (each page archetype needs its own skeleton shape)

---

## Archetype: Error Recovery Page

### Purpose
Shown when a page fails to load or a critical operation fails. Must explain what happened and offer recovery.

### Visual Hierarchy
1. Page header (same as the page would normally have — the shell is never replaced by an error)
2. Error block centered in the content area (icon + heading + description + retry button)
3. Optional: secondary action (go back, contact support)

### Layout
- Error block: centered, max-width 480px
- Icon: warning or error icon, 48px, status-error color
- Heading: text-lg, text-primary ("Something went wrong" or more specific)
- Description: text-sm, text-secondary (user-friendly explanation, never a stack trace)
- Retry button: primary button, centered
- Secondary link: text-sm, text-link, below retry button

### Density
Very relaxed. Error pages should feel calm, not panicked.

### Mobile Behavior
- Same layout, buttons full width

### Common Mistakes to Avoid
- Replacing the entire shell with the error (the sidebar, top bar, and navigation must remain)
- Showing technical error messages (500, ECONNREFUSED, etc.)
- Not providing a retry action
- Not providing a way to navigate away from the error (back button or dashboard link)

---

## Final Principle

Every internal page must map to one of these archetypes. If a new page does not fit any archetype, it is likely over-designed or under-specified. Simplify the page until it fits, or identify which archetype it is closest to and follow that pattern with minimal deviation.
