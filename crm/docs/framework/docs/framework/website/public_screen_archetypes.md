# Public Website Screen Archetypes

> **TL;DR:** Defines canonical page patterns (section order, layout rules, CTA strategy, mobile behavior, common mistakes) for all 13 public-facing page types.
> **Covers:** home, product, pricing, solutions, case studies, features, integrations, security, docs, blog, about, contact, legal page archetypes | **Depends on:** design_system_tokens.md, public_component_specs.md, public_copy_conversion_rules.md, 15_canonical_breakpoints.md | **Used by:** component_library_spec.md, nextjs_folder_structure.md | **Phase:** 13

## Purpose

Define canonical page patterns for every public-facing page in a SaaS website. This is the website counterpart to `docs/framework/internal/11_internal_screen_archetypes.md`. Every public page must map to one of these archetypes.

Use `design_system_tokens.md` for all visual values. Use `public_component_specs.md` for component details. Use `public_copy_conversion_rules.md` for copy and CTA rules. Use `docs/framework/internal/15_canonical_breakpoints.md` for responsive behavior.

### Breakpoint Quick Reference (from `15_canonical_breakpoints.md`)
When this file says "mobile" it means **below 768px (md)**. When it says "tablet" it means **768px–1023px**. When it says "desktop" it means **1024px+ (lg)**. All "stacks vertically" behavior occurs at the md breakpoint unless otherwise noted.

---

## 1. Home Page

### Purpose
Primary conversion page. Turns visitors into signups.

### Visual Hierarchy
1. Hero (headline + product visual) — immediate clarity
2. Social proof strip (logos) — trust
3. Feature explanation sections — understanding
4. Proof layers (case studies, stats, testimonials) — belief
5. Pricing preview — decision support
6. Final CTA — conversion

### Canonical Section Order
1. Announcement bar (optional)
2. Sticky pill header
3. Hero section (split: headline left, visual right)
4. Logo marquee
5. Case study / proof cards (2-3 cards)
6. Stats band (3-5 metrics)
7. Feature split sections (3-4 alternating)
8. Secondary proof layer
9. Pricing section (2-4 plan cards)
10. Mid-page CTA block
11. Testimonial rail
12. FAQ accordion
13. Final CTA block
14. Footer

### Layout Rules
- Max-width: 1200px centered
- Section padding: space-16 (64px) vertical mobile, space-20 to space-24 (80-96px) desktop
- Alternating section backgrounds: bg-page → bg-surface-alt → bg-page for visual rhythm
- Hero uses full viewport height on desktop (min 600px)

### Required Components
Hero, Logo Marquee, Proof Cards, Stats Band, Feature Split, Pricing Cards, CTA Block, Testimonial Card, FAQ Accordion, Footer

### CTA Strategy
- Hero: primary CTA ("Start free trial") + secondary ("See how it works")
- Mid-page: single primary CTA after feature explanation
- Final: primary CTA with trust microcopy ("No credit card required")
- All CTAs link to signup or demo booking

### Mobile Behavior
- Hero stacks vertically (text above visual)
- Feature splits stack vertically
- Pricing cards: single column, swipeable or stacked
- Logo marquee: slower animation, fewer visible logos
- Testimonials: single card, swipeable

### Common Mistakes
- Hero that doesn't explain what the product does
- No social proof before the fold
- Feature sections that describe features instead of explaining mechanisms
- Pricing hidden or requiring a separate page click
- CTAs that all say "Get Started" (use varied, specific copy)

---

## 2. Product Page

### Purpose
Deep product explanation for visitors who need more detail than the home page provides.

### Visual Hierarchy
1. Page hero (product name + value prop)
2. Product overview (visual + explanation)
3. Feature deep-dives (detailed mechanism explanation)
4. Integration preview
5. Security/compliance preview
6. CTA

### Canonical Section Order
1. Page hero (shorter than home hero)
2. Product overview section (2-column: visual + text)
3. Feature deep-dive sections (3-5, alternating split layout)
4. Integration logos or grid
5. Security/trust badges
6. CTA block
7. Footer

