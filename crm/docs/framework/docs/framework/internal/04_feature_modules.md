# 04 Feature Modules

> **TL;DR:** Specifies optional plug-in modules (analytics, integrations, API, MCP, webhooks, notifications, usage, activity logs) with routes, layouts, states, and permission rules for each.
> **Covers:** analytics, integrations, API keys, MCP servers, webhooks, notifications, usage metering, activity logs | **Depends on:** 07, 08, 11, 12, 13, 14, 15, 16 | **Used by:** 05, 09 | **Phase:** 3, 9

## Purpose

Define the reusable module types that may be attached to different SaaS applications. Each module is optional — only include what the product requires. This file provides enough detail that each module can be built without guessing layout, routes, or behavior.

## Core Principle

Modules plug into the shared shell. They must not invent unrelated navigation or UI systems. Every module uses the shared page header, sidebar navigation placement, and state handling patterns.

---

## Analytics Module

### Purpose
Show product usage data and business metrics to the user.

### When to Include
The product tracks quantitative outcomes (revenue, events, conversions, engagement) that users need to monitor over time.

### Canonical Routes
- `/analytics` — Overview dashboard
- `/analytics/[metric]` — Drill-down view for a specific metric (optional)

### Recommended Archetype
Analytics Dashboard (see `16_dashboard_archetypes.md`).

### Layout
- Page header: "Analytics" title + date range selector as primary action
- Summary row: 4-5 stat cards (primary KPIs for the product)
- Main area: 2-column chart grid (line charts for trends, bar charts for comparisons)
- Secondary: top performers table or ranked list below charts
- No sidebar panel — analytics is a full-width content page

### Core UI Blocks
- Date range selector (preset ranges + custom)
- Summary cards (from `12_internal_component_specs.md`)
- Line/area charts for time-series data
- Bar charts for categorical comparisons
- Top-N table or ranked list
- Export button (CSV/PDF)

### Common States
- **Loading**: Skeleton stat cards + chart placeholders
- **Empty**: Chart containers with axes but no data, message "Data will appear once [events] are tracked"
- **Success**: Charts populated, stat cards showing values with trends
- **Error**: Error banner with retry, charts show "Unable to load" individually
- **Partial**: Some charts load while others fail — show per-chart error, not page-level

### Mobile Behavior
- Charts stack single column, height reduces to 200px
- Stat cards: 2-column grid below 768px, single column below 480px
- Date range selector moves to a dropdown or drawer
- Export button moves to page header overflow menu

### Permission Considerations
- All roles can view analytics for data they own
- Admin and owner see org-wide analytics
- Member sees only their own data (filter applied server-side)
- No write permissions needed — analytics is read-only

### Admin Visibility
Admin dashboard (see `16_dashboard_archetypes.md`) may include a summary widget linking to full analytics.

### Anti-Patterns
- Too many charts on one page (max 6)
- Pie charts (use horizontal bar charts instead — see `13_internal_data_display_rules.md`)
- Date ranges with no data that show confusing empty charts without explanation
- Mixing personal and org-wide metrics without clear labels

---

## Integrations Module

### Purpose
Connect third-party services to the product.

### When to Include
The product benefits from data sync, automation, or communication with external tools (Slack, HubSpot, Zapier, etc.).

### Canonical Routes
- `/integrations` — Integration marketplace / connected list
- `/integrations/[provider]` — Per-integration config and status

### Recommended Archetype
Integration Config page (see `11_internal_screen_archetypes.md`).

### Layout
- Page header: "Integrations" title + search input
- Tab bar: "Connected" | "Available" (or single view with status filter)
- Grid layout: integration cards (logo, name, status badge, connect/disconnect action)
- Detail view: connection status card + config form + sync history log

### Core UI Blocks
- Integration card (logo 40px, name, description, status badge, action button)
- Status card (connected/disconnected/error with last sync timestamp)
- OAuth connect button (opens popup or redirect)
- Config form (provider-specific fields with helper text)
- Sync history log (activity timeline with status per sync)
- Disconnect confirmation modal (destructive action)

### Common States
- **Loading**: Skeleton grid of integration cards
- **Empty**: "No integrations connected yet" with CTA to browse available
- **Connected**: Green status badge, last sync time, settings link
- **Disconnected**: Gray status badge, reconnect button
- **Error**: Red status badge, error description, retry/reconnect actions
- **Syncing**: Spinner on status card, progress if available

