# Public Website Component Library Specification

> **TL;DR:** Inventories all reusable public site components (header, hero, cards, forms, footer, etc.) with shared rules, variants, and accessibility requirements.
> **Covers:** component inventory, button variants, card types, forms, accessibility, page composition | **Depends on:** design_system_tokens.md, public_component_specs.md, 15_canonical_breakpoints.md | **Used by:** public_screen_archetypes.md, public_copy_conversion_rules.md | **Phase:** 13

## Purpose

Define the reusable public site components so that all public pages feel cohesive and production ready.

For detailed visual specs (dimensions, spacing, states, mobile behavior) of each component, see `public_component_specs.md`. This file defines the component inventory, shared rules, and variants.

## Core Components

- Header (pill-style sticky navigation)
- Announcement Bar
- Mega Menu / Dropdown Navigation
- Mobile Navigation Drawer
- Hero Section (home + interior variants)
- CTA Block (mid-page and final)
- Logo Marquee
- Testimonial Marquee (wall of love)
- Case Study / Proof Card
- Stat Card (stats band)
- Feature Split Section
- Pricing Card
- Pricing Comparison Table
- FAQ Accordion
- Testimonial Card
- Footer
- Blog / Resource Card
- Integration Card
- Form Block (contact, demo, waitlist)

## Shared Component Rules

1. Reuse components before creating new variations.
2. All spacing, typography, color, radius, and shadow values come from `design_system_tokens.md` — no ad hoc values.
3. Components must support light and dark mode using token-based theming.
4. Components must be responsive per `docs/framework/internal/15_canonical_breakpoints.md`.
5. Components must support hover and focus states when interactive.
6. All interactive components must be keyboard navigable with visible focus rings.

## Button Variants

| Variant | Usage |
|---------|-------|
| Primary | Main CTA actions (signup, start trial) |
| Secondary | Secondary actions (learn more, see demo) |
| Ghost | Tertiary links within sections |
| Outline | Alternative to secondary, especially on colored backgrounds |

Button sizes: `sm` (36px), `md` (44px), `lg` (52px). See `design_system_tokens.md` for full specs.

## Card Variants

| Card Type | Usage | Key File |
|-----------|-------|----------|
| Proof / Case Study Card | Customer outcome stories | `public_component_specs.md` |
| Pricing Card | Plan comparison | `public_component_specs.md` |
| Testimonial Card | Customer quotes | `public_component_specs.md` |
| Feature Card | Feature catalog grid | `public_component_specs.md` |
| Blog / Resource Card | Content previews | `public_component_specs.md` |
| Integration Card | Partner/integration logos | `public_component_specs.md` |

## Forms

Public site forms include:

- Demo request (name, email, company, message)
- Contact (name, email, subject, message)
- Newsletter (email only)
- Waitlist (email, optional company)

All forms follow the form block spec in `public_component_specs.md`. Copy rules in `public_copy_conversion_rules.md`.

## Page Composition

Every public page uses components from this library assembled according to page archetypes defined in `public_screen_archetypes.md`. The section order per page type is specified there.

## Accessibility Requirements

- Keyboard support on all interactive elements
- Visible focus states (2px ring using `primary-500`)
- WCAG AA contrast compliance (4.5:1 for body text, 3:1 for large text)
- Touch targets minimum 44px on mobile
- Skip-to-content link as first focusable element
- ARIA labels on icon-only buttons
- Reduced motion support (`prefers-reduced-motion`) — marquees pause, scroll entrances become instant, transforms removed

## Final Principle

A strong public component system reduces visual drift and makes the entire website feel engineered rather than assembled from random blocks. Every component is built once, specified in `public_component_specs.md`, and reused everywhere.