### Layout Rules
- Page hero: 400px max height, centered text, subtle background
- Feature sections reuse the same split pattern as home page
- Max-width: 1200px

### CTA Strategy
- Hero: primary CTA + link to demo/video
- After features: "Start free trial"
- Final: "Try [Product] free"

### Mobile Behavior
- All splits stack vertically
- Feature visuals scale to full width

### Common Mistakes
- Duplicating the home page instead of going deeper
- No mechanism explanation (just repeating "powerful", "easy", "fast")
- Missing CTA between long content sections

---

## 3. Pricing Page

### Purpose
Convert decision-ready visitors by making plan selection easy.

### Visual Hierarchy
1. Pricing hero (headline + billing toggle)
2. Plan cards (2-4 plans side by side)
3. Feature comparison table
4. Enterprise path
5. FAQ
6. CTA

### Canonical Section Order
1. Page hero ("Simple, transparent pricing")
2. Billing toggle (monthly / annual with savings badge)
3. Pricing cards row (2-4 cards, recommended plan highlighted)
4. Feature comparison table (expandable by category)
5. Enterprise contact section
6. Pricing FAQ
7. Final CTA block
8. Footer

### Layout Rules
- Cards: equal height, 3-column grid (2-column on tablet, stacked on mobile)
- Recommended plan: subtle border or shadow emphasis, badge ("Most popular")
- Comparison table: full width, sticky header row, alternating row backgrounds
- Max-width: 1200px for cards, 1400px for comparison table

### CTA Strategy
- Per-card CTA: action-specific ("Start Starter", "Start Team", "Start Business")
- Enterprise: "Talk to sales"
- Final: "Start your free trial"

### Mobile Behavior
- Cards stack vertically, recommended plan first
- Comparison table: horizontal scroll with pinned plan names
- FAQ remains full width

### Common Mistakes
- Too many plans (max 4)
- Hidden features requiring accordion clicks to see what's included
- No annual savings indicator
- Enterprise path hidden in footer

---

## 4. Solutions Page

### Purpose
Show how the product solves problems for a specific persona, role, or use case.

### Visual Hierarchy
1. Page hero (persona-specific headline)
2. Problem statement
3. Solution workflow (how the product solves it)
4. Relevant features (subset of product features)
5. Social proof specific to this persona
6. CTA

### Canonical Section Order
1. Page hero (persona-specific: "For Marketing Teams" or "For E-Commerce")
2. Problem section (pain points specific to persona)
3. Solution walkthrough (3-4 steps showing product workflow)
4. Feature highlights (relevant subset, split sections)
5. Persona-specific case study or testimonial
6. CTA block
7. Footer

### Layout Rules
- Same split section patterns as home page
- Problem section: may use icon + text card grid (3 cards)
- Solution walkthrough: numbered steps with connecting visual

### CTA Strategy
- Hero: primary CTA specific to persona ("Start your marketing workflow")
- After proof: "See how [Company] uses [Product]"
- Final: "Start free trial"

### Mobile Behavior
- Standard stacking behavior
- Step walkthrough becomes vertical numbered list

### Common Mistakes
- Generic copy that could apply to any persona
- No persona-specific proof (case study, testimonial)
- Identical layout to the product page

---

## 5. Case Studies Page

### Purpose
Build trust through customer evidence.

### Visual Hierarchy
1. Page hero ("Customer Stories")
2. Featured case study (large, prominent)
3. Case study grid
4. CTA

### Canonical Section Order
1. Page hero
2. Featured case study card (full-width, hero image or logo, headline result)
3. Case study grid (3-column card layout, filterable by industry/use case)
4. CTA block
5. Footer

### Layout Rules
- Featured case study: full-width card with bg-surface-alt background
- Grid: 3-column (2-column tablet, 1-column mobile)
- Each card: logo, customer name, industry tag, headline result, "Read story" link

### CTA Strategy
- "Start your own success story" or "See how [Product] works for you"

### Mobile Behavior
- Grid becomes single column
- Featured case study: image above text

### Common Mistakes
- Case studies without measurable results
- No filtering when there are 6+ case studies
- Cards that don't show the key result

---

## 6. Features Page

### Purpose
Organized catalog of product capabilities for comparison shoppers.

