# Public Website Design System Tokens

> **TL;DR:** Defines all visual primitives (color, spacing, typography, radius, shadow, motion, layout, button tokens) for the public website in both light and dark mode.
> **Covers:** color tokens, spacing scale, typography scale, radius, shadows, motion, layout grid, button variants | **Depends on:** 15_canonical_breakpoints.md | **Used by:** component_library_spec.md, public_component_specs.md, public_screen_archetypes.md, saas_home_page_system.md | **Phase:** 13

## Purpose

Define the shared visual primitives for the public website. Every public page must use these tokens — no ad hoc values. This file is the website counterpart to `docs/framework/internal/10_design_tokens_internal.md`.

For responsive breakpoints, see `docs/framework/internal/15_canonical_breakpoints.md` (shared across internal + website + email).

---

## Color Tokens

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `bg-page` | `#FFFFFF` | Page background |
| `bg-surface` | `#F8F9FA` | Card backgrounds, elevated sections |
| `bg-surface-alt` | `#F1F3F5` | Alternating section backgrounds (every other section) |
| `bg-accent` | `#F0F4FF` | Highlighted sections (CTA blocks, feature callouts) |
| `border-default` | `#E5E7EB` | Card borders, dividers |
| `border-strong` | `#D1D5DB` | Input borders, interactive elements |
| `text-primary` | `#111827` | Headlines, primary body text |
| `text-secondary` | `#6B7280` | Descriptions, supporting text |
| `text-tertiary` | `#9CA3AF` | Placeholders, metadata, timestamps |
| `text-inverse` | `#FFFFFF` | Text on dark backgrounds (CTA buttons, dark sections) |

### Dark Mode

| Token | Value | Usage |
|-------|-------|-------|
| `bg-page` | `#0F1117` | Page background |
| `bg-surface` | `#1A1D27` | Card backgrounds, elevated sections |
| `bg-surface-alt` | `#22252F` | Alternating section backgrounds |
| `bg-accent` | `#1A2340` | Highlighted sections |
| `border-default` | `#2D3039` | Card borders, dividers |
| `border-strong` | `#3D4049` | Input borders, interactive elements |
| `text-primary` | `#F3F4F6` | Headlines, primary body text |
| `text-secondary` | `#9CA3AF` | Descriptions, supporting text |
| `text-tertiary` | `#6B7280` | Placeholders, metadata |
| `text-inverse` | `#111827` | Text on light backgrounds (rare in dark mode) |

### Brand / Primary Color

The primary color is project-overridable. Default:

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `primary-50` | `#EFF6FF` | `#1E3A5F` | Subtle backgrounds |
| `primary-100` | `#DBEAFE` | `#1E40AF` | Hover backgrounds |
| `primary-500` | `#3B82F6` | `#60A5FA` | Links, accents |
| `primary-600` | `#2563EB` | `#3B82F6` | Primary buttons, active states |
| `primary-700` | `#1D4ED8` | `#2563EB` | Button hover |
| `primary-900` | `#1E3A8A` | `#93C5FD` | Dark accents |

### Status Colors (same across light/dark)

| Token | Value | Usage |
|-------|-------|-------|
| `status-success` | `#16A34A` | Success states, positive metrics |
| `status-warning` | `#D97706` | Warnings, attention needed |
| `status-error` | `#DC2626` | Errors, destructive |

---

## Spacing Tokens

Base unit: 4px. Use consistently across all public pages.

| Token | Value | Common Usage |
|-------|-------|-------------|
| `space-1` | 4px | Tight gaps (icon to text) |
| `space-2` | 8px | Inline spacing, small gaps |
| `space-3` | 12px | Input padding, compact gaps |
| `space-4` | 16px | Standard padding, card padding, field gaps |
| `space-6` | 24px | Section padding (mobile), card padding (desktop) |
| `space-8` | 32px | Content group gaps |
| `space-10` | 40px | Section gaps (mobile) |
| `space-12` | 48px | Section padding (desktop) |
| `space-16` | 64px | Section vertical padding (desktop) |
| `space-20` | 80px | Large section separation |
| `space-24` | 96px | Hero padding, major section separation |
| `space-30` | 120px | Hero vertical padding (desktop) |

