# 13 Internal Data Display Rules

> **TL;DR:** Governs when to use tables vs cards vs charts vs lists, metric formatting rules, status badge mapping, dense data handling, bulk actions, pagination, mobile collapse rules, and activity feed presentation.
> **Covers:** display pattern selection, chart framing, metric hierarchy, status pills, dense data, bulk actions, pagination, mobile collapse, activity feeds | **Depends on:** 10, 12 | **Used by:** 04, 08, 09, 15, 16 | **Phase:** 8, 9

## Purpose

Define when and how to present data inside the authenticated product. This file governs the decision of which display pattern to use (table vs cards vs charts vs lists), how to handle density, how to present metrics, and how to handle data-heavy views so they look like a designed product rather than a generic dashboard template.

Use `10_design_tokens_internal.md` for all visual values. Use `12_internal_component_specs.md` for component details. Use this file for the rules that govern which components to use and how to compose them.

---

## Cards vs Tables

### Use a Table When
- Displaying 6+ items of the same entity type
- Users need to scan, compare, sort, or filter across multiple attributes
- The data has 3+ columns of structured fields
- Row-level actions are needed (edit, delete, view detail)

### Use Cards When
- Displaying fewer than 6 items
- Each item has a distinct visual identity (logo, image, color-coded status)
- The data is not easily comparable across items (each card is self-contained)
- The primary interaction is clicking into a detail view, not scanning rows
- Integrations marketplace, dashboard quick-action panels, plan comparison

### Use a Simple List When
- Items are chronological (activity feed, notifications, change history)
- Each item is a single line of text with a timestamp
- No sorting or filtering is needed
- The primary value is recency, not comparison

### Never Mix
Do not show the same data as both cards and a table on the same page. Pick one. If the user needs both a high-level overview and a detailed list, put the summary cards at the top and the table below — do not duplicate the data.

---

## Charts vs Lists vs Numbers

### Use a Chart When
- Showing a trend over time (line or area chart)
- Comparing quantities across categories (bar chart)
- Showing distribution or composition (stacked bar chart)
- The data has at least 3 data points — fewer than 3 is just a number

### Use a Standalone Number When
- There is one key metric to highlight (MRR, active users, total invoices)
- The number is meaningful on its own without trend context
- Place in a Summary Card (stat card) with label, value, and optional trend

### Use a List When
- Showing a ranked or ordered set (top clients by revenue, recent errors)
- The values are categorical, not time-series
- Each item needs text context alongside the number

### Never Use Pie Charts
Pie charts are objectively worse than horizontal bar charts for comparing proportions. Use a horizontal bar chart or a stacked bar chart instead. This is a hard rule.

**Alternatives to pie charts:** Use horizontal stacked bar for part-to-whole comparisons. Use small multiples (bar charts) for category comparison. Use a single metric with percentage for two-part splits (e.g., "72% active").

---

## Chart Framing Rules

### Chart Container
- Border: border-default, radius-lg
- Padding: space-6
- Title: text-sm, font-weight 600, text-primary, top-left
- Subtitle/description: text-xs, text-secondary, below title
- Chart area: margin-top space-4 below title

### Chart Dimensions
- Default height: 320px desktop, 240px mobile
- Secondary charts (in 2-col grid): 240px desktop, 200px mobile
- Minimum width before chart becomes unreadable: 280px

### Axis and Labels
- Y-axis labels: text-xs, text-tertiary, right-aligned, no gridline clutter (max 5 horizontal gridlines)
- X-axis labels: text-xs, text-tertiary, rotated 45 degrees if they overlap, or show every Nth label
- Gridlines: border-default color, dashed (1px), low opacity (0.5)
- No chart border or box around the data area — let it float within the card

### Tooltip
- Surface-raised background, radius-md, shadow-md, padding space-2 space-3
- Title: text-xs, font-weight 600, text-primary (the label)
- Value: text-sm, font-weight 700, text-primary
- Position: follow cursor, offset 8px, flip if near edge
- z-index: z-dropdown

### Legend
- Position: below chart, left-aligned, horizontal layout
- Legend item: color dot (8px circle) + text-xs label, gap space-2 between dot and text
- Gap between legend items: space-4
- Do not put the legend inside the chart area

### Chart Colors
Use the chart color palette from `10_design_tokens_internal.md` in order. Max 6 series. If more than 6, aggregate smaller categories into "Other."

### Empty Chart
- Show the chart container with axes but no data
- Centered message: text-sm, text-secondary, "No data for this period"
- Include the date range selector so the user can try a different range

---

## Metric Hierarchy

### Primary Metrics
- Shown in the Summary Row at the top of dashboard or analytics pages
- Use Summary Card component (stat card)
- Max 5 primary metrics per page
- Order: most important (leftmost) to least important (rightmost)

