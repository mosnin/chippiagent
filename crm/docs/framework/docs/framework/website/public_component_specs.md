# Public Website Component Specs

> **TL;DR:** Provides detailed visual specs (dimensions, spacing, states, interaction rules, mobile behavior) for every canonical public website component.
> **Covers:** pill header, mobile drawer, announcement bar, hero, logo marquee, proof cards, stats band, feature split, pricing card, comparison table, testimonial, FAQ accordion, CTA block, footer, blog card, integration card, form block | **Depends on:** design_system_tokens.md, 15_canonical_breakpoints.md | **Used by:** component_library_spec.md, public_screen_archetypes.md | **Phase:** 13

## Purpose

Define the visual structure, spacing, states, and interaction rules for every canonical public website component. This is the website counterpart to `docs/framework/internal/12_internal_component_specs.md`.

Use `design_system_tokens.md` for all token values. Use `docs/framework/internal/15_canonical_breakpoints.md` for responsive breakpoints.

### Breakpoint Quick Reference
When this file says "mobile" it means **below 768px (md)**. "Tablet" = **768px–1023px**. "Desktop" = **1024px+ (lg)**.

---

## Pill Header / Navigation Bar

### Role
Primary navigation. Floating, sticky, polished.

### Visual Structure
```
┌─────────────────────────────────────────────────┐
│  [Logo]    Product  Pricing  Resources    [CTA]  │
└─────────────────────────────────────────────────┘
```

### Specs
- Container: max-width 1200px, centered, radius-2xl (24px), shadow-elevated
- Background: bg-page with 80% opacity + backdrop-blur (12px)
- Height: 64px
- Padding: space-2 vertical, space-4 horizontal
- Position: fixed top, 12px from top edge, centered horizontally
- z-index: z-sticky (20)
- Logo: max-height 32px, left-aligned
- Nav items: nav-item size (15px), font-weight 500, text-secondary, space-1 gap between items
- Nav hover: text-primary, duration-fast transition
- Active nav: text-primary, font-weight 600
- Right section: theme toggle (icon button, 36px) + CTA button (md size, primary variant)
- Gap between right items: space-3

### Mobile (below lg: 1024px)
- Remove nav items, show hamburger icon (24px) on right
- Logo remains left
- CTA moves inside mobile drawer
- Header becomes full-width with space-4 horizontal padding, radius-none
- Top offset: 0

---

## Mobile Navigation Drawer

### Role
Full-screen mobile navigation replacing header nav.

### Visual Structure
```
┌──────────────────────┐
│  [Logo]        [X]   │
│                       │
│  Product              │
│  Pricing              │
│  Solutions            │
│  Resources ▼          │
│    - Blog             │
│    - Docs             │
│  Company ▼            │
│    - About            │
│    - Contact          │
│                       │
│  [Login]              │
│  [Start Free Trial]   │
└──────────────────────┘
```

### Specs
- Full viewport width and height (100vw × 100vh)
- Background: bg-page
- z-index: z-modal (40)
- Header row: logo left, close X right (24px), height 64px
- Nav items: body-large (18px), font-weight 500, space-6 vertical gap
- Submenu: indented space-6, body-default (16px), text-secondary
- Expand arrow: 16px chevron, rotate on open with duration-normal
- Bottom section: Login (ghost button, full width) + CTA (primary button, full width), space-3 gap
- Bottom section: pinned to bottom with space-6 padding
- Backdrop: none (drawer covers full screen)
- Animation: slide in from right, duration-slow

---

## Announcement Bar

### Role
Top-of-page context strip for time-sensitive info.

### Visual Structure
```
┌─────────────────────────────────────────────┐
│  🎉  New: Feature X is here. Learn more →   │
└─────────────────────────────────────────────┘
```

### Specs
- Full width, height: 40px
- Background: primary-600 (or bg-surface-alt for subtle variant)
- Text: body-small (14px), font-weight 500, text-inverse (or text-primary for subtle)
- Centered text with inline link
- Link: underline on hover
- Dismiss X: 14px, right-aligned, space-4 from edge
- Position: above header, not sticky (scrolls away)