### Section Spacing Rules

| Context | Mobile (< 768px) | Desktop (≥ 1024px) |
|---------|------------------|---------------------|
| Hero padding (vertical) | `space-16` (64px) | `space-24` (96px) |
| Section padding (vertical) | `space-12` (48px) | `space-16` to `space-20` (64-80px) |
| Between cards in a grid | `space-4` (16px) | `space-6` (24px) |
| Between section headline and content | `space-6` (24px) | `space-8` (32px) |
| Between items in a list | `space-3` (12px) | `space-4` (16px) |

---

## Typography Tokens

Font stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

Projects may override the font. The scale and weights remain stable.

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `hero-headline` | 56px / 3.5rem | 800 | 1.1 | -0.02em | Home hero headline only |
| `page-headline` | 44px / 2.75rem | 700 | 1.15 | -0.02em | Interior page heroes |
| `section-headline` | 36px / 2.25rem | 700 | 1.2 | -0.01em | Section titles |
| `section-subheadline` | 20px / 1.25rem | 400 | 1.5 | 0 | Section descriptions |
| `card-title` | 20px / 1.25rem | 600 | 1.3 | 0 | Card headings, feature titles |
| `card-body` | 16px / 1rem | 400 | 1.6 | 0 | Card descriptions |
| `body-large` | 18px / 1.125rem | 400 | 1.6 | 0 | Hero subheadline, lead paragraphs |
| `body-default` | 16px / 1rem | 400 | 1.6 | 0 | Standard body text |
| `body-small` | 14px / 0.875rem | 400 | 1.5 | 0 | Helper text, captions |
| `label` | 14px / 0.875rem | 500 | 1.4 | 0.01em | Form labels, nav items |
| `overline` | 12px / 0.75rem | 600 | 1.3 | 0.08em | Category labels, section labels (uppercase) |
| `stat-number` | 48px / 3rem | 700 | 1.1 | -0.02em | Stats band numbers |
| `nav-item` | 15px / 0.9375rem | 500 | 1.4 | 0 | Header navigation links |
| `button-text` | 15px / 0.9375rem | 600 | 1.2 | 0.01em | Button labels |

### Mobile Typography Scale

Below 768px, reduce large headlines:

| Token | Mobile Size |
|-------|------------|
| `hero-headline` | 36px / 2.25rem |
| `page-headline` | 32px / 2rem |
| `section-headline` | 28px / 1.75rem |
| `stat-number` | 36px / 2.25rem |

All other tokens remain the same on mobile.

---

## Radius Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Small elements (badges, tags) |
| `radius-md` | 8px | Inputs, small cards |
| `radius-lg` | 12px | Cards, containers |
| `radius-xl` | 16px | Large cards, hero visuals |
| `radius-2xl` | 24px | Header pill, floating elements |
| `radius-full` | 9999px | Pill buttons, avatars, badges |

---

