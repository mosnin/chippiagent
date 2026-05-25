# SaaS Home Page System

> **TL;DR:** Defines the canonical 14-section home page structure with conversion sequencing, section-by-section design rules, and mobile responsiveness guidance.
> **Covers:** hero, logo marquee, case studies, stats band, feature splits, pricing, testimonials, FAQ, CTA blocks, footer | **Depends on:** design_system_tokens.md, 15_canonical_breakpoints.md | **Used by:** saas_website_page_system.md, public_screen_archetypes.md, public_component_specs.md | **Phase:** 13

## Purpose

Define the canonical structure, design logic, and conversion sequencing for a modern SaaS home page that feels clean, premium, and intentionally designed rather than generic or over animated.

The home page should combine SaaS clarity with funnel logic.

## Core Strategic Model

The home page should function as a conversion system:

Attention → Orientation → Trust → Proof → Explanation → Proof → Conversion → Objection Handling → Final Conversion

This means every section must have a job. The page should not feel like random blocks stacked for decoration.

## Design Goals

The home page should feel:

- clean
- premium
- product led
- structured
- technically credible
- restrained
- responsive
- fast
- not template spam
- not AI looking

## Global Layout Sequence

1. Announcement bar
2. Pill style sticky header
3. Hero section
4. Logo marquee
5. Case studies or proof cards
6. Stats band
7. Split feature sections
8. Secondary proof layer
9. Pricing section
10. Mid page CTA
11. Testimonial rail
12. FAQ
13. Final CTA
14. Footer

## Announcement Bar

### Purpose

Surface immediate context without cluttering the hero.

### Use Cases

- product release
- limited time offer
- launch note
- webinar
- waitlist update
- major feature announcement

### Rules

- keep copy short
- use subtle contrast
- allow dismissal when appropriate
- persist dismissal state if implemented
- do not overload with multiple messages

## Pill Style Header

### Purpose

Provide navigation clarity and make the site feel polished immediately.

### Required Elements

Left:
- logo

Center:
- nav or mega menu

Right:
- theme toggle
- login
- primary CTA

### Rules

- floating pill container
- sticky behavior
- restrained border and shadow
- generous spacing
- large tap targets
- consistent with light and dark mode

## Hero

### Purpose

Explain what the product does, for whom, and why it matters within one screen.

### Structure

Left:
- headline
- subheadline
- primary CTA
- secondary CTA
- trust microcopy

Right:
- product visual
- dashboard composition
- workflow diagram
- refined UI stack

### Rules

- product first
- clear whitespace
- no decorative clutter
- no meaningless graphics
- the visual must support the message

## Logo Marquee

### Purpose

Deliver trust quickly.

### Rules

- use real logos only
- keep motion slow and smooth
- even spacing
- subdued treatment
- do not dominate the page

## Case Studies

### Purpose

Turn claims into believable outcomes.

### Card Structure

- customer or segment
- problem
- result
- supporting detail
- link or CTA

### Rules

- one dominant result per card
- keep copy tight
- focus on business outcomes
- avoid walls of text

## Stats Band

### Purpose

Compress proof into fast readable signals.

### Examples

- active users
- uptime
- tasks completed
- revenue influenced
- time saved
- approval rate

### Rules

- 3 to 5 stats
- large number, small explanation
- no decorative filler
- high contrast and readability

## Split Feature Sections

### Purpose

Do the main selling work of the page.

### Structure

Left:
- feature label
- headline
- explanation
- bullets
- CTA

Right:
- product diagram
- card based UI explanation
- workflow visual

### Rules

- explain mechanism, not just benefits
- use the same card language across all sections
- show transformation clearly
- keep section rhythm consistent

## Secondary Proof Layer

### Purpose

Reinforce trust after explanation.

### Possible Content

- mini stats
- customer logos
- implementation speed
- usage scale
- performance metrics

## Pricing Section

### Purpose

Help high intent users evaluate cost and value cleanly.

### Required Elements

- pricing headline
- monthly and annual toggle when relevant
- 2 to 4 pricing cards
- highlighted recommended plan
- feature highlights
- CTA per plan
- billing FAQ or notes
- enterprise contact path if relevant

### Pricing Rules

- make decision boundaries obvious
- do not hide what is included
- avoid dark pattern billing language
- trust copy should support conversion but remain truthful

## Mid Page CTA

### Purpose

Capture qualified visitors after trust and explanation have landed.

### Rules

- short and focused
- one action
- light supporting reassurance
- visually simpler than the hero

## Testimonials

### Purpose

Add human validation and emotional relief.

### Rules

- use concrete quotes
- prefer testimonials with results and relief
- slow, smooth motion only
- keep names, roles, and companies visible

## FAQ

### Purpose

Resolve objections before the final CTA.

### FAQ Topics

- setup
- pricing
- integrations
- security
- support
- migration
- trial terms

### Rules

- concise answers
- accordion behavior
- strong tap targets
- not a legal document

## Final CTA

### Purpose

Provide a clean decisive final conversion moment.

### Rules

- direct headline
- one main CTA
- optional reassurance line
- no clutter

## Footer

### Purpose

End the experience with trust, navigation, and legal clarity.

### Recommended Columns

- product
- resources
- company
- legal

## Theme System

### Default Guidance

- light mode: white or off white base
- dark mode: charcoal base