### Mobile
- Same layout, text may truncate with ellipsis at narrow widths
- Dismiss X always visible

---

## Hero Section (Home)

### Role
First impression. Explain what, for whom, why.

### Visual Structure
```
┌──────────────────────────────────────────────┐
│                                              │
│  Overline label                              │
│  Main Headline That                          │
│  Explains the Product            [Product    │
│                                   Visual]    │
│  Supporting subheadline that                 │
│  adds context and specificity                │
│                                              │
│  [Start Free Trial]  [See Demo]              │
│  ✓ No credit card required                   │
│                                              │
└──────────────────────────────────────────────┘
```

### Specs
- Layout: 2-column (55% text, 45% visual) at lg+, stacked below lg
- Padding: space-24 (96px) vertical desktop, space-16 (64px) mobile
- Overline: overline token (12px, uppercase, letter-spacing 0.08em), text-secondary
- Headline: hero-headline (56px desktop, 36px mobile), font-weight 800, text-primary
- Subheadline: body-large (18px), text-secondary, max-width 520px, margin-top space-4
- CTA row: margin-top space-8, gap space-3 between buttons
- Primary CTA: button lg size, primary variant
- Secondary CTA: button lg size, outline variant
- Trust microcopy: body-small (14px), text-tertiary, margin-top space-3, checkmark icon (14px)
- Product visual: max-width 100%, radius-xl, shadow-card, may be screenshot, illustration, or composed UI

### Entrance Animation
- Headline: staggered line reveal (opacity 0→1, y: 20→0), 400ms per line, 100ms stagger
- Subheadline: fade in after headline completes, 400ms ease-out
- CTA buttons: fade + y shift (12→0), 300ms, after subheadline
- Product visual: fade + scale (0.96→1), 600ms ease-out, can begin simultaneously with text
- Optional: subtle floating animation on product visual after entrance (y: 0 → -8 → 0, 4s cycle, ease-in-out)
- Trust microcopy: simple opacity fade, 300ms, after CTAs

### Mobile
- Stacked: text above, visual below
- Visual: full width, margin-top space-8
- CTAs: full width, stacked (primary on top), gap space-3
- Same entrance animations, simplified: no line-by-line stagger on headline (fade entire block)

---

## Page Hero (Interior)

### Role
Shorter hero for non-home pages.

### Specs
- Centered text, no visual
- Padding: space-16 (64px) vertical desktop, space-12 (48px) mobile
- Background: bg-surface-alt or bg-page
- Headline: page-headline (44px desktop, 32px mobile), text-primary, centered
- Description: section-subheadline (20px), text-secondary, centered, max-width 640px
- Optional badge/label above headline: overline style

---

## Logo Marquee

### Role
Trust signal. Scrolling logo strip that adds kinetic energy to the page.

### Visual Structure
```
─── [Logo] ─── [Logo] ─── [Logo] ─── [Logo] ───
```

### Specs
- Full width container, overflow hidden
- Logo height: 24-32px, grayscale by default, opacity 0.5
- Logo hover: full color, opacity 1.0 (optional, not required)
- Gap between logos: space-12 (48px)
- Animation: continuous scroll left, duration-marquee (30s per cycle), linear, CSS @keyframes translateX
- Duplicate the entire logo track to create seamless infinite loop
- Padding: space-12 vertical
- Optional: pause on hover (CSS `animation-play-state: paused`)

### Implementation
```css
@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```
Render logos twice (two identical sets). Container uses `overflow: hidden`. Inner track uses `display: flex`, `width: max-content`, `animation: marquee 30s linear infinite`.

### Mobile
- Same behavior, slightly smaller logos (20-28px)
- Fewer visible at any time (overflow handles it)
- Do not disable on mobile

### Reduced Motion
- `prefers-reduced-motion`: stop animation, show static centered row of logos

---

## Testimonial Marquee

### Role
Social proof wall. Multiple rows of testimonials scrolling creates a "wall of love" effect that implies volume and trust.