## Shadow Tokens

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `shadow-none` | none | none | Flat elements |
| `shadow-subtle` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.2)` | Subtle lift |
| `shadow-card` | `0 2px 8px rgba(0,0,0,0.06)` | `0 2px 8px rgba(0,0,0,0.3)` | Cards, containers |
| `shadow-elevated` | `0 8px 24px rgba(0,0,0,0.08)` | `0 8px 24px rgba(0,0,0,0.4)` | Dropdowns, floating header |
| `shadow-overlay` | `0 16px 48px rgba(0,0,0,0.12)` | `0 16px 48px rgba(0,0,0,0.5)` | Modals, drawers |

---

## Motion Tokens

The public website uses Motion (framer-motion) more expressively than the internal product. Animations serve conversion and delight — the website should feel alive and crafted.

### Interaction Durations

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `duration-fast` | 150ms | `ease-out` | Hover states, button feedback, nav underline |
| `duration-normal` | 250ms | `ease-in-out` | Dropdowns, accordions, tab transitions |
| `duration-slow` | 400ms | `ease-out` | Drawer open/close, mobile nav slide |
| `duration-entrance` | 500ms | `ease-out` | Scroll-triggered section entrances |
| `duration-hero` | 600ms | `ease-out` | Hero visual reveal, product screenshot entrance |
| `duration-count` | 1200ms | `ease-out` | Stats band number count-up |

### Marquee Durations

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `duration-marquee` | 30s | `linear` | Logo marquee scroll (per cycle) |
| `duration-marquee-slow` | 45s | `linear` | Testimonial marquee, integration grid |
| `duration-marquee-fast` | 20s | `linear` | Feature tags, secondary marquees |

### Stagger Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `stagger-cards` | 80ms | Card grid reveal |
| `stagger-lines` | 100ms | Headline line-by-line reveal |
| `stagger-list` | 60ms | Feature bullet points, FAQ items |

### Motion Rules
- Prefer opacity and transform transitions (GPU-accelerated)
- Scroll-triggered entrances fire once per element — not on every scroll direction change
- Content must be readable within 800ms of entering viewport
- Marquees use CSS `@keyframes` with `translateX` — not JS animation loops
- Respect `prefers-reduced-motion` — pause marquees, remove transforms, show instant opacity
- Accordion expand: height transition with `duration-normal`
- Hero elements can use staggered entrance (headline → subheadline → CTAs → visual)
- Cards hover: translateY(-4px) + shadow increase at `duration-fast`
- CTA buttons hover: scale(1.02) at `duration-fast` — never shift position

---

## Layout Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `max-width-content` | 1200px | Max content width for all public pages |
| `max-width-narrow` | 720px | Narrow content (blog posts, legal pages) |
| `max-width-wide` | 1400px | Wide content (pricing comparison, feature grids) |
| `header-height` | 64px | Sticky header height |
| `announcement-height` | 40px | Announcement bar height |
| `footer-padding-y` | 64px | Footer vertical padding |
| `section-padding-x` | 24px (mobile) / 48px (tablet) / 0 (desktop, centered) | Horizontal page padding |

### Grid System
- 12-column grid at `xl` and above
- Gutter: `space-6` (24px)
- Common layouts: 1-col, 2-col (6+6), 3-col (4+4+4), 4-col (3+3+3+3)
- Pricing cards: 3-col default, 2-col on tablet, 1-col stacked on mobile
- Feature grid: 3-col default, 2-col on tablet, 1-col on mobile

---

## Button Tokens

| Variant | Background | Text | Border | Hover Background |
|---------|-----------|------|--------|-----------------|
| Primary | `primary-600` | white | none | `primary-700` |
| Secondary | `bg-surface` | `text-primary` | `border-strong` | `bg-surface-alt` |
| Ghost | transparent | `text-secondary` | none | `bg-surface` |
| Outline | transparent | `primary-600` | `primary-600` | `primary-50` |

| Size | Height | Padding-X | Font Size | Radius |
|------|--------|-----------|-----------|--------|
| sm | 36px | 16px | 14px | `radius-md` |
| md | 44px | 24px | 15px | `radius-md` |
| lg | 52px | 32px | 16px | `radius-lg` |

Hero CTA buttons use `lg` size. Section CTAs use `md`. Inline CTAs use `sm`.

### Disabled State (all variants)

| Property | Value |
|----------|-------|
| Opacity | 0.5 |
| Cursor | `not-allowed` |
| Pointer events | none |
| No hover/focus state change |

### Focus State (all variants)

| Property | Value |
|----------|-------|
| Ring | 2px solid `primary-500` |
| Ring offset | 2px (ensures visibility on any background) |
| Outline | none (replaced by ring) |

In dark mode, use `primary-400` for the focus ring to maintain contrast on dark surfaces.

---

## Tailwind CSS Mapping

Map tokens to Tailwind theme extensions in `tailwind.config.ts`:

```
Spacing:   space-1 → 1 (p-1, m-1, gap-1)     = 4px
           space-2 → 2 (p-2, m-2, gap-2)     = 8px
           space-3 → 3 (p-3, m-3, gap-3)     = 12px
           space-4 → 4 (p-4, m-4, gap-4)     = 16px
           space-6 → 6 (p-6, m-6, gap-6)     = 24px
           space-8 → 8 (p-8, m-8, gap-8)     = 32px
           space-12 → 12 (p-12, m-12)        = 48px
           space-16 → 16 (p-16, m-16)        = 64px
           space-20 → 20 (p-20, m-20)        = 80px
           space-24 → 24 (p-24, m-24)        = 96px

