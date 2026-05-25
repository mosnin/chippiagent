# 03 Dashboard System

> **TL;DR:** Defines the canonical dashboard framework — anatomy, summary rows, main work area, analytics, role-aware logic, required states, and mobile rules.
> **Covers:** dashboard anatomy, summary cards, main work area, analytics, role-aware logic, required states | **Depends on:** 08, 13, 16 | **Used by:** 09, 11 | **Phase:** 8

## Purpose

Define the canonical dashboard framework for authenticated SaaS users.

## Dashboard Principle

The dashboard must answer:

1. what is happening
2. what needs attention
3. what should happen next
4. what value is being created

## Canonical Dashboard Anatomy

1. page header
2. summary row
3. main work area
4. secondary insights
5. recent activity
6. alerts or recommendations
7. empty states when no data exists

## Summary Row

Use summary cards for meaningful metrics or statuses.

## Main Work Area

The main work area is the product core.

### Example Patterns

- queue
- pipeline
- inbox
- workflow runner
- content workspace
- feed
- calendar
- task board
- report view

## Analytics Requirement

Most products should have an analytics page or analytics section.

### Standard Analytics Contents

- overview metrics
- trends
- segments
- funnel or flow analysis when relevant
- top entities
- date filters

## Role Aware Logic

Dashboard composition may vary by:

- role
- plan
- setup state
- module access
- data availability

## Required States

Every dashboard must support:

- loading
- empty
- zero data
- partial data
- error
- restricted access
- offline or sync failure when relevant

## Mobile Rules

- stack summary cards predictably
- avoid unnecessary horizontal scroll
- collapse tables intelligently
- keep actions visible

## Dashboard Archetypes

For concrete, buildable dashboard patterns (queue, pipeline, analytics, content workspace, operations, monitoring, admin overview), see `16_dashboard_archetypes.md`. That file defines specific layout, summary cards, secondary insights, activity patterns, alert patterns, empty states, mobile behavior, and common mistakes for each dashboard type.

When building a dashboard, first identify which archetype matches the product, then use the archetype spec as the construction blueprint.

## Final Principle

A dashboard is not a wall of charts. It is an operational control surface centered around the core job the user is trying to accomplish.