### Visual Structure
```
→ [Card] [Card] [Card] [Card] [Card] →
← [Card] [Card] [Card] [Card] [Card] ←
```

### Specs
- Two rows scrolling in opposite directions
- Row 1: scroll left, duration-marquee-slow (45s per cycle)
- Row 2: scroll right, duration-marquee (30s per cycle) — different speed creates visual interest
- Card width: 360px (desktop), 300px (mobile)
- Card gap: space-4
- Cards use the standard testimonial card spec (see Testimonial Card section)
- Container: full width, overflow hidden, padding space-16 vertical
- Optional: slight scale (0.98) and reduced opacity (0.8) for cards furthest from center, full scale/opacity at center
- Implementation: same CSS @keyframes translateX technique as logo marquee, but applied to card rows

### Mobile
- Same behavior, card width reduces to 280px
- Two rows maintained — the effect works on all screen sizes

### Reduced Motion
- Show static grid of 4-6 testimonials (2 columns), no scrolling

---

## Case Study / Proof Card

### Role
Customer outcome as a scannable card.

### Visual Structure
```
┌──────────────────────────┐
│  [Company Logo]          │
│  "Headline result stat"  │
│                          │
│  Problem → Result        │
│  summary in 2-3 lines    │
│                          │
│  Read story →            │
└──────────────────────────┘
```

### Specs
- Container: bg-surface, border border-default, radius-lg, shadow-subtle
- Padding: space-6
- Logo: max-height 28px, top-left
- Headline result: card-title (20px), font-weight 700, text-primary, margin-top space-4
- Description: card-body (16px), text-secondary, margin-top space-2, max 3 lines
- Link: body-small (14px), primary-500, font-weight 500, margin-top space-4, arrow icon (12px)
- Hover: shadow-card, transform translateY(-2px), duration-fast

### Mobile
- Full width cards, stacked with space-4 gap

---

## Stats Band

### Role
Compressed proof metrics.

### Visual Structure
```
┌───────────────────────────────────────────────┐
│   2,400+        99.9%        <2 min          │
│   Active teams  Uptime       Avg setup time  │
└───────────────────────────────────────────────┘
```

### Specs
- Full width section, bg-surface-alt or bg-accent background
- Padding: space-12 vertical
- Layout: flex row, justify-center, gap space-16 between stats
- Stat number: stat-number (48px desktop, 36px mobile), font-weight 700, text-primary
- Stat label: body-small (14px), text-secondary, margin-top space-1
- Text-align: center per stat
- Max stats: 5 (3-4 preferred)
- Dividers between stats: optional vertical line, border-default, height 40px

### Mobile
- 2-column grid (below lg) or 3-column if 3 stats
- Gap reduces to space-8

---

## Feature Split Section

### Role
Main selling work. Alternating content + visual rows.

### Visual Structure
```
┌──────────────────────────────────────────────┐
│                                              │
│  Feature label           [Feature            │
│  Feature Headline         Visual /           │
│                           Screenshot]        │
│  Explanation paragraph                       │
│  that describes the                          │
│  mechanism clearly                           │
│                                              │
│  • Bullet point one                          │
│  • Bullet point two                          │
│  • Bullet point three                        │
│                                              │
│  [Learn more →]                              │
│                                              │
└──────────────────────────────────────────────┘
```

### Specs
- Layout: 2-column (50/50) at lg+, stacked below
- Alternating: odd sections text-left/visual-right, even sections visual-left/text-right
- Section padding: space-16 to space-20 vertical
- Label: overline (12px, uppercase), primary-500 color
- Headline: section-headline (36px), text-primary, margin-top space-2
- Description: body-default (16px), text-secondary, margin-top space-4, max-width 480px
- Bullets: body-default, text-secondary, space-2 gap, checkmark or dot icon (16px, primary-500)
- CTA link: body-default (16px), primary-500, font-weight 500, arrow icon, margin-top space-4
- Visual: max-width 100%, radius-xl, shadow-card