Buttons:   sm → h-9 px-4 text-sm rounded-lg
           md → h-11 px-6 text-[15px] rounded-lg
           lg → h-[52px] px-8 text-base rounded-xl

Radius:    radius-sm → rounded (6px)
           radius-md → rounded-lg (8px)
           radius-lg → rounded-xl (12px)
           radius-xl → rounded-2xl (16px)
           radius-2xl → rounded-3xl (24px)
           radius-full → rounded-full

Shadows:   shadow-subtle → shadow-sm
           shadow-card → shadow
           shadow-elevated → shadow-lg
           shadow-overlay → shadow-2xl
```

Use CSS custom properties for colors (enables runtime light/dark switching):
```css
:root { --color-bg-page: #FFFFFF; --color-text-primary: #111827; ... }
.dark { --color-bg-page: #0F1117; --color-text-primary: #F3F4F6; ... }
```

---

## Accessibility Contrast Verification

Verified WCAG AA compliance (4.5:1 for body text, 3:1 for large text):

| Combination | Ratio | Pass? |
|-------------|-------|-------|
| `text-primary` (#111827) on `bg-page` (#FFFFFF) | 15.4:1 | Yes |
| `text-secondary` (#6B7280) on `bg-page` (#FFFFFF) | 5.0:1 | Yes |
| `text-tertiary` (#9CA3AF) on `bg-page` (#FFFFFF) | 3.0:1 | Large text only |
| `text-inverse` (#FFFFFF) on `primary-600` (#2563EB) | 4.6:1 | Yes |
| Dark: `text-primary` (#F3F4F6) on `bg-page` (#0F1117) | 14.8:1 | Yes |
| Dark: `text-secondary` (#9CA3AF) on `bg-page` (#0F1117) | 6.5:1 | Yes |

Rule: Never use `text-tertiary` for essential information — only for supplementary metadata.

---

## Dark Mode Shadow Rules

Dark mode uses higher opacity shadows because the base background is already dark and subtle shadows become invisible. This is intentional and differs from the internal product tokens (which use a lighter dark mode base). The principle: shadows must remain perceivable in both modes.

---

## Relationship to Internal Tokens

The public website and internal product use **separate** token files because their visual tone differs:
- Public website: more expressive, larger typography, more spacing, marketing-oriented
- Internal product: denser, more functional, data-oriented

They share:
- The same primary color palette (project-overridable)
- The same breakpoint scale (`15_canonical_breakpoints.md`)
- The same spacing base unit (4px)
- The same status colors

---

## Implementation Notes

Map these tokens to Tailwind CSS theme extensions in `tailwind.config.ts`. Use CSS custom properties for runtime theme switching (light/dark mode). The `prefers-color-scheme` media query handles automatic theme detection; a manual toggle overrides it.

## Final Principle

A token system is what keeps the site visually coherent across many pages and many iterations. Every value in this file exists to prevent improvisation.
