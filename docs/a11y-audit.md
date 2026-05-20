# WCAG 2.1 AA Accessibility Audit — `docs/wireframe.html`

**Date:** 2026-05-20  
**Scope:** All 6 screens (Landing, Eligible-NoKey, KeyReveal, CLISetup, KeyActive, Ineligible)  
**Standard:** WCAG 2.1 Level AA  
**Method:** Manual code review (color calculations, structural analysis, keyboard path review)

---

## Executive Summary

The wireframe is structurally sound — semantic HTML landmarks, `<aside>`, `<dl>`, `aria-hidden` on decorative elements, and `role="navigation"` with `aria-label` are all correct. However there are **5 P0 failures** that would block AA conformance in production, all fixable in under an hour. Contrast is the main theme: muted text and the wireframe nav bar both fail 4.5:1, and `.n-lbl` labels are rendered at 8px which is illegible regardless of contrast ratio. The absence of `:focus-visible` styles across all interactive elements is the other critical gap.

---

## P0 — Fails WCAG 2.1 AA (must fix)

### P0-1 · Missing focus indicators — SC 2.4.7 Focus Visible (AA)

**Affected elements:** `.btn-primary`, `.btn-ghost`, `.wf-btn`, `.cli-tab`, `.copy-btn`, `.wallet-pill`

None of these interactive elements declare `:focus` or `:focus-visible` styles. Keyboard users have no visible indication of which element is focused. This affects every screen.

**Fix:** Add to each button class:
```css
.btn-primary:focus-visible,
.btn-ghost:focus-visible,
.wf-btn:focus-visible,
.cli-tab:focus-visible,
.copy-btn:focus-visible,
.wallet-pill:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
```

---

### P0-2 · `.n-lbl` 8px text — SC 1.4.4 Resize Text + SC 1.4.3 Contrast (AA)

**Affected elements:** All `.n-lbl` spans (Landing, CLI Setup screens)

Font-size `0.5rem` computes to ~8px at the browser default of 16px. This is a double failure:
1. Text this small is illegible for most users regardless of color.
2. `--muted: #6b7585` on `--surface: #f7f8fa` = **3.97:1** — below the 4.5:1 AA threshold for normal-weight text.

**Calculated contrast ratio:** `#6b7585` L=0.199, `#f7f8fa` L=0.939 → ratio = **(0.939 + 0.05) / (0.199 + 0.05) = 3.97:1** ✗

**Fix:** Raise to `0.6875rem` (matches `.eyebrow` and `.meta`) and/or darken to a value that clears 4.5:1. `#5a6475` on `#f7f8fa` achieves 4.56:1.

---

### P0-3 · `.agent-prompt__label` 9px text — SC 1.4.3 + SC 1.4.4

**Affected elements:** `.agent-prompt__label` (CLI Setup screen)

Font-size `0.5625rem` = ~9px. Same `--muted` color on `--surface` = 3.97:1. Fails both size and contrast.

**Fix:** Raise to `0.6875rem`. Already used by `.eyebrow`, `.meta`, `.copy-btn` — consistent with the rest of the type scale.

---

### P0-4 · `.wf-btn` text contrast — SC 1.4.3

**Affected elements:** Wireframe navigation bar buttons (non-active state)

`.wf-btn` uses `color: rgba(255,255,255,0.45)` on `background: var(--ink)` (`#0c1a2c`). After alpha compositing the blended color is approximately `#797f8b`, giving a contrast ratio of **~4.41:1** — just below the 4.5:1 AA minimum for normal text. The font is `0.5625rem` so "large text" exception (≥18pt or ≥14pt bold) does not apply.

**Calculated contrast ratio:** blended text ~L=0.243, background `#0c1a2c` L=0.016 → **(0.243 + 0.05) / (0.016 + 0.05) = 4.41:1** ✗

**Fix:** Raise to `rgba(255,255,255,0.55)` or `rgba(255,255,255,0.60)`. At 0.55 the blended value ~`#8b9099` gives ~5.2:1. Active state (`color: #fff`) already passes at ~12:1.

---

### P0-5 · `.copy-btn` touch target too small — SC 2.5.5 Target Size (AA)

**Affected elements:** `.copy-btn` inside `.code-block` (Key Reveal, CLI Setup screens)

`.copy-btn` has `padding: 4px 10px` and `font-size: 0.5625rem`. Actual rendered height ≈ 20–22px — well below the 44×44px minimum (SC 2.5.5). On mobile this is nearly impossible to tap accurately.