### Visual Hierarchy
1. Page hero
2. Feature category navigation (anchor links or tabs)
3. Feature grid or list per category
4. CTA

### Canonical Section Order
1. Page hero ("Everything you need to [outcome]")
2. Category anchor links (horizontal, sticky below header)
3. Feature sections by category, each with:
   - Category heading
   - 3-column feature card grid (icon + title + description)
4. CTA block
5. Footer

### Layout Rules
- Feature cards: icon (24px), title, 2-3 sentence description
- 3-column grid per category (2-column tablet, 1-column mobile)
- Category sections separated by space-16

### CTA Strategy
- "Start free trial" after each major category (if page is long)
- Final CTA at bottom

### Mobile Behavior
- Category navigation becomes horizontal scroll
- Feature cards stack to single column

### Common Mistakes
- Feature dump without categories (just a wall of cards)
- No hierarchy — all features appear equally important
- Technical jargon without explanation

---

## 7. Integrations Page

### Purpose
Show ecosystem compatibility and reduce "will it work with my tools?" objections.

### Visual Hierarchy
1. Page hero
2. Category filter
3. Integration grid
4. Technical notes
5. CTA

### Canonical Section Order
1. Page hero ("Works with the tools you already use")
2. Category filter bar (All, CRM, Analytics, Communication, etc.)
3. Integration card grid (logo + name + short description + status badge)
4. Custom integration / API section
5. CTA block
6. Footer

### Layout Rules
- Integration cards: 4-column grid (3-column tablet, 2-column mobile)
- Each card: logo (40px), name, one-line description, "Available" or "Coming soon" badge
- Category filter: horizontal pill buttons

### Mobile Behavior
- Grid becomes 2-column, then 1-column
- Category filter becomes horizontal scroll

### Common Mistakes
- Listing integrations that don't actually work yet without marking them
- No search or filter for 10+ integrations
- Cards without any description of what the integration does

---

## 8. Security Page

### Purpose
Reduce risk perception for enterprise and security-conscious buyers.

### Visual Hierarchy
1. Page hero
2. Security overview (key commitments)
3. Data handling details
4. Infrastructure details
5. Compliance badges
6. CTA

