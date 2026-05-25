# STYLESHEET.md

The design system in one place. Read this before adding a UI element.

If you find yourself doing something not described here, the answer is almost
always "no, do the thing on this page instead." The product gets cohesion the
same way a building does — every door, every window, every handle obeys the
same vocabulary.

---

## The one idea

Chippi feels **calm, paper-flat, and quietly confident**.

A realtor opens it and the surface gets out of the way. There are no shadows,
no gradients, no celebrations. The chrome recedes. The work — names, numbers,
drafts — is the only thing that's loud. Brand orange exists, but it's earned;
it does not decorate.

If a screen feels busy, you have too many things competing to be the focal
element. Every page has **one** focal element. Find it. Cut everything else
back a layer.

---

## Principles

1. **Paper-flat.** No drop shadows, no glassmorphism, no inset highlights.
   Hairline borders (`border-border/60` or `/70`) carry the structure.
2. **Neutral-first.** Backgrounds, surfaces, text, and primary buttons are all
   in the neutral scale. Color is reserved for meaning (brand, lead tier,
   destructive).
3. **One focal element per screen.** Title + status sentence is the loud note.
   Section headings recede. Body recedes further. Muted labels recede furthest.
4. **Configuration is failure to decide.** If you're choosing between two
   variants of a thing, pick one and delete the other. Tabs, settings, and
   toggles are confessions that the team couldn't choose.
5. **Quiet authority in copy.** Lowercase verbs, periods at the end of toasts,
   no exclamation marks unless something genuinely warrants celebration.
6. **Sweat the corner radius and the silence.** Spacing, easing, and stop-time
   between micro-interactions are not optional details — they are the design.
7. **The agent has a single voice.** When Chippi appears anywhere — toast,
   draft card, activity row, badge — it carries the same orange + serif
   signature. Nothing else does.

---

## Stack & libraries

