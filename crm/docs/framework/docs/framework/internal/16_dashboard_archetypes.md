# 16 Dashboard Archetypes

> **TL;DR:** Defines 7 concrete, buildable dashboard patterns (queue, pipeline, analytics, content workspace, operations, monitoring, admin overview) with layout, summary cards, alerts, empty states, and mobile behavior for each.
> **Covers:** queue, pipeline, analytics, content workspace, operations, monitoring, admin overview dashboards | **Depends on:** 03, 10, 12, 15 | **Used by:** 04, 09, 11 | **Phase:** 8

## Purpose

Define concrete, buildable dashboard patterns for SaaS products. The general dashboard anatomy is in `03_dashboard_system.md`. This file specifies 7 specific dashboard types with enough detail to build each one without guessing layout or content.

Use `10_design_tokens_internal.md` for visual tokens, `12_internal_component_specs.md` for component specs, and `15_canonical_breakpoints.md` for responsive behavior.

---

## 1. Queue Dashboard

### Purpose
Process a backlog of actionable items. The user's job is to work through items — triage, process, complete. Think: support tickets, pending approvals, content review, order fulfillment.

### Main Work Surface
- Filterable table or list of actionable items
- Default sort: by priority (highest first), then by date (oldest first)
- Default filter: "My items" or "Assigned to me"
- Row click navigates to item detail page

**Priority order:** High → Medium → Low (descending severity). Within same priority, sort by creation date ascending (oldest first — FIFO). Priority levels are always 3 (High/Medium/Low) unless project docs define custom levels.

### Summary Cards (4-5 metrics)
- Total pending
- Overdue count (status-error color if > 0)
- Avg resolution time
- Completed today
- Optional: SLA compliance rate

### Secondary Insights
- Priority distribution (horizontal bar chart: critical, high, medium, low)
- Volume over time (line chart: items created vs completed per day)

### Activity Pattern
- Right sidebar or below-table panel: recent completions timeline
- Format: "[Actor] completed [item] — [time ago]"

### Alert Pattern
- Overdue items banner (status-warning) at top of content if any items past SLA
- Critical priority items highlighted in table with status-error left border

### Empty State
- "All caught up" with completion stats for the current period
- "No items have been created yet" if truly empty, with CTA to create first item

### Mobile Adaptation
- Summary cards: 2-column grid
- Table converts to card list with status badge, priority indicator, and assignee
- Swipe actions on cards: complete, reassign (optional)

### Common Mistakes
- Showing all items for all users by default (overwhelming)
- Too many table columns (max 6 for queue view)
- No default sort (items appear in random order)
- Missing overdue indicators

---

## 2. Pipeline Dashboard

### Purpose
Track items through stages. The user's job is to move items forward and identify bottlenecks. Think: sales pipeline, hiring funnel, project workflow, deal flow.

### Main Work Surface
- Kanban board: horizontal columns per stage, items as cards within columns
- Drag-and-drop between stages
- Each card shows: title, key metric (deal value, candidate name), assignee avatar, days in stage
- Column headers show: stage name, item count, aggregate value (if applicable)

### Summary Cards (4-5 metrics)
- Total items in pipeline
- Total pipeline value (if monetary)
- Conversion rate (start to finish)
- Avg time in pipeline
- Optional: items added this period

### Secondary Insights
- Funnel visualization (horizontal bar chart showing conversion between stages)
- Bottleneck indicator: stage with longest avg time highlighted

### Activity Pattern
- Below pipeline or in collapsible panel: recent stage transitions
- Format: "[Item] moved from [Stage A] to [Stage B] — [time ago]"

### Alert Pattern
- Stalled items: badge on items with no movement in X days (configurable)
- At-risk items: visual indicator for high-value items in late stages

### Empty State
- "No items in your pipeline" with CTA to add first item
- Show the empty stage columns so the user understands the structure

### Mobile Adaptation
- Kanban columns become vertical stage list (not side-by-side)
- Each stage is an expandable section showing item cards
- Tap to move items between stages (modal with stage picker)
- Summary cards: 2-column grid above stages

### Common Mistakes
- Too many stages visible (max 5-7 stages, scroll for more)
- No aggregate value per stage (hard to spot where value is stuck)
- Cards with too much information (keep to 3-4 fields per card)
- No stale item indicator

---

## 3. Analytics Dashboard

### Purpose
Understand performance over time. The user's job is to monitor trends, identify changes, and make data-informed decisions. Think: revenue analytics, user analytics, content performance, marketing metrics.

### Main Work Surface
- 2-column chart grid with date range selector in page header
- Primary charts (top row): key trend lines (revenue over time, active users over time)
- Secondary charts (bottom row): comparisons, distributions, breakdowns