### Canonical Section Order
1. Page hero ("Security you can trust")
2. Security pillars (3-4 cards: encryption, access control, monitoring, compliance)
3. Data handling section (where data lives, how it's encrypted, retention)
4. Infrastructure section (hosting provider, regions, uptime SLA)
5. Compliance badges/certifications (SOC 2, GDPR, etc.)
6. Security contact / responsible disclosure
7. CTA block
8. Footer

### Layout Rules
- Security pillar cards: 2x2 or 4-column grid with icons
- Compliance badges: horizontal row with logos
- Dense but scannable — enterprise buyers scan for specific keywords

### Mobile Behavior
- Pillar cards stack to single column
- Compliance badges wrap to 2-column grid

### Common Mistakes
- Vague security claims without specifics
- No mention of data location or encryption standards
- Missing compliance certifications that buyers expect

---

## 9. Documentation / Help Page

### Purpose
Support adoption, reduce support tickets, and demonstrate product maturity.

### Visual Hierarchy
1. Search bar (prominent)
2. Category cards or navigation
3. Content area

### Canonical Section Order
1. Page hero with search bar (centered, prominent)
2. Category grid (Getting Started, API Reference, Guides, FAQ)
3. Popular articles list
4. CTA ("Need help? Contact support")
5. Footer

### Layout Rules
- Search: centered, max-width 600px, large input
- Category cards: 3-column grid with icon + title + description
- Article pages: 2-column (sidebar nav + content), max-width-narrow for content

### Mobile Behavior
- Search remains full width
- Category grid stacks
- Sidebar nav becomes dropdown or drawer on article pages

### Common Mistakes
- No search
- Poor navigation (flat list of hundreds of articles)
- Docs that look different from the main website

---

## 10. Blog / Resources Page

### Purpose
Content hub for SEO, education, and thought leadership.

### Visual Hierarchy
1. Page hero
2. Featured post (large)
3. Post grid
4. Category filter
5. Pagination

### Canonical Section Order
1. Page hero ("Blog" or "Resources")
2. Featured post card (full-width, hero image, title, excerpt)
3. Category filter (All, Product, Engineering, Company, Guides)
4. Post grid (3-column cards)
5. Pagination
6. Newsletter signup CTA
7. Footer

### Layout Rules
- Featured post: full-width card with image
- Post cards: 3-column grid (2-column tablet, 1-column mobile)
- Each card: image, category tag, title, excerpt (2 lines), date, read time

### Mobile Behavior
- Grid becomes single column
- Featured post: image above text

### Common Mistakes
- No featured post (all posts look the same)
- No category filtering
- Cards without dates or read time
- No newsletter signup

---

## 11. About Page

### Purpose
Establish legitimacy and build emotional connection.

### Visual Hierarchy
1. Page hero
2. Mission / story
3. Team section
4. Values
5. CTA

### Canonical Section Order
1. Page hero ("About [Company]")
2. Mission section (2-3 paragraphs, may include founder photo)
3. Company stats band (team size, customers, founding year, etc.)
4. Team grid (photos, names, roles) — optional for early-stage
5. Values section (3-4 value cards with icon + title + description)
6. CTA block ("Join us" or "Get started")
7. Footer

### Layout Rules
- Team grid: 4-column (3-column tablet, 2-column mobile)
- Values: 2x2 or 3-column grid
- Story section: max-width-narrow for readability

### Mobile Behavior
- Team grid: 2-column
- Values: single column

### Common Mistakes
- No real information (just buzzwords)
- Missing team photos for a team-led product
- No connection to the product (about page should reinforce why the product exists)

---

## 12. Contact / Demo Page

### Purpose
Capture high-intent leads with minimal friction.

### Visual Hierarchy
1. Page hero
2. Form
3. Supporting info (email, phone, office)
4. FAQ or trust signals

### Canonical Section Order
1. Page hero ("Get in touch" or "Request a demo")
2. Split layout: form (left 60%) + supporting info (right 40%)
3. Supporting info: email, phone, office address, calendar booking link
4. Trust signals below form (response time promise, customer count)
5. Footer

### Layout Rules
- Form: max 6 fields (name, email, company, role, message, optional phone)
- Supporting info: icon + text list
- Calendar embed: iframe or link to booking tool

### CTA Strategy
- Submit button: specific ("Request demo", "Send message", "Join waitlist")
- Trust microcopy below button ("We respond within 24 hours")

### Mobile Behavior
- Split layout stacks (form above, supporting info below)
- Calendar embed: full width or link only

### Common Mistakes
- Too many form fields (more than 6 kills conversion)
- No indication of response time
- "Submit" as the button text
- No alternative contact method besides the form

---

## 13. Legal Pages

### Purpose
Satisfy compliance requirements without damaging user experience.

### Pages
- Privacy Policy
- Terms of Service
- Cookie Policy (if applicable)
- Security Policy (if applicable)

### Visual Hierarchy
1. Page hero (simple)
2. Table of contents
3. Content

### Canonical Section Order
1. Page hero (title + effective date)
2. Table of contents (anchor links to sections)
3. Content sections (numbered or headed)
4. Footer

### Layout Rules
- Max-width: max-width-narrow (720px) for readability
- Body text: body-default, generous line-height (1.7)
- Section headers: section-headline size but text-secondary color
- No images, no cards — pure text content

### Mobile Behavior
- Same layout (already single-column, narrow)
- Table of contents: collapsible accordion on mobile

### Common Mistakes
- Tiny text or poor contrast
- No table of contents for long documents
- Missing effective date
- Different visual style from the rest of the website

---

## Global Page Wrapper

Every public page uses this wrapper:

1. Announcement bar (when active)
2. Sticky pill header
3. Page content (per archetype above)
4. Footer

The header and footer are consistent across all pages. Theme toggle in header switches all pages.

---

## Final Principle

Every public page has a job in the acquisition funnel. If a page doesn't serve acquisition, education, proof, trust, or conversion, it probably shouldn't exist. Each archetype above defines the minimum viable page structure — add content as needed, but never remove the CTA.