### Mobile Behavior
- Grid becomes single-column card list
- Detail view: full-width, config form below status card
- OAuth popup may need redirect flow on mobile browsers

### Permission Considerations
- Admin and owner: connect, disconnect, configure
- Manager: view connected integrations, view sync status
- Member: view connected integrations (read-only)
- Sidebar nav item hidden for members if no read access

### Admin Visibility
Admin sees all integrations across the organization. Integration health summary in admin dashboard.

### Anti-Patterns
- Showing available integrations the product doesn't actually support
- No error details when sync fails (just "Error" with no explanation)
- Allowing disconnect without warning about data loss
- Config forms without validation or helper text

---

## API Module

### Purpose
Allow users to programmatically access product features.

### When to Include
The product serves technical users or teams that need to automate workflows, import/export data, or build on top of the product.

### Canonical Routes
- `/settings/api` — API key management (often nested under settings)
- `/docs/api` — API documentation (may be external)

### Recommended Archetype
Table Index page for key management (see `11_internal_screen_archetypes.md`).

### Layout
- Page header: "API Keys" title + "Create Key" primary action button
- Table: key name, prefix (first 8 chars), created date, last used, status, actions
- Create modal: name input, permission scope checkboxes, create button
- Key reveal: shown once on creation, copy button, warning that it won't be shown again

### Core UI Blocks
- Table with key list
- Create API key modal (form with name + scopes)
- Key reveal card (one-time display with copy button)
- Revoke confirmation modal (destructive)
- Usage stats per key (optional — requests today, requests this month)
- Documentation link button

### Common States
- **Loading**: Skeleton table rows
- **Empty**: "No API keys yet" with create CTA and link to API docs
- **Success**: Table showing keys with status and usage
- **Error**: Error banner on failed operations (create, revoke)
- **Key created**: Success modal showing the key with copy button and warning

### Mobile Behavior
- Table converts to card list (key name as title, details as label:value pairs)
- Create modal becomes full-screen on mobile
- Copy button must work on mobile (clipboard API)

### Permission Considerations
- Admin and owner only — API key management is a sensitive operation
- Keys are scoped to the organization, not individual users
- Revoking a key requires confirmation modal
- Key creation is logged in admin audit trail

### Admin Visibility
Admin can see all API keys, who created them, and usage stats.

### Anti-Patterns
- Showing full API keys in the table (show prefix only)
- No confirmation before revoking a key
- No "last used" timestamp (makes it impossible to identify stale keys)
- Creating keys without naming them

---

## MCP (Model Context Protocol) Module

### Purpose
Allow AI assistants and external tools to interact with the product through a standardized protocol.

### When to Include
The product exposes functionality that AI agents, IDE extensions, or automation tools should access via MCP servers.

### Canonical Routes
- `/settings/mcp` — MCP server configuration
- `/settings/mcp/[server-id]` — Individual server detail and logs

### Recommended Archetype
Integration Config page pattern (see `11_internal_screen_archetypes.md`).

### Layout
- Page header: "MCP Servers" title + "Add Server" primary action
- Table or card list: server name, transport type (stdio/SSE/streamable HTTP), status, connected tools count
- Detail view: server config, tool list with descriptions, connection logs, test button

### Core UI Blocks
- Server list (table or cards with status badges)
- Add server form (name, transport type selector, endpoint URL or command, authentication)
- Tool inventory list (auto-discovered tools with name, description, enabled toggle)
- Connection status card (connected/disconnected/error, last ping, latency)
- Test connection button with result display
- Server logs timeline (connection events, tool calls, errors)

### Common States
- **Loading**: Skeleton server cards
- **Empty**: "No MCP servers configured" with setup guide CTA
- **Connected**: Green status, tool count, last activity
- **Disconnected**: Gray status, reconnect button
- **Error**: Red status, error message, retry action
- **Discovering**: Spinner while fetching tool list from server

### Mobile Behavior
- Server list becomes single-column cards
- Detail view stacks vertically (status, config, tools, logs)
- Tool list as accordion (expand to see description)

### Permission Considerations
- Admin and owner: full configuration
- Manager: view servers and tools, cannot modify
- Member: no access (MCP config is infrastructure-level)

### Admin Visibility
Admin dashboard shows MCP server health summary. Audit log records all configuration changes.

### Anti-Patterns
- No connection testing before saving
- Exposing raw transport configuration without helper text
- No logging of tool invocations (audit requirement)
- Showing tool schemas in raw JSON without human-readable descriptions