### Mobile
- Always stacked: text above, visual below
- Visual: full width, margin-top space-6

---

## Pricing Card

### Role
Plan comparison card with features and CTA.

### Visual Structure
```
┌──────────────────────┐
│  [Most Popular]       │
│  Plan Name            │
│  $29/mo               │
│  Short description    │
│                       │
│  [Start Plan]         │
│                       │
│  ✓ Feature one        │
│  ✓ Feature two        │
│  ✓ Feature three      │
│  ✓ Feature four       │
└──────────────────────┘
```

### Specs
- Container: bg-surface, border border-default, radius-lg, shadow-subtle
- Recommended plan: border primary-500 (2px), shadow-card
- Padding: space-6
- Badge (if recommended): overline style, primary-100 bg, primary-700 text, radius-full, margin-bottom space-3
- Plan name: card-title (20px), font-weight 600, text-primary
- Price: stat-number (48px) for dollar amount + body-default for period ("/mo"), margin-top space-2
- Description: body-small (14px), text-secondary, margin-top space-1
- CTA button: full width, md size, primary variant (recommended) or secondary variant (others), margin-top space-6
- Feature list: margin-top space-6, body-small (14px), text-secondary, space-2 gap between items
- Feature icon: checkmark 14px, primary-500 (included) or text-tertiary (not included with strikethrough)

### Mobile
- Cards stack vertically
- Recommended plan shown first
- Full width per card

---

## Pricing Comparison Table

### Role
Detailed feature comparison across plans.

### Specs
- Container: border border-default, radius-lg, overflow hidden
- Header row: sticky, bg-surface-alt, plan names as column headers
- Row: body-small (14px), space-3 padding, border-bottom border-default
- Feature name: text-primary, left-aligned
- Feature value: centered, checkmark icon (included), dash (not included), or text value
- Category rows: font-weight 600, bg-surface-alt, act as section headers
- Alternating row backgrounds: bg-page / bg-surface (subtle)

### Mobile
- Horizontal scroll with pinned feature name column
- Or: collapse to per-plan accordion (show features per plan, not per feature)

---

## Testimonial Card

### Role
Customer quote with attribution.

### Visual Structure
```
┌──────────────────────────────┐
│  "Quote text that shares     │
│   a specific result or       │
│   relief from the product."  │
│                              │
│  [Avatar] Name               │
│           Role, Company      │
└──────────────────────────────┘
```

### Specs
- Container: bg-surface, border border-default, radius-lg, padding space-6
- Quote: body-large (18px), text-primary, font-style italic (optional), line-height 1.6
- Attribution row: margin-top space-4, flex row, gap space-3
- Avatar: 40px circle, radius-full
- Name: body-small (14px), font-weight 600, text-primary
- Role/Company: body-small (14px), text-secondary

### Rail Layout
- Horizontal scroll with snap behavior
- Card width: 360px (desktop), 300px (mobile)
- Gap: space-4
- Peek next card by ~40px to indicate scrollability

---

## FAQ Accordion

### Role
Objection resolution before final CTA.

### Visual Structure
```
┌──────────────────────────────────┐
│  Question text here?          +  │
├──────────────────────────────────┤
│  Answer text that is concise     │
│  and helpful.                    │
└──────────────────────────────────┘
```

### Specs
- Container: max-width 720px, centered
- Item border: border-bottom border-default
- Question row: padding space-4 vertical, flex row justify-between
- Question text: body-default (16px), font-weight 500, text-primary
- Toggle icon: plus/minus or chevron, 20px, text-secondary, rotate with duration-normal
- Answer: body-default (16px), text-secondary, padding space-4 bottom, line-height 1.6
- Animation: height expand with duration-normal
- First item: optionally open by default

### Mobile
- Full width (inherits parent padding)
- Touch target: full question row height (min 48px)

---

## CTA Block

### Role
Mid-page or final conversion moment.

### Visual Structure
```
┌──────────────────────────────────────────────┐
│                                              │
│         Ready to get started?                │
│         Start your free 14-day trial         │
│                                              │
│            [Start Free Trial]                │
│         No credit card required              │
│                                              │
└──────────────────────────────────────────────┘
```