### Summary Cards (4-5 metrics)
- Primary KPI (revenue, users, events)
- Growth rate (this period vs last)
- Secondary KPI
- Tertiary KPI
- Optional: conversion rate or efficiency metric

### Secondary Insights
- Comparison view: this period vs previous period (overlay on charts)
- Top performers table: ranked list of top entities (customers, products, campaigns)

**Comparison UI:** Toggle button in chart header: "Compare". Opens date range picker for comparison period. Comparison data shown as dashed line overlay on same chart (not side-by-side). Legend shows both periods. If comparison data unavailable, disable toggle with tooltip "Not enough historical data".

### Activity Pattern
- Not applicable. Analytics dashboards are retrospective, not event-driven.

### Alert Pattern
- Significant metric change alert: banner when a key metric drops >20% vs previous period
- Anomaly indicator: data point highlighting on charts when values are unusual

### Empty State
- Chart containers with axes visible but no data plotted
- Centered message per chart: "No data for this period"
- Suggestion: "Try selecting a wider date range" or "Data appears once [events] are tracked"
- Summary cards show "—" with no trend indicator

### Mobile Adaptation
- Charts stack to single column, height reduces to 200px
- Consider replacing small secondary charts with headline number + trend indicator
- Summary cards: 2-column grid
- Date range selector becomes compact dropdown or drawer

### Common Mistakes
- Too many charts competing for attention (max 6 on one page)
- No date range context (always show what period the data covers)
- Pie charts (use horizontal bar charts — hard rule from `13_internal_data_display_rules.md`)
- Charts without axis labels or units

---

## 4. Content Workspace Dashboard

### Purpose
Create and manage content items. The user's job is to find recent work, start new work, and track content state. Think: CMS dashboard, document workspace, design tool, template library.

### Main Work Surface
- Recent items grid or list with quick actions (edit, duplicate, archive)
- View toggle: grid (visual thumbnails) or list (compact table)
- Sort: last modified (default), created date, alphabetical, status
- Search bar prominent

**View toggle UI:** Icon toggle group (grid icon | list icon) in top-right of content area. Persist selection in localStorage. Default: grid view for visual content (images, cards), list view for text-heavy content (documents, articles).

### Summary Cards (4 metrics)
- Total items
- Published count
- Draft count
- Scheduled count (if applicable)

### Secondary Insights
- Recent edits timeline (your activity + collaborator activity)
- Quick-start section: "Create from template" with template cards

### Activity Pattern
- Sidebar or below-content panel: recent changes by team members
- Format: "[User] edited [item title] — [time ago]"

### Alert Pattern
- Items approaching deadline (if applicable): status-warning banner
- Items scheduled for today: info banner

### Empty State
- "Create your first [item type]" with:
  - "Start from scratch" button
  - Template suggestions (3-4 template cards)

### Mobile Adaptation
- Grid view: 2-column on tablet, 1-column on mobile
- List view: card layout per item
- Quick actions: long-press or "..." menu per item
- Search bar: full width, sticky below header

### Common Mistakes
- Grid layout without enough metadata visible (title, status, date)
- No status filtering (published, draft, archived tabs or filter)
- No recent items section (forcing users to search every time)
- Templates buried in a secondary page

---

## 5. Operations Dashboard

### Purpose
Monitor and manage real-time or near-real-time operations. The user's job is to ensure things are running smoothly and intervene when they're not. Think: logistics, inventory, service delivery, facility management.

### Main Work Surface
- Split view: overview map or status grid (top) + detail table (bottom)
- Or: status grid of operational units with health indicators
- Each unit shows: name, status (green/yellow/red), key metric, last update time

### Summary Cards (4-5 metrics)
- Active operations
- Issues requiring attention (status-error if > 0)
- Completion rate (today or this period)
- On-time percentage
- Optional: capacity utilization

### Secondary Insights
- Capacity utilization chart (bar chart by unit or region)
- Performance trend (line chart: on-time rate over time)

### Activity Pattern
- Live feed: recent operational events (dispatch, delivery, issue, resolution)
- Auto-refresh or real-time updates with subtle animation

### Alert Pattern
- Critical issue banner: status-error, cannot dismiss until resolved
- Capacity warning: status-warning when utilization > 90%
- Time-sensitive: show elapsed time since issue reported

### Empty State
- Operational map/grid with no active items
- "No active operations" with CTA to start first operation
- Rare — operations dashboards usually have data

### Mobile Adaptation
- Map/grid collapses to scrollable card list with status indicators
- Detail table: card layout per row
- Critical alerts: sticky banner at top

