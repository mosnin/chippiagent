# 01 App Shell

> **TL;DR:** Defines the authenticated app frame — top bar, sidebar, drawer, page header, user menu, and responsive shell behavior.
> **Covers:** layout, navigation, sidebar, drawer, user menu, responsive shell | **Depends on:** 08, 10, 12, 15 | **Used by:** 03, 09, 11 | **Phase:** 7

## Purpose

Define the canonical authenticated application shell for SaaS products. This file governs layout, navigation, header behavior, drawer behavior, user access entry points, and shell level state handling.

## Core Principle

The app shell is the persistent operating frame of the product. Feature pages change inside it, but the shell itself should remain stable.

## Canonical Shell Structure

1. Top bar
2. Desktop sidebar
3. Mobile drawer
4. Main content area
5. Page header
6. Optional utility panel
7. User menu

## Top Bar Requirements

The top bar must support:

- product identity
- workspace identity when relevant
- global search when relevant
- notifications when relevant
- user menu

## Desktop Sidebar

The desktop sidebar is the primary internal navigation system.

### Recommended Sidebar Items

- Dashboard
- Analytics when relevant
- Core feature modules
- Integrations when relevant
- API when relevant
- Webhooks when relevant
- Settings
- Admin for authorized roles only

## Mobile Drawer

Mobile navigation must not reuse the desktop sidebar directly.

### Mobile Drawer Should Include

- logo
- primary nav items
- secondary nav items
- settings
- billing
- logout

## Main Content Area

The main content area is where authenticated pages render.

### Rules

1. Use a consistent container system.
2. Support both dense and wide views intentionally.
3. Every page must support loading, empty, success, and error states.
4. Permission denied and not found states must be supported when relevant.

## Page Header Pattern

Every authenticated page should begin with a page header.

### Required Page Header Fields

- page title
- brief context when useful
- primary action
- secondary actions when relevant
- filters or controls when appropriate

## User Menu

The user menu is the canonical access point for account level actions.

### Required Items

- profile
- workspace or organization settings when relevant
- billing
- security
- logout

## Workspace Switching

Only include workspace switching when the product genuinely supports multiple organizations or workspaces.

## Shell State Requirements

The shell must support:

- authenticated state
- unauthenticated redirect behavior
- shell loading state
- restricted access state
- incomplete setup state when relevant
- shell data failure state when relevant

## Responsive Rules

- desktop uses persistent sidebar
- mobile uses drawer
- page headers stack cleanly
- dense layouts must degrade intentionally
- primary actions remain visible and tappable

## Final Principle

Build the shell once, reuse it everywhere, and do not allow feature work to invent competing shell systems.