### Secondary Metrics
- Shown in chart titles, table column values, or inline within content
- Use text-sm, text-primary for the value
- Use text-xs, text-secondary for the label

### Supporting Metrics
- Shown as helper text, trend indicators, or comparison values
- Use text-xs, text-tertiary
- Always provide context ("vs last month", "of 1,000 limit")

### Metric Formatting Rules
- Numbers over 999: use comma separators (1,234 not 1234)
- Numbers over 999,999: abbreviate (1.2M, 45.3K) with tooltip showing full number
- Currency: always include symbol ($1,234.56), 2 decimal places
- Percentages: 1 decimal place (45.3%), no decimal for whole numbers (100%)
- Dates: relative for recent ("2 hours ago", "Yesterday"), absolute for older ("Mar 15, 2026")
- Durations: human-readable ("2h 15m" not "135 minutes")
- Zero values: show "0" not "—" (dash is for missing/unavailable data)
- Null/unavailable: show "—" (em dash)

**Full abbreviation scale:** Under 1,000: show exact (942). 1,000–999,999: show as K (1.2K, 45.3K, 999K). 1,000,000–999,999,999: show as M (1.2M, 845M). 1,000,000,000+: show as B (1.2B, 3.4B). Threshold: 999K rounds to 999K, not 1.0M. 1,000K becomes 1.0M.

---

## Status Pill Usage

### When to Use Status Badges
- Entity status in table cells (Active, Draft, Paid, Overdue)
- Connection state (Connected, Disconnected, Error)
- User state (Active, Invited, Suspended)
- Subscription state (Active, Trialing, Past Due, Canceled)

### Status-to-Color Mapping
| Status Category | Badge Variant | Examples |
|----------------|---------------|----------|
| Active/positive | success | Active, Paid, Connected, Verified |
| Pending/neutral | info | Pending, Processing, Syncing, Invited |
| Warning/attention | warning | Overdue, Past Due, Expiring, At Limit |
| Failed/negative | error | Failed, Error, Suspended, Declined |
| Inactive/archived | neutral | Draft, Archived, Inactive, Canceled |

### Rules
- One badge per table cell maximum
- Badge text is the status name, not a description
- Capitalize first letter only ("Past due" not "PAST DUE")
- Keep badge text to 1-2 words
- Do not use badges for non-status information (counts, categories, tags use different styling)

**Mapping novel statuses:** Map custom statuses to the 4 semantic categories by intent: Active (live, published, connected, enabled) → status-success. Pending (draft, reviewing, scheduled, queued) → status-warning. Warning (expiring, degraded, at-risk) → status-warning with icon. Failed (suspended, deleted, blocked, rejected, error) → status-error. Archived/inactive → text-tertiary with no background (neutral pill).

---

## Dense Data Handling

### When Data Gets Dense
Dense data views occur in admin panels, activity logs, analytics drill-downs, and API usage tables. They require special treatment.

### Compact Density Rules
- Switch to compact table density (36px rows, 6px cell padding)
- Use text-xs for secondary columns (timestamps, IDs)
- Truncate long text with ellipsis at max-width, show full text in tooltip on hover
- Right-align numeric columns for easy scanning
- Fixed column widths for consistency (do not let columns auto-size unpredictably)

**Truncation rules:** Table cells: truncate at column width (CSS text-overflow: ellipsis). Minimum visible: 6 characters. Show full value on hover (title attribute) or in a tooltip. Card descriptions: truncate at 2 lines (line-clamp-2). Never truncate IDs, dates, or status values.

### Horizontal Overflow
- If a table has more than 7 columns, make it horizontally scrollable
- Pin the first column (entity name/ID) so it stays visible during scroll
- Show a shadow gradient on the right edge to indicate more content
- On mobile, always allow horizontal scroll for tables with 4+ columns

### Vertical Overflow
- Use pagination for tables, not infinite scroll (see pagination section)
- Default page size: 25 rows
- Options: 10, 25, 50, 100
- Show total count: "Showing 1-25 of 342"

---

## Bulk Action Patterns

### When to Offer Bulk Actions
- Table has selectable rows (checkbox in first column)
- User can select multiple items for batch operations (delete, archive, export, assign)

### Bulk Action Bar
- Appears as a sticky bar at the bottom of the viewport when 1+ rows are selected
- Background: surface-raised, border-top border-default, shadow-lg (upward)
- Left side: "X items selected" text (text-sm, font-weight 500)
- Right side: action buttons (ghost buttons for safe actions, error button for destructive)
- z-index: z-sticky

### Selection Rules
- "Select all" checkbox in header selects current page only
- Show "Select all 342 items" link after selecting all on current page
- Deselecting any row after "select all" switches back to per-row selection
- Selection persists across pagination (track selected IDs, not row positions)