**Fix:** Minimum `padding: 11px 16px` to reach 44px height. If the visual size must stay small, use a transparent `::before` pseudo-element to expand the hit area:
```css
.copy-btn { position: relative; }
.copy-btn::before {
  content: '';
  position: absolute;
  inset: -10px -8px;
}
```

---

## P1 — Significant AT degradation (should fix before production)

### P1-1 · Copy feedback not announced — SC 4.1.3 Status Messages (AA)

When a copy button is clicked, `textContent` changes to "Copied ✓" but there is no `aria-live` region. Screen reader users get no feedback that the copy succeeded.

**Fix:**
```html
<div role="status" aria-live="polite" class="sr-only" id="copy-feedback"></div>
```
In JS: `document.getElementById('copy-feedback').textContent = 'Copied to clipboard';`

---

### P1-2 · Muted body text fails contrast — SC 1.4.3

**Affected selectors:** `.body-text`, `.cli-sub`, `.cli-note`, `.step__body`, `.n-row__k`

All use `color: var(--muted)` (`#6b7585`) on the surface background (`#f7f8fa`). Ratio = **3.97:1** — fails 4.5:1 for normal-weight 1rem text. Affects large amounts of body copy across all screens.

**Fix option A:** Darken muted color to `#515d6e` (achieves 5.1:1).  
**Fix option B:** Reduce scope of `--muted` for body copy; only use it for decorative metadata (`.n-lbl`, `.eyebrow`) where smaller text tolerates lower contrast.

> Note: This applies to `.body-text` at 1rem, `.cli-sub` at 0.875rem, and `.step__body` at 0.9375rem — none qualify as large text.

---

### P1-3 · Wallet pill button label — SC 1.1.1 / SC 4.1.2

```html
<button class="wallet-pill">0xabcd…1234 · Disconnect</button>
```

Screen readers will spell out the hex address character by character. The button purpose (Disconnect) is buried in the label after unpronouneable content.

**Fix:**
```html
<button class="wallet-pill" aria-label="Disconnect wallet 0xabcd…1234">
  <span aria-hidden="true">0xabcd…1234 · Disconnect</span>
</button>
```

---

### P1-4 · External link missing new-tab warning — SC 3.2.2

Screen 6 (Ineligible): `<a href="https://tokamak.network/staking" target="_blank">` opens in a new tab without any warning.

**Fix:**
```html
<a href="https://tokamak.network/staking" target="_blank" 
   aria-label="Stake on Tokamak (opens in new tab)">
  Stake on Tokamak →
</a>
```

---

### P1-5 · No skip-navigation link — SC 2.4.1 Bypass Blocks (AA)

The `.wf-nav` bar contains 6 focusable buttons that keyboard users must tab through to reach main content on every page load or screen switch.

**Fix:** Add before `.wf-nav`:
```html
<a href="#main-content" class="skip-link">Skip to content</a>
```
```css
.skip-link {
  position: absolute; top: -40px; left: 8px;
  background: var(--surface-raised); color: var(--ink);
  padding: 8px 16px; border-radius: var(--radius);
  font-size: 0.875rem; font-weight: 600;
  z-index: 999; transition: top 120ms;
}
.skip-link:focus { top: 8px; }
```
Add `id="main-content"` to `<div class="page">`.

---

### P1-6 · `⚠` emoji not hidden from AT — SC 1.1.1

```html
<span class="key-warning__icon">⚠</span>
```

Screen readers announce this as "Warning sign" which is adjacent to the same meaning in text. Redundant but not harmful. Best practice: `aria-hidden="true"`.

---

### P1-7 · Language of parts — SC 3.1.2 Language of Parts (AA)

`<html lang="ko">` but Screens 1, 2, 3, 5 are primarily English. Screen 4 mixes both. AT users configured for Korean TTS will mispronounce the English.

**Fix:** Set `<html lang="en">` and wrap Korean passages:
```html
<p lang="ko">에이전트에게 위임하면 환경 변수를 직접 편집할 필요가 없습니다.</p>
```
Alternatively keep `lang="ko"` and mark English sections — choose based on the primary audience.

---

### P1-8 · Screen-switcher emoji digits — SC 1.3.3

```html
<button class="wf-btn" onclick="show('s-eligible')">② Dashboard · Eligible</button>
```

The circled digits ①②③④⑤⑥ are announced as "Circled digit one", "Circled digit two", etc. by most screen readers. This is verbose and unexpected.

**Fix:** Replace with plain numeric text or hide with `aria-hidden`:
```html
<button class="wf-btn" onclick="show('s-eligible')">
  <span aria-hidden="true">② </span>Dashboard · Eligible
</button>
```

---