---

## Webhooks Module

### Purpose
Push event notifications to external URLs.

### When to Include
The product emits events that external systems need to react to (new order, payment received, status change, etc.).

### Canonical Routes
- `/settings/webhooks` — Webhook endpoint list
- `/settings/webhooks/new` — Create webhook form
- `/settings/webhooks/[id]` — Edit webhook + delivery history

### Recommended Archetype
Table Index (list) + Detail page (edit + delivery log).

### Layout
- Page header: "Webhooks" title + "Add Endpoint" primary action
- Table: endpoint URL (truncated), subscribed events count, status, recent delivery status, actions
- Create/edit form: URL input, event type checkboxes, signing secret (generated), active toggle
- Delivery log: table of recent deliveries with timestamp, event type, HTTP status, response time, retry status

### Core UI Blocks
- Webhook endpoint table
- Create/edit form with event type selection
- Signing secret display (reveal + copy, generated on creation)
- Delivery history table with expandable rows (request/response details)
- Manual retry button per failed delivery
- Test webhook button (sends a test event)

### Common States
- **Loading**: Skeleton table
- **Empty**: "No webhook endpoints configured" with create CTA and documentation link
- **Active**: Green status, recent successful deliveries
- **Failing**: Yellow/red status, recent failures shown, retry available
- **Disabled**: Gray status, can be re-enabled

### Mobile Behavior
- Endpoint table converts to cards
- Delivery log converts to cards with expandable detail
- Event type selection uses a drawer instead of inline checkboxes

### Permission Considerations
- Admin and owner only
- Webhook creation and configuration is logged in audit trail
- Signing secrets are shown once, then masked

### Admin Visibility
Admin sees all webhook endpoints and can view delivery logs for debugging.

### Anti-Patterns
- No delivery history (impossible to debug failures)
- No test endpoint button (users have to trigger real events to test)
- Showing signing secret in plain text in the table
- No retry mechanism for failed deliveries

---

## Notifications Module

### Purpose
In-app and email notification preferences and delivery history.

### When to Include
The product generates events that users need to be aware of (new assignment, status change, comment, approaching deadline).

### Canonical Routes
- `/notifications` — Notification center (full page)
- Bell icon in header — Quick notification dropdown (recent items)
- `/settings/notifications` — Notification preferences

### Recommended Archetype
Notification center: Simple list page. Preferences: Settings page (see `11_internal_screen_archetypes.md`).

### Layout
- **Dropdown** (bell icon): max 5 recent notifications, "View all" link, mark all read
- **Full page**: chronological list grouped by day, filter by read/unread and type, mark as read/unread
- **Preferences**: table of notification types × channels (in-app, email), toggle per cell

### Core UI Blocks
- Notification item (icon, title, description, timestamp, read/unread dot, link to resource)
- Notification dropdown (compact list in header)
- Unread count badge on bell icon
- Mark all as read button
- Notification preference table (type rows × channel columns with toggles)
- Empty notification state

### Common States
- **Loading**: Skeleton notification items
- **Empty**: "No notifications yet" — no CTA needed (notifications come to you)
- **Unread**: Blue dot indicator, bold title text
- **Read**: Normal weight, no indicator
- **Error**: "Unable to load notifications" with retry

### Mobile Behavior
- Dropdown becomes a full-screen drawer or redirects to /notifications
- Full page: same layout, touch-friendly mark-as-read
- Preferences: table rows stack to cards with toggles

### Permission Considerations
- All authenticated users see their own notifications
- Notification preferences are per-user
- Admin can configure organization-level notification defaults
- Users can always override org defaults for their own account

### Admin Visibility
Admin does not see other users' notifications. Admin may configure which events generate notifications org-wide.

### Anti-Patterns
- Notifications with no link to the relevant resource
- No way to mark all as read
- Notification preferences buried deep in settings (should be accessible from notification center)
- Too many notification types without grouping

---

## Usage Module

### Purpose
Show resource consumption against plan limits.

### When to Include
The product has tiered plans with resource limits (API calls, storage, seats, records, etc.).

### Canonical Routes
- `/settings/usage` — Usage overview (often nested under settings or billing)

### Recommended Archetype
Billing/Usage page variant (see `11_internal_screen_archetypes.md`).

