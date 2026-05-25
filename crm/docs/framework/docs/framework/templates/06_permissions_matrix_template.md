# 06 Permissions Matrix

> **TL;DR:** Template for defining user roles, route-level access controls, and permission enforcement rules.
> **Covers:** role definitions, route access matrix, enforcement layers, role assignment rules | **Phase:** 2

## Instructions

Define all roles and their access levels. The route access matrix should cover every protected route in the application. Use these access levels: full (read + write), view (read only), own (only their own data), none (no access, route hidden).

## Roles

> Example:
> - **Owner**: Full access to everything including workspace deletion and ownership transfer. One per organization.
> - **Admin**: Full access to settings, billing, user management, and all features. Cannot delete workspace or transfer ownership.
> - **Manager**: Full access to core features and team data. Can view analytics. Cannot manage billing or admin settings.
> - **Member**: Can create and manage their own data. Can view shared dashboards. Cannot access settings beyond their own profile.

## Route Access Matrix

> Example:

| Route | Owner | Admin | Manager | Member |
|-------|-------|-------|---------|--------|
| /dashboard | full | full | full | full |
| /analytics | full | full | view | view |
| /invoices | full | full | full | own |
| /clients | full | full | full | own |
| /integrations | full | full | view | none |
| /settings/profile | full | full | full | full |
| /settings/workspace | full | full | view | none |
| /settings/billing | full | full | none | none |
| /settings/security | full | full | full | full |
| /settings/notifications | full | full | full | full |
| /admin | full | full | none | none |
| /admin/users | full | full | none | none |
| /admin/billing | full | view | none | none |
| /admin/logs | full | full | none | none |

## Enforcement Rules

> Example:
> - Routes with "none" access must not appear in the sidebar or any navigation for that role.
> - Routes with "view" access render the page in read-only mode — action buttons are hidden, not disabled.
> - Routes with "own" access filter data to only show records created by or assigned to the current user.
> - Permission checks happen at three layers: middleware (route access), API (data access), UI (button/link visibility).

## Notes

> Example:
> - Owner role cannot be assigned — only transferred via /settings/workspace.
> - Manager role is optional — omit if the product does not need a middle tier.
> - Role changes take effect immediately — no session restart required.