### Rules

- design both modes intentionally
- avoid pure black
- maintain contrast
- keep component styling consistent

## Mobile Responsiveness

### Rules

- stack hero vertically
- sidebar navigation becomes drawer
- feature splits become vertical
- pricing cards remain readable
- testimonial rail becomes swipeable or simplified
- FAQ remains easy to tap
- footer stacks cleanly

## Website Animation & Motion System

The public website uses Motion (framer-motion) expressively — more creative and energetic than the internal product, but always purposeful. Every animation must serve conversion, clarity, or delight. Never animate for decoration alone.

### Scroll-Triggered Entrances

Sections fade in as they enter the viewport. Use IntersectionObserver + Motion.

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Section headline | opacity 0→1, y: 24→0 | 500ms | ease-out |
| Section subheadline | opacity 0→1, y: 16→0 | 500ms, 100ms delay | ease-out |
| Cards (staggered) | opacity 0→1, y: 20→0 | 400ms + 80ms stagger | ease-out |
| Feature visual/screenshot | opacity 0→1, scale: 0.97→1 | 600ms | ease-out |
| Stats band numbers | Count-up from 0 to value | 1.2s | ease-out (decelerate) |
| CTA buttons | opacity 0→1, y: 12→0 | 400ms, 200ms delay | ease-out |

**Rules:**
- Trigger once per element (not on every scroll direction change)
- Trigger when element is ~20% visible
- Keep entrance animations under 600ms
- Stagger children with 60-100ms gap — enough to create reading order, not enough to feel slow

### Marquee Components

Marquees add kinetic energy and social proof. The website supports multiple marquee patterns:

**Logo Marquee (trust strip):**
- Continuous left scroll, 30s per cycle, linear easing
- Logos grayscale at 50% opacity → full color on hover (optional)
- Duplicate logo set for seamless loop
- Pause on hover (optional)
- Gap: 48px between logos

**Testimonial Marquee:**
- Horizontal scroll of testimonial cards, slower pace (40-50s per cycle)
- Cards at full opacity, slight scale (0.98) for non-center cards
- Two rows scrolling in opposite directions creates a dynamic "wall of love" effect
- Each row can have different speed (row 1: 35s, row 2: 45s)

**Feature/Integration Marquee:**
- Grid of integration logos or feature tags scrolling horizontally
- Works well as a secondary trust signal or to show breadth of integrations
- Same seamless loop technique as logo marquee

**Marquee Implementation Rules:**
- Use CSS `@keyframes` with `translateX` for the base scroll — GPU-accelerated, no JS overhead
- Duplicate the content track to create seamless loop
- Pause animation on `prefers-reduced-motion`
- Never marquee essential information — users must be able to read it without chasing it
- Mobile: same behavior, slightly smaller content. Do not disable marquees on mobile

### Hero Section Animation

The hero is the first thing users see — it should feel alive but not busy:

- Headline: staggered word or line reveal (fade + y shift), 400ms per line, 100ms stagger
- Subheadline: fade in after headline completes, 400ms
- CTA buttons: fade + slight y shift, 300ms, after subheadline
- Product visual: fade + subtle scale (0.96→1), 600ms, can begin simultaneously with text
- Optional: subtle floating animation on product visual (y: 0 → -8 → 0, 4s cycle, ease-in-out) — use sparingly

### Interactive Hover Effects (Website Only)

The public site allows more expressive hover states than the internal product:

- **Cards**: translateY(-4px) + shadow increase + optional border color shift, 200ms ease-out
- **Feature visuals**: slight scale (1.02) on parent card hover, 300ms ease-out
- **CTA buttons**: scale(1.02) + shadow increase, 150ms ease-out. Never shift position.
- **Nav items**: underline slide-in from left, 200ms ease-out
- **Footer links**: color shift only, 150ms

### Animated Backgrounds (Use Sparingly)

- Subtle gradient mesh that shifts slowly (20-30s cycle) — hero section only
- Dot grid or grain texture with very subtle parallax on mouse move (2-4px max offset)
- Never use particle systems, 3D scenes, or anything that tanks mobile performance
- These are opt-in per project — not default. Only add if the product visual identity benefits from it

### What NOT to Animate on the Website

- Text color changes on scroll (distracting)
- Parallax on every section (dated, performance cost)
- Scroll-jacking (never)
- Elements that animate every time they enter/leave viewport (once only)
- Decorative SVG line draws (feels 2019)
- Anything that delays content being readable by more than 800ms total

### Reduced Motion

Always provide a `prefers-reduced-motion` fallback:
- Marquees: pause entirely (show static row)
- Scroll entrances: instant opacity (no transform)
- Hero: all elements visible immediately
- Hover effects: reduce to opacity/color only (no transforms)

## Performance Rules

- do not trade speed for visual novelty
- optimize images
- Motion is allowed generously on the website but must be GPU-accelerated (opacity, transform only)
- Marquees use CSS @keyframes, not JS animation loops
- Lazy-load scroll-triggered animations (IntersectionObserver, not scroll event listeners)
- preserve fast mobile load performance
- Test animation performance on mid-tier Android devices, not just MacBook Pro

## Final Principle

The highest quality home page feels minimal in noise but rich in structure. It should look like a serious SaaS company that understands both product communication and conversion sequencing.