### Specs
- Full width section, bg-accent background (or bg-surface-alt)
- Padding: space-16 vertical
- Centered text
- Headline: section-headline (36px), text-primary
- Description: section-subheadline (20px), text-secondary, margin-top space-2
- CTA button: lg size, primary variant, centered, margin-top space-6
- Trust microcopy: body-small (14px), text-tertiary, margin-top space-3

### Variants
- **Mid-page CTA**: simpler, bg-accent, single button
- **Final CTA**: can include secondary action ("Talk to sales"), more urgency in copy

---

## Footer

### Role
Trust, navigation, legal closure.

### Visual Structure
```
┌──────────────────────────────────────────────┐
│  [Logo]                                      │
│  Short company description                   │
│                                              │
│  Product     Resources    Company    Legal   │
│  Features    Blog         About      Privacy │
│  Pricing     Docs         Contact    Terms   │
│  Security    Case Studies  Careers           │
│                                              │
│  © 2026 Company. All rights reserved.        │
│  [Social icons]                              │
└──────────────────────────────────────────────┘
```

### Specs
- Background: bg-page with border-top border-default (light mode) or bg-surface (dark mode)
- Max-width: 1200px centered
- Padding: space-16 vertical (64px)
- Top section: logo + description (body-small, text-secondary, max-width 280px)
- Column section: 4-column grid, gap space-8
- Column heading: label (14px), font-weight 600, text-primary, margin-bottom space-3
- Column links: body-small (14px), text-secondary, space-2 gap, hover text-primary
- Bottom bar: margin-top space-12, border-top border-default, padding-top space-6
- Copyright: body-small (14px), text-tertiary
- Social icons: 20px, text-tertiary, hover text-primary, gap space-3

### Mobile
- Columns: 2-column grid (below lg), then single column (below sm)
- Logo section: full width above columns

---

## Blog / Resource Card

### Role
Content preview in grid layout.

### Specs
- Container: bg-surface, border border-default, radius-lg, overflow hidden
- Image: top, aspect-ratio 16:9, object-fit cover
- Content padding: space-4
- Category badge: overline style (12px, uppercase), primary-500 text, margin-bottom space-2
- Title: card-title (20px), font-weight 600, text-primary, max 2 lines (line-clamp)
- Excerpt: body-small (14px), text-secondary, max 2 lines, margin-top space-2
- Meta row: margin-top space-3, body-small (14px), text-tertiary ("Mar 15, 2026 · 5 min read")
- Hover: shadow-card, duration-fast

---

## Integration Card

### Role
Partner/integration display in grid.

### Specs
- Container: bg-surface, border border-default, radius-lg, padding space-4, text-center
- Logo: 40px, centered, margin-bottom space-3
- Name: body-small (14px), font-weight 600, text-primary
- Description: body-small (14px), text-secondary, max 1 line
- Badge (optional): "Coming soon" in neutral variant, margin-top space-2
- Hover: shadow-card, border primary-200

---

## Form Block

### Role
Lead capture form for contact, demo, or waitlist.

### Specs
- Container: bg-surface, border border-default, radius-lg, padding space-6
- Max-width: 480px (standalone) or flexible (in split layout)
- Label: label (14px), font-weight 500, text-primary, margin-bottom space-1
- Input: height 44px, border border-strong, radius-md, padding space-3, body-default (16px)
- Input focus: border primary-500, ring 2px primary-100
- Textarea: min-height 100px, resize vertical
- Field gap: space-4
- Submit button: full width, lg size, primary variant, margin-top space-6
- Trust microcopy: body-small (14px), text-tertiary, centered, margin-top space-3
- Error: body-small (14px), status-error, margin-top space-1 below field

### Mobile
- Full width, padding space-4
- All inputs full width

---

## Final Principle

Every website component in this file defines a visual contract. When Claude builds a public page, it assembles these components without modifying their internal structure. Visual consistency comes from components looking the same everywhere.