| Layer | What we use |
|---|---|
| Framework | **Next.js 15** (App Router, RSC), **React 19** |
| Styling | **Tailwind v4** + `cn()` (clsx + tailwind-merge). No CSS modules. CSS variables via `app/globals.css`. |
| Component library | **shadcn/ui** style `new-york`, baseColor `zinc`, CSS variables on. Built on **Radix UI** primitives (`@radix-ui/react-dialog`, `-popover`, `-label`, `-accordion`, `radix-ui` umbrella). |
| Icons | **lucide-react**. Only library used. Sizes 11–13 in chrome, 14–16 in primary actions. |
| Animation | **framer-motion** (`motion` package alias also installed). All variants in `lib/motion.ts`. No GSAP for product surfaces (it's installed for marketing-only `hero-section-1.tsx`). |
| DnD | `@dnd-kit/core` + `/sortable` + `/utilities` — kanban only. |
| Forms | `react-hook-form` + `@hookform/resolvers` + `zod`. |
| Toasts | **sonner**. Single source: `app/layout.tsx` mounts `<Toaster>`. |
| Charts | **recharts** v3. Chrome lives in `components/ui/chart.tsx`. |
| Auth | **Clerk** (`@clerk/nextjs`). Component overrides in `globals.css` `.cl-*` selectors. |
| Data | **Supabase** (`@supabase/supabase-js`) + browser client in `lib/supabase-browser.ts`, server in `lib/supabase.ts`. |
| Realtime | Supabase Postgres CDC via `hooks/use-realtime.ts`. |
| Fonts | All system / local. **No Google Fonts.** SF Pro is read from the OS via the system stack; Times New Roman is read from the OS as the serif. The only third-party font we ship is `geist` (in deps but not currently bound to a CSS variable in `globals.css`). |

If a feature looks like it needs a new dep, the bar is high — it almost never does. The list above is the whole vocabulary.

---

## Color

### Tokens (defined in `app/globals.css` — read it; don't invent new ones)

```
--background        white in light, near-black in dark
--foreground        near-black in light, off-white in dark
--surface           one half-step off the background (subtle inset)
--card              elevated content (same as background in light)
--muted             #f4f4f5 / dark equivalent — quiet bg
--muted-foreground  #6b6f76 / #9ca3af — secondary text
--border            #e7e7e9 / #27272a — hairlines
--ring              translucent foreground — focus rings

--primary           = foreground. Black on white, white on black. NOT orange.
--destructive       red

--brand             #ff964f — Chippi orange
--brand-foreground  white
--brand-subtle      #fff4eb / #2a1f17 — washed orange tint

--lead-hot          red    — leadScore ≥ 70
--lead-warm         mustard — leadScore 50–69 (note: NOT amber, NOT brand)
--lead-cold         blue
```

### Where to reach for what

| Need | Token |
|---|---|
| Default button background | `bg-foreground` (black) — **never** brand |
| Page background | `bg-background` |
| Card / row hover | `hover:bg-muted/30` (or `bg-foreground/[0.04]` for ghost buttons — same family) |
| Hairline divider / border | `border-border/60` between sections, `border-border/70` on cards |
| Empty-state container | `bg-muted/20` + `border-dashed border-border/70` + `rounded-xl` |
| Section heading text | `text-muted-foreground` |
| Body text | `text-foreground` (default) or `text-muted-foreground` (subtitle) |

### The brand orange rule

Brand orange (`--brand`, `text-orange-500`, `text-orange-600 dark:text-orange-400`) lives in **only these places**:

1. The logo.
2. The Chippi avatar / chip widget.
3. `AgentGeneratedBadge` and similar "this came from Chippi" cues.
4. Agent-output activity bars and progress fills.
5. The lead-warm tier (mustard, not orange — but conceptually related).

It does **not** appear on default buttons, primary CTAs, links, focus rings,
nav, or "active" indicators. Those are all foreground (black/white). If you
catch yourself reaching for orange on a non-Chippi element, that's the bug.

---

## Type

### Fonts

| Variable | Stack | Use |
|---|---|---|
| `--font-sans` | -apple-system, SF Pro Text/Display, system-ui | Body, default |
| `--font-heading` | SF Pro Display, system-ui | All `<h*>` (auto via base layer) |
| `--font-title` | **Times New Roman**, Times, serif | Page-level h1 only |
| `--font-mono` | SF Mono, ui-monospace | Code, data, numbers in dense tables |

The serif Times is the **brand's quiet flourish**. Use it on page titles and
on focal stat numbers. Never on body, never on UI chrome, never on more than
one element on a page. The whole reason it works is scarcity.

### The hierarchy (from `lib/typography.ts`)

```
H1            text-3xl tracking-tight  + serif Times       — page title
STAT_NUMBER   text-3xl tracking-tight  tabular-nums serif  — focal data
H2            text-xl font-semibold                          — section
H3            text-base font-semibold                        — card head
SECTION_LABEL text-[11px] uppercase tracking-wider muted    — small caps over groups
BODY          text-sm                                        — default
BODY_MUTED    text-sm muted                                  — subtitle / helper
CAPTION       text-xs muted                                  — chrome / metadata
META          text-[11px] tabular-nums muted                 — timestamp / id
```

**Apply via `cn(...)` from `lib/typography.ts`.** Don't hand-roll text classes
on a new page. If a new page needs a size that isn't in the file, that's a
sign the page is wrong, not the file.

### The status-sentence pattern

Every page header looks like this:

```tsx
<header className="space-y-1.5">
  <p className="text-sm text-muted-foreground">Reviews.</p>
  <h1
    className="text-3xl tracking-tight text-foreground"
    style={{ fontFamily: 'var(--font-title)' }}
  >
    Deals flagged for you
  </h1>
  <p className="text-sm text-muted-foreground">{statusSentence}</p>
</header>
```

Three lines: muted greeting line (with period) → serif h1 → one-sentence
status. Same shape on Chippi home, Reviews, agent-activity, broker overview.
**Don't break the pattern.** It's how the surface reads as one product.

---

## Space

```
PAGE_RHYTHM    space-y-12   between major sections
SECTION_RHYTHM space-y-6    within a section
FIELD_RHYTHM   space-y-4    between form fields / list rows
ROW_PAD        py-3         hairline-divided rows (or py-2.5 for tight)
```

### Containers

| Width | When |
|---|---|
| `max-w-5xl mx-auto` | Broker overview, dashboard pages |
| `max-w-4xl mx-auto` | Reviews, focused list views |
| `max-w-3xl mx-auto` | Chat, settings, intake — single-column reading |
| `max-w-[1500px]` | Wide tables, kanban |

Always paired with `pb-12` so the page has bottom breathing room.

---

## Surfaces

### The hairline-divider grid

For stat strips and snapshots, **always** use this trick:

```tsx
<section className="grid grid-cols-3 gap-px rounded-xl overflow-hidden
                    border border-border/60 bg-border/60">
  <div className="bg-background px-4 py-4">…</div>
  <div className="bg-background px-4 py-4">…</div>
  <div className="bg-background px-4 py-4">…</div>
</section>
```

Background color shows through the `gap-px` to make 1px dividers between
cells. It looks like printed paper. It's the snapshot vocabulary; don't
invent a different one.

### Cards

```
bg-card  border border-border/70  rounded-xl  px-4 py-3
```

Hover (when interactive): `hover:bg-muted/30 transition-colors`.

### Rows

`<ul className="divide-y divide-border/60">` with each `<li>` using
`flex items-center gap-3 py-3`. No card chrome on individual rows — the
divider is the structure.

### Empty states

Always:

```tsx
<div className="rounded-xl border border-dashed border-border/70
                bg-muted/20 px-5 py-10 text-center">
  <p className="text-sm text-foreground">{calmHeadline}</p>
  <p className="text-xs text-muted-foreground mt-1">{whatsNext}</p>
</div>
```

The headline is the calm fact ("You're all caught up.", "Nothing flagged.
Quiet day.", "quiet — no activity yet"). The second line says what would
populate it.

---

## Border & radius

### Radius (defined in `globals.css`)

```
--radius        0.75rem   (12px)  — base
--card-radius   0.75rem   (12px)  — content cards
```

Tailwind derives the rest from `--radius`:

| Class | Value | Use |
|---|---|---|
| `rounded-sm` | `calc(--radius - 4px)` = 8px | Tiny pills, dense inline chips |
| `rounded-md` | `calc(--radius - 2px)` = 10px | **Buttons, inputs** — canonical control radius |
| `rounded-lg` | `var(--radius)` = 12px | Dialogs, alert dialogs |
| `rounded-xl` | `calc(--radius + 4px)` = 16px | **Content cards, stat grids, empty-state containers** |
| `rounded-2xl` | n/a (bare Tailwind) | Marketing-only pages — do not use in product |
| `rounded-full` | full | Pills, segmented controls, avatars, primary CTA pill |

The product gets one canonical control radius (`rounded-md`) and one
canonical content radius (`rounded-xl`). Mixing these is the look. Don't
introduce a third.

### Border weight + color

- **All product borders are 1px.** No 2px, no 3px. Tailwind default.
- **Color**: `border-border/60` between sections (slightly translucent so
  hairlines feel like paper folds), `border-border/70` on cards and inputs,
  `border-border` on tables and clear separators.
- **Dashed**: only on empty-state containers (`border-dashed border-border/70`).
- **Active rail** (the 2px black strip on the active sidebar item):
  `absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground`.
  This is the one place 2px appears on a border. Don't replicate elsewhere.

### When to use a border vs nothing

- A grouped list of rows: `divide-y divide-border/60`. No outer border.
- A standalone surface (stat grid, card, empty state): outer border + radius.
- A button: outline variant only, never default/ghost.
- Sections within a page: a single `border-b border-border/60` *under the
  section heading*, not around the section.

---

## Shadows

**Paper-flat is the rule.** The redesign deliberately removed shadows from
buttons, inputs, cards, and the outline button variant. If you find yourself
reaching for a `shadow-*` class on a product surface, the answer is almost
always no — use a hairline border instead.

Shadows live in exactly four places:

| Where | Class | Why |
|---|---|---|
| Sonner toast | `shadow-lg shadow-foreground/5` | Toasts float above the page; without lift they read as misplaced banners. The 5% foreground tint keeps the shadow subtle. |
| Dialog / AlertDialog content | `shadow-lg` | Same reason — modals must read as elevated. |
| Chart tooltips | `shadow-xl` | Hover surfaces over data; need clear separation from the chart. |
| `recharts` tooltip in `components/ui/chart.tsx` | `shadow-xl` | Same as above. |

Marketing pages (`app/features/*`, `components/ui/hero-section-1.tsx`,
`floating-chat-widget`, etc.) DO use `shadow-sm` / `shadow-xl` /
`shadow-2xl`. **The product does not.** When working in `app/s/[slug]/*`,
`app/broker/*`, or any dashboard component, leave shadows in the marketing
layer and use borders instead.

---

## Components

### Buttons

**One source: `components/ui/button.tsx`.** Use the cva variants. Don't
hand-roll a button.

### Sizes (kept lean)

```
xs       h-6   rare; small inline pills
sm       h-8
default  h-9   matches sidebar nav rows — the canonical size
lg       h-10
icon{,-sm,-lg,-xs}  square equivalents
```

### Variants

| Variant | Background | When |
|---|---|---|
| `default` | foreground (black/white) | Primary action — Save, Send, Add |
| `outline` | transparent + `border-border` | Secondary action |
| `ghost` | transparent, hover `bg-foreground/[0.04]` | Tertiary, in-line |
| `secondary` | `bg-secondary` | Mid-emphasis |
| `link` | text only, underline on hover | Inline link |
| `destructive` | red | Delete, irreversible |

### Press feedback (do not omit)

```
transition-all duration-150
active:scale-[0.98]                  (except on link variant)
focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background
```

The 0.98 press is tactile and feels like real product. The 2px focus ring
(not the shadcn 3px default) keeps focus visible without screaming.

### Pill primary (when a button has to feel like a CTA)

`PRIMARY_PILL` from `lib/typography.ts` — `rounded-full px-4 h-9
bg-foreground text-background`. Use on inline composer Send buttons, locked
primary actions, anywhere the rectangle button feels too generic.

### Inputs

**One source: `components/ui/input.tsx`.** Same polish rules as buttons.

```
h-9                              canonical control height (matches buttons)
rounded-md                       same radius as buttons
border border-input              hairline only (input == border alias)
bg-transparent                   sits on the page; dark: bg-input/30
text-base on mobile, text-sm md+ prevents iOS focus zoom
placeholder:text-muted-foreground/70   quieter than default
focus-visible:border-ring        ring color shifts the border too
focus-visible:ring-2 ring-ring/30 ring-offset-1 ring-offset-background
transition-colors duration-150
```

No shadow. No floating effect. The original input had `shadow-xs` and was
removed in the redesign — paper-flat is the rule.

For `<textarea>`: same vocabulary, `min-h-[80px]` typical.

For `<Label>`: small text-foreground, `text-sm font-medium`. Pair with
inputs via `Label htmlFor` — accessibility is not optional.

### Cards

**One source: `components/ui/card.tsx`.**

```
bg-card  text-card-foreground  flex flex-col
gap-4    py-4
rounded-lg  border
```

`CardHeader` uses `px-5` and a 1.5-gap layout that supports an optional
trailing action slot. `CardTitle` is `font-semibold leading-none`.
`CardContent` and `CardFooter` are `px-5`.

Use Card when the content is **a discrete unit** that needs visual
separation — onboarding nudges, invitation prompts, settings groups.
**Do not** wrap every list row in a Card. For lists, use
`divide-y divide-border/60`.

For inline / hand-rolled card-shaped elements (review rows, agent activity
rows), use the lighter pattern:

```
rounded-xl  border border-border/70  bg-card  px-4 py-3
hover:bg-muted/30  transition-colors
```

That's the row vocabulary. Distinct from the Card primitive — used where
ten of these stack and the heavier Card would feel chunky.

### Modals (Dialog + AlertDialog)

**Sources: `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`.**
Both built on Radix primitives.

```
Overlay   fixed inset-0 z-50 bg-black/50
          data-[state] animate-in/out fade-out-0 fade-in-0
Content   fixed top-[50%] left-[50%] translate-(-50%,-50%) z-50
          grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg
          gap-4 rounded-lg border border-border/70 p-6
          shadow-lg duration-200
          data-[state] zoom-out-95 / zoom-in-95
Close X   absolute top-4 right-4 size-4 stroke
Header    flex flex-col gap-2 text-center sm:text-left
Footer    flex flex-col-reverse sm:flex-row sm:justify-end gap-2
Title     text-lg font-semibold leading-none
Desc      text-sm text-muted-foreground
```

Use AlertDialog (not Dialog) for **destructive or irreversible** actions.
The "Pause me?" disable-Chippi confirmation is the canonical example.
AlertDialog gates with two buttons (Cancel + Action), forces a choice,
and the Action button uses the destructive variant when warranted.

For `<ConfirmDialog>` (`components/ui/confirm-dialog.tsx`), use it for
inline confirms inside row contexts. Same modal chrome, programmatic API.

### Badges & pills

**One source: `components/ui/badge.tsx`** (cva variants).

```
rounded-full  px-2 py-0.5  text-xs font-medium
gap-1  whitespace-nowrap  inline-flex
[&>svg]:size-3
```

Variants: `default` (foreground bg) / `secondary` (muted bg) /
`destructive` / `outline` / `ghost` / `link`. Match the button vocabulary.

For the **inline status pill** pattern (Open/Approved/Closed on review
rows, scoreLabel chips, draft channel labels), use the hand-rolled pattern
that pairs a tone-tinted bg with a tone-tinted text:

```
inline-flex text-xs font-medium rounded-full px-2.5 py-0.5
text-amber-700  bg-amber-50  dark:text-amber-400  dark:bg-amber-500/15
```

Tone palette for status pills:

| Status | Light | Dark |
|---|---|---|
| Open / pending / awaiting | amber-700 / amber-50 | amber-400 / amber-500/15 |
| Approved / done / responded | emerald-700 / emerald-50 | emerald-400 / emerald-500/15 |
| Closed / dismissed / quiet | muted-foreground / muted | (same) |
| Destructive / failed / unsubscribed | rose-700 / rose-50 | rose-400 / rose-500/15 |
| Agent-authored | orange-600 / orange-500/10 | orange-400 / orange-500/15 |

These tone classes are the only place we leave the neutral palette in
chrome. Use sparingly — a row should have at most one status pill.

### Tables

**Source: `components/ui/table.tsx`** — minimal, header-only border.

```
Container   relative w-full overflow-x-auto
Table       w-full caption-bottom text-sm
Header      [&_tr]:border-b
Body        [&_tr:last-child]:border-0
Row         border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted
Head cell   h-10 px-2 text-left align-middle text-muted-foreground font-medium text-xs
Cell        p-2 align-middle
```

Use `<Table>` for genuine tabular data — broker leaderboard, audit logs,
analytics. For the dashboard's per-realtor list (where you want avatars,
flowing text, and inline metadata) use the **divide-y row list** pattern
instead — tables read as bureaucratic; the row list reads as a feed.

Rule of thumb: if every cell is a number or a date, Table. If a cell is a
sentence, divide-y rows.

---

## Motion

**One library: `framer-motion`.** All variants live in `lib/motion.ts`.

### Timing

```
DURATION_FAST  0.15s   hover, color shifts, micro
DURATION_BASE  0.22s   page entrance, list stagger
DURATION_SLOW  0.32s   bar fills, rare emphasis
```

### Easing

```
EASE_OUT     [0.16, 1, 0.3, 1]   premium ease-out cubic — entrances
EASE_IN_OUT  [0.4, 0, 0.2, 1]    symmetric — toggles, returns
```

### The two patterns we use

**Stagger list** — every list of rows on the dashboard.

```tsx
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';

<StaggerList key={listKey} className="space-y-2 (or divide-y…)">
  {rows.map((r) => <StaggerItem key={r.id}>…</StaggerItem>)}
</StaggerList>
```

When the list contents change (filter, tab swap, window change), key the
StaggerList so it remounts and the children re-stagger in. **Don't add
exit animations to list items** — items leaving on filter is jumpy. The
key remount handles the swap.

**Shared layout (`layoutId`)** — segmented controls and sliding tab
indicators.

```tsx
{isActive && (
  <motion.span
    layoutId="reviews-tab-underline"   // pick one id per indicator group
    className="absolute bottom-[-1px] left-2 right-2 h-[2px]
               rounded-full bg-foreground"
    transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
  />
)}
```

The active indicator's underline / pill / chip shares an id across siblings.
Framer Motion animates between positions on swap. This is the iOS
segmented-control trick. **Use it for any tab strip or window selector.**

### What we do NOT do

- No bounce / spring overshoot. Eases land flat.
- No spinning loaders longer than 1s before they get a status line.
- No celebratory motion (confetti, big checkmarks) unless you can defend it
  in a meeting. We have `confetti.tsx` — it's used once.
- No animating numbers up. The number is the substance; flashing it around
  is decoration.

---

## Voice

The product talks like a sharp colleague who already knows your book of business.

- Lowercase verb in toasts: `"Tour booked — Sarah Chen."` Period.
- One-sentence status lines under every page title.
- Active voice; "drafted" not "has been drafted."
- Empty states are calm facts: "You're all caught up.", "Nothing flagged.
  Quiet day.", "quiet — nothing in flight."
- Microcopy on buttons is verb-led: "Open", "Resolve", "Pause", "Run now".
- "Chippi" is the agent's name. Capitalised. Don't say "the agent" or "the
  AI" or "the assistant" anywhere user-facing.
- No emojis in product chrome. Suggestion chips are the one exception.
- No exclamation marks. Confidence doesn't shout.

---

## Navigation

### Sidebar (`components/dashboard/sidebar.tsx`)

```
Width expanded   240px   (w-[240px])
Width collapsed  56px    (w-[56px])
Background       bg-sidebar  (= card surface, white in light, near-black in dark)
Border           border-r border-border/70
Hover            hover:bg-foreground/[0.04]
Active rail      absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground
Active label     text-foreground (loses muted treatment)
Icon size        15–16
Row height       h-9 (matches button default — alignment is intentional)
```

**Section labels** in the sidebar use `SECTION_LABEL` from
`lib/typography.ts`: `text-[11px] font-medium uppercase tracking-wider
text-muted-foreground`. Always above a group, never inline.

**Counts in nav rows** (unread leads, pending drafts) use the small pill:

```
inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center
rounded-full text-[11px] tabular-nums flex-shrink-0
bg-secondary text-muted-foreground         (default)
bg-primary text-primary-foreground         (when count is "you owe action")
```

**Collapse/expand** is an in-place transition; don't animate the width
manually. The collapse provider (`sidebar-collapse.tsx`) handles state.

**Mobile**: sidebar is hidden; `MobileNav` (bottom bar) takes over with
the four primary items only.

### Header (`components/dashboard/header.tsx`)

```
Height           h-14 (56px) — matches collapsed sidebar width
Border           border-b border-border/70
Background       bg-background
Position         sticky top-0 z-40
Padding          px-4 md:px-6
Layout           flex items-center justify-between
```

The header is intentionally quiet — page titles live in the page body
(serif h1), not in the header. The header carries the breadcrumb / brand
mark on the left and the user/notification chrome on the right. **Don't
add a page title to the header.**

### Active state across the app

| Surface | How "active" reads |
|---|---|
| Sidebar nav row | 2px foreground rail on the left, label loses muted |
| Tabs (reviews, settings) | Sliding 2px underline via `motion.layoutId` |
| Segmented control (window selector, role switcher) | Sliding muted pill via `motion.layoutId` |
| Kanban column highlight while dragging | `bg-muted/40` |
| Form field focused | 2px ring + 1px offset |

One vocabulary: the active thing is **named with foreground**, the
inactive thing recedes to muted. No orange on active states.

---

## Visual hierarchy

The hierarchy is built from three forces: **size, weight, color**.
Loud-to-quiet from the top:

| Tier | Size | Weight | Color | When |
|---|---|---|---|---|
| Page focal | 3xl serif Times | regular | foreground | Page h1, hero stat number |
| Section | xl sans | semibold | foreground | `<h2>` inside a page |
| Card / panel | base sans | semibold | foreground | `<h3>` on a card head |
| Body | sm sans | regular | foreground | Default reading |
| Subtitle / helper | sm sans | regular | muted-foreground | Status sentence, helper text |
| Section label | 11px sans | medium uppercase tracking-wider | muted-foreground | Small caps over a group |
| Caption / chrome | xs sans | regular | muted-foreground | Avatars, breadcrumbs |
| Meta / timestamp | 11px tabular-nums | regular | muted-foreground | Created at, IDs |

### What always stands out

1. **The page's one focal element.** Serif Times h1 + status sentence at
   the top of every page. Or a single big stat number. Pick one per page.
2. **The pending action.** Pending drafts count, open reviews count, the
   unreviewed item — these get the foreground pill (`bg-primary
   text-primary-foreground`) so they read as "you owe this."
3. **Chippi's authorship.** Anything authored by the agent gets the
   orange tint or the small Chippi badge. The orange in chrome is **only**
   for this; it's the brand's quiet signature.

### What always recedes

- Section dividers, hairlines, borders.
- Timestamps and IDs (always `text-[11px] tabular-nums muted`).
- Section heading labels (small caps, muted, never bold black).
- Counts that aren't actionable (use `bg-secondary text-muted-foreground`
  not the foreground pill).