### Layout
- Page header: "Usage" title + current billing period dates
- Usage meters: progress bars for each limited resource (used / limit)
- Historical chart: usage over time for primary resource
- Plan context: current plan name, next billing date, upgrade CTA if approaching limits

### Core UI Blocks
- Usage meter bars (resource name, current/limit, percentage, color: green <60%, yellow 60-80%, red >80%)
- Historical usage chart (line chart, current period highlighted)
- Plan summary card (plan name, period, renewal date)
- Upgrade prompt (appears at 80%+ usage, links to billing/upgrade)
- Usage breakdown table (optional — per-resource detail)

### Common States
- **Loading**: Skeleton meters and chart
- **Empty**: Meters show 0/limit, chart shows flat line, "Start using [resource] to see usage data"
- **Normal**: Green meters, stable chart
- **Warning**: Yellow meters at 80%+, upgrade prompt visible
- **Critical**: Red meters at 95%+, prominent upgrade banner
- **Over limit**: Red meters at 100%+, feature restriction notice

### Mobile Behavior
- Meters stack vertically (full width)
- Chart reduces height
- Upgrade prompt becomes sticky bottom banner

### Permission Considerations
- All roles can view their own usage
- Admin and owner see org-wide usage
- Upgrade CTA links to billing (which may be admin-only)

### Admin Visibility
Admin sees aggregate usage across the organization. Admin dashboard may show usage warnings.

### Anti-Patterns
- No warning before hitting limits (surprise restriction)
- Usage data that's stale or delayed without timestamp
- Meters without clear labels for what "1,000" means
- No link from usage to upgrade path

---

## Activity Logs Module

### Purpose
Audit trail of actions taken within the product.

### When to Include
The product needs accountability, compliance, or debugging visibility into who did what and when.

### Canonical Routes
- `/settings/activity` — Activity log (may be under settings or admin)
- `/admin/audit-log` — Admin-level audit log with broader scope

### Recommended Archetype
Table Index page with timeline elements (see `11_internal_screen_archetypes.md`).

### Layout
- Page header: "Activity Log" title + date range filter
- Filter bar: user selector, action type filter, entity type filter, date range
- Activity list: timeline format (actor, action, target, timestamp) grouped by day
- Expandable rows for detail (IP address, metadata, before/after values for admin log)

### Core UI Blocks
- Activity timeline component (from `12_internal_component_specs.md`)
- Filter bar with user, action type, entity type, date range
- Day group headers
- Expandable detail rows (admin only)
- Export button (CSV)
- Pagination (not infinite scroll — audit logs need page navigation)

### Common States
- **Loading**: Skeleton timeline items
- **Empty**: "No activity recorded yet" (rare — system generates events on first login)
- **Success**: Timeline populated with events
- **Error**: Error banner with retry
- **Filtered empty**: "No activity matching these filters" with clear filters button

### Mobile Behavior
- Timeline layout works well on mobile (already single-column)
- Filters collapse into a "Filters" drawer
- Export moves to page header overflow menu
- Detail expansion works via tap

### Permission Considerations
- Admin and owner: full org-wide log with all details (IP, metadata)
- Manager: org-wide log with limited detail (no IP, no metadata)
- Member: own activity only
- Activity logs are read-only — no delete capability (audit integrity)

### Admin Visibility
Admin audit log is a superset of the user activity log. Includes admin actions (role changes, billing changes, user suspensions).

### Anti-Patterns
- Activity log that can be deleted or modified (defeats the purpose)
- No filtering (unusable at scale)
- Raw technical event names instead of human-readable descriptions
- No timezone context on timestamps
- Infinite scroll instead of pagination (audit needs precise navigation)

---

## Shared Module Rules

1. Only include modules relevant to the product.
2. Module pages must use the same page header and layout framing as all other app pages.
3. Every module must support loading, empty, success, and error states.
4. Technical configuration pages (API, webhooks, integrations, MCP) need helper text, input validation, and confirmation dialogs for destructive actions.
5. Module navigation items appear in the sidebar below core product features and above Settings.
6. Modules must respect the permissions matrix — hide navigation items for unauthorized roles, enforce at the API layer.
7. Reference `11_internal_screen_archetypes.md` for page layout patterns and `12_internal_component_specs.md` for component details.
8. Reference `15_canonical_breakpoints.md` for all responsive behavior.

## Final Principle

Modules should be optional but standardized. If a module exists, it should feel like part of the product, not a bolted-on control panel. Every module follows the same visual language, state handling, and permission enforcement as the core product.