### Common Mistakes
- Too much real-time data without prioritization (everything looks urgent)
- Alerts that cry wolf (tune thresholds, don't alert on normal fluctuation)
- No elapsed time on issues (urgency not visible)
- Stale data without "last updated" timestamp

---

## 6. Monitoring Dashboard

### Purpose
Watch system health and performance. The user's job is to spot problems fast and respond. Think: infrastructure monitoring, API monitoring, uptime checks, performance dashboards.

### Main Work Surface
- Status grid: monitored resources arranged as tiles
- Each tile: resource name, health indicator (green/yellow/red circle), key metric (response time, error rate), sparkline
- Overall health score at the top (large number: 100%, 99.9%, etc.)

### Summary Cards (4 metrics)
- Overall health score / uptime percentage
- Active incidents count (status-error if > 0)
- Response time p95
- Error rate (current)

### Secondary Insights
- Performance timeline: response time + error rate over time (dual-axis line chart)
- Throughput chart: requests per second or events per minute

### Activity Pattern
- Incident log: timeline of incidents with timestamp, severity, duration, status
- Most recent at top

### Alert Pattern
- Active incident banner: status-error, full-width, shows incident title and duration
- Degraded service: status-warning banner
- All-clear: status-success toast when incident resolves

### Empty State
- "No monitors configured" with setup wizard CTA
- Show example tile layout so user understands what it will look like

### Mobile Adaptation
- Status grid: 2-column on tablet, single column list on mobile
- Each monitor becomes a compact card with status dot, name, key metric
- Charts: simplified to sparklines or headline numbers
- Incident banner: sticky top

### Common Mistakes
- Information overload (everything on one screen without hierarchy)
- No severity levels (treating all issues as equally urgent)
- Equal visual weight for healthy and unhealthy resources (unhealthy should pop)
- Missing "last checked" timestamps

### Sparkline Specs
Width: fill available tile space (min 80px). Height: 32px. No axis labels. Single color line (primary-500). Hover shows tooltip with exact value and timestamp. For tiles, sparkline sits below the metric value with space-2 gap.

---

## 7. Admin Overview Dashboard

### Purpose
High-level view of the entire product for administrators. The user's job is to ensure the business is healthy and users are succeeding. Think: SaaS admin panel, platform admin, company-wide overview.

### Main Work Surface
- Multi-section overview pulling key metrics from each product area
- Organized as sections: Users, Revenue, Activity, Health
- Each section: 2-3 summary cards + one chart or mini-table

### Summary Cards (4-6 metrics)
- Total users (with growth indicator)
- MRR or total revenue
- Active subscriptions
- Support tickets open (or equivalent)
- Optional: conversion rate, churn rate

### Secondary Insights
- Growth chart: users over time (line chart)
- Revenue chart: MRR over time (line chart)
- Plan distribution: horizontal bar chart (users per plan)

### Activity Pattern
- Recent admin actions log (role changes, billing actions, user management)
- Recent user signups list (name, email, plan, signup date)
- Recent support escalations (if applicable)

### Alert Pattern
- Billing failures: status-error banner with count and link to affected accounts
- Security events: status-warning banner for unusual activity
- System health: status indicators for integrations and services

### Empty State
- Not applicable in normal operation (admin dashboard always has system-level data)
- New product: show zero-state metrics ("0 users", "0 revenue") with setup guidance

### Mobile Adaptation
- Sections stack vertically
- Charts reduce to headline number + trend
- Activity feeds become primary content (most actionable on mobile)
- Summary cards: 2-column grid

### Common Mistakes
- Trying to show everything (prioritize: health indicators, then growth, then detail)
- Not linking to detail views (every section should link to its full page)
- Stale data without "as of [time]" indicators
- Missing the most important admin action: quick access to user management

---

## Selecting a Dashboard Archetype

When building a new product dashboard, choose the archetype that matches the user's primary job:

| If the user's main job is... | Use this archetype |
|------------------------------|-------------------|
| Processing items one by one | Queue |
| Moving items through stages | Pipeline |
| Understanding trends and performance | Analytics |
| Creating and managing content | Content Workspace |
| Overseeing real-time operations | Operations |
| Watching system health | Monitoring |
| Administering a platform | Admin Overview |

Most products need one primary dashboard archetype plus the Admin Overview for admin users. Some products combine elements (e.g., a queue dashboard with an analytics sidebar). When combining, one archetype should dominate — don't create a hybrid that does everything poorly.

**Hybrid dashboards:** If a user role requires two archetype patterns, use a primary archetype for the main view and embed elements from the secondary as a panel or tab. Example: Queue + Analytics → Queue is the main view with an "Analytics" tab showing key metrics. Never merge two archetypes into a single mixed view — it creates cognitive overload.

---

## Final Principle

A dashboard archetype is a starting point, not a constraint. Use the archetype to set the structure, then adapt the specific metrics, charts, and activity feeds to the product. The archetype prevents blank-page paralysis and ensures the dashboard has the right bones before custom content is added.