If a screen feels like everything is shouting, you've used too many
foreground-color elements. Demote the secondary ones to muted; the focal
element will pull the eye on its own.

---

## Dashboard homepage (`app/s/[slug]/chippi/page.tsx`)

The Chippi workspace is the realtor's home. It is **the** product surface;
the rest of the app is in service of it.

### Layout

- **Single column, max-w-3xl, centered.** No sidebar in the content area.
  The composer is a docked `sticky bottom-0` element with a gradient mask
  fading content above it.
- **Vertical flow**: greeting (centered serif h1) → MorningReplay (only
  if there's overnight activity to show) → HowChippiWorksTip (one-time)
  → TodayFeed → composer + suggestion chips.
- **Active conversation mode** swaps the Today view for a transcript:
  `ScrollArea`, `max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-14 pb-4`,
  message list with `space-y-7` between turns.

### Hero (the first surface a realtor sees)

```tsx
<header className="space-y-1.5 text-center">
  <h1
    className="text-[2.25rem] sm:text-[2.5rem] tracking-tight leading-tight"
    style={{ fontFamily: 'var(--font-title)' }}
  >
    {greeting}, {firstName}.
  </h1>
  <p className="text-sm text-muted-foreground">{statusSentence()}</p>
</header>
```

The greeting uses **time-based copy** ("Good morning" / "Good afternoon"
/ "Good evening" / "Working late"). The status sentence is a one-line
narrative read of the workspace ("You have 3 leads to follow up with."
or similar).

**This is the only h1 in the product that's centered.** Everywhere else,
h1 is left-aligned. The Chippi home is centered because the surface is
intentionally calm and conversational; the rest of the app is dense and
left-aligned.

### Suggestion chips (`SUGGESTIONS` constant in chippi-workspace)

```
inline-flex items-center gap-1.5 rounded-full
border border-border/70 bg-background hover:bg-accent/40 hover:border-border
px-3 py-1
text-[11px] text-muted-foreground hover:text-foreground
transition-colors
```

The one place an emoji is allowed in product chrome — paired with a verb
phrase. Click sends the prompt; the chips disappear once the conversation
starts.

### Composer

Docked: `sticky bottom-0 z-10 w-full max-w-3xl mx-auto px-4 sm:px-6
pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2.5
bg-gradient-to-t from-background via-background to-background/0`. The
gradient mask fades content under the dock so the input is the bottom-
most element with no detached chips floating below it.

### What carries the most visual weight

In order:
1. The greeting + status sentence (serif, focal).
2. MorningReplay (when present — it's the "wow" moment of overnight work).
3. The composer (always reachable, rounded full pill, primary CTA inside).
4. TodayFeed rows (divide-y, calm).

Don't add a fifth focal element. If a feature wants prominence on the home,
it competes with these four — usually it should live one click away.

---

## Auth pages (`components/auth/auth-page-layout.tsx`)

Auth is the **first impression**. Brand expression is allowed here in ways
it isn't allowed in product chrome — but the rules still hold: no shadows,
no gradients on form chrome, calm copy.

### Layout

```
main   relative min-h-screen bg-background
       lg:flex lg:h-screen lg:overflow-y-auto lg:overflow-x-hidden

LEFT panel  (form)
       w-full min-h-screen flex flex-col bg-background
       px-6 py-6 sm:px-10 sm:py-8
       lg:min-h-0 lg:w-[480px] lg:min-w-[480px]
       lg:overflow-y-auto lg:border-r lg:border-border/70 lg:py-10

  Logo    h-6 sm:h-7   shrink-0   <BrandLogo>
  Form    mx-auto w-full max-w-[380px]   centered vertically
  Heading H1 from typography + TITLE_FONT (serif Times)
  Sub     BODY_MUTED

RIGHT panel  (brand promise)
       Visible lg+ only. Hosts the Globe, leadMarkers, and the brand
       tagline. Animates in 100ms after the form (RIGHT_PANEL_VARIANTS)
       so the form lands first.
```

### Role switcher (login pages only)

A two-tab segmented control above the form: Realtor / Broker. Lives in a
`rounded-full bg-foreground/[0.04] p-1` shell. Active tab gets
`bg-background border border-border/70`; inactive is muted-foreground
with hover→foreground.

This is the **only place** in the app where two roles split the door. Use
this exact pattern; don't invent a different role-picker elsewhere.

### Brand expression rules for auth

Auth pages are allowed:
- The **Globe** widget (`components/ui/cobe-globe.tsx`) on the right panel.
- A serif Times h1 — same h1 as the product, but here it's the screen's
  whole emotional anchor.
- Live theme awareness — the Globe re-tints in dark mode.
- A 100ms staggered entrance: form first, brand panel second. Intentional.

Auth pages are **not** allowed:
- Shadows on form chrome (Clerk's defaults are overridden in `globals.css`
  via `.cl-card`, `.cl-cardBox` to remove shadow + bg + padding + border).
- Marketing-style gradients, hero animations, or emoji.
- A different button/input vocabulary than the product. The Clerk overrides
  force `rounded-md`, `h-9`, foreground primary — same as `components/ui/button.tsx`.

The principle: auth is **calm welcome, not a pitch**. The marketing pages
do the pitch. By the time the user lands at sign-in, they've already
decided.

---

## Iconography

| Library | `lucide-react` |
|---|---|
| Default size | 14–16 in primary actions, 11–13 in chrome / muted UI |
| Pairing | `inline-flex gap-1.5` for icon+text in chips, `gap-2` in buttons |
| Stroke weight | Default lucide |

Common pairings (memorise the verb-icon shape so the agent surface stays
coherent):

```
CalendarCheck   booked / confirmed
ArrowUpRight    advanced / moved forward
ArrowRightLeft  routed
Flag            flagged / review
Paperclip       attached (packet, doc)
MessageSquare   SMS / draft
Mail            email
Bell            follow-up scheduled
Brain           memory / observation
MessageCircle   Chippi (the agent itself)
```

---

## File map — where the truth lives

```
app/globals.css                  Theme tokens, CSS variables, Clerk overrides
lib/typography.ts                Type scale, spacing rhythm, primary pill, ghost pill
lib/motion.ts                    Eases, durations, stagger + dialog variants
lib/color.ts                     pickContrastColor() helper
components/ui/button.tsx         The only canonical button
components/ui/empty-state.tsx    Empty-state component (use it)
components/motion/stagger-list.tsx   StaggerList + StaggerItem (use them)
components/agent/agent-generated-badge.tsx   Chippi-stamp on agent-authored content
```

If you find a screen doing something this file doesn't sanction, the screen
is wrong. Fix it back. The system holds because it's enforced.