**Select-all across pages:** "Select all" selects visible page only. Show banner: "All 25 items on this page selected. Select all 142 items?" If user selects all, deselecting any row switches to per-row exclusion mode (all selected EXCEPT these rows). Persist selection state in component state, not URL.

---

## Row Action Patterns

### Inline Row Actions
- Place in the last column, right-aligned
- Use a "..." (more) icon button that opens a dropdown menu
- Common actions: View, Edit, Duplicate, Archive, Delete
- Destructive actions (Delete) are last in the menu, in status-error color, separated by a divider

### Quick Actions
- For the most common action (e.g., "View"), make the entire row clickable
- Cursor changes to pointer on row hover
- The "..." menu remains for secondary actions
- Do not make the row clickable AND have a "View" button — pick one

---

## Filters and Saved Views

### Filter Bar Rules
- Position: between page header and table
- Search input is always present (left-aligned, min-width 280px)
- Filter dropdowns to the right of search
- Max 3 visible filter dropdowns — collapse additional into "+ Filters" button
- Active filters show as pills below the filter bar with an X to remove each
- "Clear all" link appears when 2+ filters are active

### Saved Views (Optional)
- Dropdown above the filter bar: "All [Entities]" (default), plus saved views
- Saving a view stores: filter state + sort column + sort direction
- Do not save pagination position

---

## Pagination vs Infinite Scroll

### Use Pagination When
- Data is structured (tables, grids)
- Users need to jump to specific positions
- Total count matters (e.g., "342 invoices")
- Row-level actions are common (clicking into detail views)

### Use Infinite Scroll / Load More When
- Data is chronological and append-only (activity feeds, notifications, chat)
- Users consume data by scrolling, not navigating pages
- There is no need to jump to a specific position

### Never Use Infinite Scroll For
- Tables with row actions
- Data the user might search or filter
- Admin views where total count matters

---

## Mobile Data Collapse Rules

### Table to Card Conversion
Below 768px, tables with 4+ columns switch to card layout:
- Each row becomes a card (border border-default, radius-lg, padding space-4)
- Card layout: primary field as card title (text-sm, font-weight 600), secondary fields as label:value pairs below
- Status badge inline with title
- Actions: "..." button top-right of card
- Cards stack vertically with space-3 gap

### Chart Reduction
Below 640px:
- Reduce chart height to 200px
- Simplify X-axis labels (show fewer ticks)
- Move legend below chart (already the default)
- Consider replacing small charts with just the headline number + trend indicator

### Summary Cards
Below 768px:
- Switch from flex row to 2-column grid
- Below 480px: stack to single column
- Maintain card padding and internal layout

---

## Empty Analytics Handling

### When Analytics Have No Data
- Show chart containers with axes but no data plotted
- Center message in each chart: "No data for this period"
- Metric cards show "—" as value, no trend indicator
- Do not hide the charts — the page structure should remain stable
- Provide a suggestion: "Try selecting a wider date range" or "Data will appear once [entities] are created"

### When Analytics Have Partial Data
- Plot available data normally
- Do not interpolate gaps — leave them as gaps in line charts, missing bars in bar charts
- Add a note if the period is incomplete: "Current period is in progress"

---

## Warning and Alert Presentation

### Alert Priority
1. **Critical (error)**: Billing failure, integration down, security issue — show as alert banner at top of main content area, status-error variant. Cannot be dismissed until resolved.
2. **Warning**: Approaching plan limits, subscription expiring — show as alert banner, status-warning variant. Can be dismissed, returns next session.
3. **Informational**: Feature announcement, maintenance scheduled — show as alert banner, status-info variant. Dismissible.
4. **Success**: Action completed — show as toast notification, auto-dismiss after 5 seconds.

### Alert Placement
- Page-level alerts: top of main content area, below page header, above page content
- Section-level alerts: top of the relevant section (e.g., billing alert in billing section)
- Row-level alerts: inline badge or icon within the table row
- Global alerts (account-wide): banner below the top bar, above all content, full width

---

## Activity Feed Presentation

### When to Use
- Dashboard secondary panel (recent activity)
- Entity detail pages (change history)
- Admin audit log

### Visual Rules
- Use the Activity Timeline component from `12_internal_component_specs.md`
- Show most recent first
- Group events by day with date headers (text-xs, font-weight 600, text-secondary, uppercase)
- Max 10 items initially, "Show more" button to load next batch
- Each event: actor (bold) + action (normal) + target (link) + timestamp

### Event Text Format
- "**Alex** created invoice **#1042** for **Acme Corp** — 2 hours ago"
- Actor is linked to their profile (if admin view)
- Target is linked to the entity detail page
- Timestamp is relative for <24h, absolute for older

---

## Final Principle

Data display rules exist to prevent the most common visual failure in SaaS products: pages that have the right data but present it in an unstructured, inconsistent, or hard-to-scan way. When in doubt, choose the simpler display pattern. A clean table beats a flashy dashboard widget every time.
