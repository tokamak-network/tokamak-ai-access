---
name: "Asymmetric Editorial Split"
description: "A 1/3 + 2/3 vertical split with a single hairline running the full page height. The narrow column carries metadata and eyebrow type; the wide column carries the lead. Classic magazine architecture for landing pages."
tags: [layout, editorial, split, asymmetric]
type: pattern
container: "full-bleed"
content_max_width: 1280px
page_padding: 0px
grid:
  columns:     2
  max_columns: 2
  line_color:  "rgba(15, 15, 15, 0.10)"
  line_width:  1px
  line_style:  solid
  edge_lines:  false
sections:
  padding_y:      120px
  divider_color:  "rgba(15, 15, 15, 0.08)"
  divider_width:  1px
  divider_style:  solid
intersections:
  style: none
  color: "rgba(15, 15, 15, 0.10)"
  size:  4px
design:
  colors:
    ink:      "#0c1a2c"
    surface:  "#f7f8fa"
    accent:   "#1f4ed8"
    muted:    "#6b7585"
    hairline: "#e3e6ec"
  fonts:
    display: "Inter Tight"
    body:    Inter
    mono:    "JetBrains Mono"
  radius: 8px
  google_fonts_url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
---

# Asymmetric Editorial Split

## AI Build Instructions

> **Read this section before writing any code.** The rules below
> are non-negotiable. Every value used in the UI must come from this
> file's frontmatter — never substitute, approximate, or invent new
> colors, fonts, radii, or shadows. If a value is missing, ask the
> user before adding one.

### 1 · Your role

You are building UI for a project that has adopted **Asymmetric Editorial Split** as its
design system. Treat `PATTERN.md` as the single source of truth.
Your job is to translate the user's product requirements into
components and pages that look like they were designed by the same
person who authored this file.

### 2 · Token compliance

- Pull every color, font family, radius, shadow, and spacing value
  from the frontmatter at the top of this file.
- Use semantic roles (e.g. `primary`, `accent`, `muted`) — never
  hard-code hex values that bypass the system.
- When a token can be expressed as a CSS variable, declare it once
  in your global stylesheet and reference it everywhere downstream.
- The Google Fonts `<link>` is provided in the Typography section.
  Add it to `<head>` before any component renders.

### 3 · Build recipes

#### Page skeleton (the layout contract)

- Container: `full-bleed`
- Content max-width: `1280px` (typography respects this even when the page is full-bleed).
- Vertical grid: **2 column hairlines** (capped at 2 on wide viewports), drawn with `1px solid rgba(15, 15, 15, 0.10)`.
- Section padding: `120px` top + bottom inside every section.
- Section divider: `1px solid rgba(15, 15, 15, 0.08)` between sections.

#### Primary CTA

Exactly **one** primary CTA per page or section. The pattern's discipline depends on this.

- Background: `#0c1a2c` · Color: `#ffffff`
- Padding: `12px 24px` · Weight: `600`
- Shape: `rounded` (radius: `8px`)

#### Headlines

- Family: `Inter Tight` · Size: `clamp(2.5rem, 4.5vw, 3.75rem)` · Leading: `1.02` · Weight: `700`
- Tracking: `-0.035em`

#### Body copy

- Family: `Inter` · Size: `1rem` · Leading: `1.6` · Color: `#6b7585`
- Max line length: 60–66 characters. Never let prose stretch the full content width.

#### Eyebrows / metadata

- Family: `JetBrains Mono` · Size: `0.6875rem` · Letter-spacing: `0.16em`
- Uppercased. Color: `#1f4ed8`.

### 4 · Hard constraints

Never do any of the following without explicit instruction from the user:

- Introduce a new color, font, radius, or shadow that isn't declared above.
- Mix this system with another (e.g. don't paste in Material or Bootstrap defaults).
- Use generic gradient defaults (purple→blue, peach→pink) — they break the system's voice.
- Reach for emoji icons. Use a consistent icon library and size icons in line with body type.
- Add motion that exceeds the system's restraint — keep transitions short (≤200ms) and subtle.
- Break the layout contract: the column count, divider rhythm, and content max-width are part of the pattern.

### 5 · Before you finish — verify

Run through this checklist for every screen you produce:

- [ ] Every color used appears in the Colors table above.
- [ ] Headlines use the display font; body copy uses the body font.
- [ ] Buttons match one of the declared variants exactly (shape, padding, weight).
- [ ] Border-radius values come from `radius.sm` / `radius.md` / `radius.lg` / `radius.pill`.
- [ ] Cards and dividers use the declared border + shadow tokens.
- [ ] The page respects the pattern's grid (column count + content max-width).
- [ ] Section dividers use the declared color, width, and style.
- [ ] Exactly one primary CTA per section — never duplicate.
- [ ] No values were invented; if you needed something missing, you stopped and asked.

---

## Overview

The asymmetric editorial split is the oldest layout in print — and still the
strongest for marketing pages that have something to say. A single vertical
hairline runs the full page height at the 33.33% mark, dividing every section
into a narrow left column (metadata, eyebrow, captions, dates) and a wide right
column (lead headline, body, the actual argument).

Unlike a symmetric two-column split, the asymmetry forces hierarchy. The
narrow column reads as instrument panel; the wide column reads as voice. The
eye lands on the wide column first every time.

## When to use it

- Editorial landing pages where copy is the protagonist.
- Long-form launches, manifestos, brand pages.
- Pricing pages where the narrow column carries plan name + price and the wide
  column carries the feature argument.
- Article and case-study templates.

## When to avoid it

- Dashboards or app surfaces — the asymmetry wastes screen real estate.
- Heavily illustrated pages where each section needs the full bleed.
- Mobile-first builds where the 1/3 column collapses to nothing useful. Stack
  vertically below 768px and treat the eyebrow as a leading label.

## Do

- Anchor the narrow column to the top of every section so the eye scans down a
  consistent spine.
- Use the narrow column for typographic discipline: eyebrow caps, dates,
  authors, section numbers, mono labels.
- Keep the hairline at 8–12% foreground alpha so it reads as architecture,
  never as a border.
- Allow the wide column to break the grid for hero imagery or pull-quotes —
  the asymmetry tolerates one bold violation per page.

## Don't

- Don't put body paragraphs in the narrow column. The line length is wrong.
- Don't move the split line between sections — it must be a single continuous
  hairline from the top of the page to the bottom.
- Don't add a second vertical hairline. The whole point is the single split.
- Don't widen the narrow column past 40%. Past that, the hierarchy collapses
  and the layout reads as a weak two-up.

## Notes

- The hairline color should be derived from the foreground at ~10% alpha so it
  sits inside the system rather than on top of it.
- Pair with serif display + sans body for maximum editorial register, or with
  sans display + mono captions for a quieter modern feel.
- The pattern is composable with any color system in the catalog.

---

## Tokens

> Generated from the same source the live preview renders from.
> Treat the values below as the contract — never substitute approximations.

### Container

| Property | Value |
|----------|-------|
| container | `full-bleed` |
| contentMaxWidth | `1280px` |
| pagePadding | `0px` |

### Vertical Grid

| Property | Value |
|----------|-------|
| columns | `2` |
| maxColumns | `2` |
| lineColor | `rgba(15, 15, 15, 0.10)` |
| lineWidth | `1px` |
| lineStyle | `solid` |
| edgeLines | `false` |

### Section Dividers

| Property | Value |
|----------|-------|
| paddingY | `120px` |
| dividerColor | `rgba(15, 15, 15, 0.08)` |
| dividerWidth | `1px` |
| dividerStyle | `solid` |

### Intersections

| Property | Value |
|----------|-------|
| style | `none` |
| color | `rgba(15, 15, 15, 0.10)` |
| size | `4px` |

## Design Identity

> This pattern ships with its own typography, color, and CTA tokens.
> Use the values below verbatim — they are the system, not a starting point.

### Colors

| Token | Value |
|-------|-------|
| ink (primary text) | `#0c1a2c` |
| surface (page background) | `#f7f8fa` |
| accent (single moment per page) | `#1f4ed8` |
| muted (metadata, captions) | `#6b7585` |
| hairline (rules and dividers) | `#e3e6ec` |

### Typography

Load via Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Role | Family |
|------|--------|
| display (headlines) | `Inter Tight` |
| body (prose) | `Inter` |
| mono (metadata, numerals) | `JetBrains Mono` |

### Type Scale

| Role | Size | Leading | Weight | Tracking |
|------|------|---------|--------|----------|
| Hero / H1 | `clamp(2.5rem, 4.5vw, 3.75rem)` | `1.02` | `700` | `-0.035em` |
| Body | `1rem` | `1.6` | `400` | — |
| Eyebrow | `0.6875rem` | — | `600` | `0.16em` |

### Primary CTA

| Property | Value |
|----------|-------|
| shape | `rounded` |
| background | `#0c1a2c` |
| color | `#ffffff` |
| padding | `12px 24px` |
| fontWeight | `600` |
| radius | `8px` |

> One CTA per page. The pattern's discipline depends on this — never duplicate.

---

## Reference Implementation

Copy-paste-ready HTML + CSS that renders this pattern with the exact token
values declared above. Theme the colors against your system's hairline tone.

### HTML

```html
<div class="page">
  <!-- Single hairline at the 1/3 mark, full viewport height -->
  <div class="split-line" aria-hidden="true"></div>

  <header class="section">
    <aside class="col-narrow">
      <p class="eyebrow">01 — Intro</p>
      <p class="meta">April 2026 · 4 min read</p>
    </aside>
    <div class="col-wide">
      <h1>The argument starts here.</h1>
      <p>Lead paragraph in the wide column. The narrow column carries metadata.</p>
    </div>
  </header>

  <section class="section">
    <aside class="col-narrow">
      <p class="eyebrow">02 — Detail</p>
    </aside>
    <div class="col-wide">
      <h2>Section heading.</h2>
      <p>Body copy lives in the wide column only.</p>
    </div>
  </section>
</div>
```

### CSS

```css
:root {
  --content-max: 1280px;
  --split-line: rgba(15, 15, 15, 0.10);
  --divider:    rgba(15, 15, 15, 0.08);
  --section-y:  120px;
  --gap:        48px;
}

.page { position: relative; min-height: 100vh; }

/* Single full-height hairline at 33.33%. */
.split-line {
  position: absolute;
  top: 0; bottom: 0;
  left: 33.3333%;
  width: 1px;
  background: var(--split-line);
  pointer-events: none;
  z-index: 0;
}

/* Sections are two-column grids that align to the split line. */
.section {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 2fr;
  column-gap: var(--gap);
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--section-y) 32px;
  border-bottom: 1px solid var(--divider);
}

.col-narrow {
  /* Metadata, eyebrows, captions only — never body copy. */
  font-size: 0.8125rem;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.10em;
  font-family: ui-monospace, "JetBrains Mono", monospace;
}

.col-wide h1 { font-size: clamp(2.25rem, 4vw, 4rem); line-height: 1.05; }
.col-wide p  { max-width: 64ch; line-height: 1.65; }

/* Mobile: collapse to a single column, eyebrow becomes a leading label. */
@media (max-width: 768px) {
  .split-line { display: none; }
  .section {
    grid-template-columns: 1fr;
    row-gap: 16px;
    padding: 64px 24px;
  }
}
```