## P2 — Best practice / minor improvements

### P2-1 · `<section>` elements lack accessible names — SC 1.3.1 (advisory)

Sections use visual headings but none have `aria-labelledby` connecting to those headings. This limits AT landmark navigation.

**Fix:** Add IDs to headings and `aria-labelledby` to parent sections where applicable:
```html
<section class="section" aria-labelledby="hero-heading">
  <div class="col-wide"><h1 id="hero-heading">Your stake earns you AI.</h1></div>
</section>
```

---

### P2-2 · `.key-value` has no accessible label

The API key string is unlabelled. Screen readers will read the raw key string with no context.

**Fix:** Wrap the key display:
```html
<span class="key-value" aria-label="API key: sk-litellm-xK9mQpR7vT2nBfLw4JhYcD8eZ1aUoI3s">
  sk-litellm-xK9mQpR7vT2nBfLw4JhYcD8eZ1aUoI3s
</span>
```

---

### P2-3 · `.badge` status not surfaced as live region

Eligibility badges ("Eligible" / "Not eligible") are static text but convey the core outcome. If badges update dynamically in production, they should use `role="status"` or `aria-live="polite"`.

For the wireframe this is fine; flag for the React implementation in `app/dashboard/page.tsx`.

---

### P2-4 · No `prefers-reduced-motion` media query

The file uses `transition` on multiple elements (`.wf-btn`, `.btn-primary`, `.wallet-pill`). No `prefers-reduced-motion` query disables these — SC 2.3.3 Animation from Interactions (AAA, but good practice).

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; }
}
```

---

## Issue Summary

| ID | Criterion | Severity | Screen(s) | Fix effort |
|----|-----------|----------|-----------|------------|
| P0-1 | SC 2.4.7 Focus Visible | **FAIL** | All | ~15 min |
| P0-2 | SC 1.4.3 + 1.4.4 (`.n-lbl`) | **FAIL** | Landing, CLI | ~5 min |
| P0-3 | SC 1.4.3 + 1.4.4 (`.agent-prompt__label`) | **FAIL** | CLI | ~2 min |
| P0-4 | SC 1.4.3 (`.wf-btn` contrast) | **FAIL** | All (nav) | ~2 min |
| P0-5 | SC 2.5.5 Touch target (`.copy-btn`) | **FAIL** | Key Reveal, CLI | ~5 min |
| P1-1 | SC 4.1.3 Status Messages (copy) | Significant | Key Reveal, CLI | ~20 min |
| P1-2 | SC 1.4.3 (`.body-text` muted) | Significant | All | ~5 min |
| P1-3 | SC 4.1.2 (wallet pill label) | Significant | All dashboard | ~5 min |
| P1-4 | SC 3.2.2 (external link) | Significant | Ineligible | ~2 min |
| P1-5 | SC 2.4.1 Skip link | Significant | All | ~15 min |
| P1-6 | SC 1.1.1 (⚠ emoji) | Minor | Key Reveal | ~1 min |
| P1-7 | SC 3.1.2 Language of parts | Significant | All | ~10 min |
| P1-8 | SC 1.3.3 (emoji digits) | Minor | All (nav) | ~5 min |
| P2-1 | SC 1.3.1 (section labels) | Advisory | All | ~10 min |
| P2-2 | SC 1.3.1 (key-value label) | Advisory | Key Reveal | ~2 min |
| P2-3 | SC 4.1.3 (badge live) | Advisory | Dashboard | Flag for impl |
| P2-4 | SC 2.3.3 reduced-motion | Advisory | All | ~5 min |

**Total estimated effort for P0+P1:** ~1.5 hours  
**P0 alone:** ~30 minutes

---

## What passes ✅

- Semantic landmarks: `<nav aria-label>`, `<aside>`, `<main>`-equivalent structure, `<section>`, `<dl>/<dt>/<dd>`
- `<div class="split-line" aria-hidden="true">` — decorative element hidden from AT
- Badge colors: `badge--ok` (#166534 on #f0fdf4 = 6.5:1), `badge--no` (#9f1239 on #fff1f2 = 7.3:1), `badge--blue` (#1e40af on #eff6ff = 8.4:1)
- Warning banner text: `#78350f` on `#fffbeb` = 8.1:1
- Buttons are real `<button>` elements (keyboard accessible, not `<div onclick>`)
- Screen-switcher correctly hides inactive screens via `display:none` (AT cannot reach hidden content)
- `btn-primary:disabled` has `cursor: not-allowed` (non-AA but good UX)
- `<a>` on "Stake on Tokamak" is a proper anchor (not a button)
