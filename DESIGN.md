# DESIGN.md - LunaCycle Personal Wellness & Cycle Tracker Design System
<!-- Specification Standard: Google Stitch (Google Labs open-source DESIGN.md standard) -->
<!-- Project: LunaCycle — Private Offline-First Cycle, Fertility & Pregnancy PWA -->
<!-- Version: 1.0.0 -->
<!-- Status: Active & Enforced -->

---

## 1. Design Philosophy & Brand Vibe

LunaCycle is a **calm, private, zero-bloat personal cycle and wellness companion**. Rather than adopting shrill neon-pink gamification or cluttered ad-driven feeds, LunaCycle delivers a serene, editorial, tactile paper-and-ink experience grounded in our master heritage palette.

### Core Principles
1. **Zero-Anxiety Editorial Calm:** Warm Pearl Ivory (`#FAFAF7`) canvas paired with deep Imperial Maroon (`#6B1D2F`) for menstrual states, Auspicious Temple Green (`#1B4D3E`) for fertile windows, and Antique Temple Gold (`#C5A059`) for peak ovulation and key focal rings.
2. **Privacy by Architecture:** Zero external network calls, zero third-party analytics, zero remote font CDNs. Disguise mode shifts the chrome to neutral "Daily Notes" in one tap.
3. **One-Handed Mobile Ergonomics:** Bottom 4-tab navigation with `48px` tap targets, single-tap period logging on the hero card, and batch-edit calendar selection.
4. **Uncompromising Accessibility:** WCAG 2.2 AA / AAA contrast ratios, multi-cue phase indicators (shape + border + pattern + text, never color-only), native `<dialog>` modals, and `prefers-reduced-motion` safety.

---

## 2. Design Tokens (The Color Hierarchy)

```css
:root {
  /* Master Brand & Cycle Semantic Tokens */
  --color-brand-primary:       #6B1D2F; /* Imperial Maroon — Primary CTA & logged period days */
  --color-brand-primary-soft:  #F6E9EC; /* Soft Rose Tint — Menstrual phase surface */
  --color-brand-primary-mid:   #9B364E; /* Muted Crimson — Hover / predicted period ring */
  --color-brand-accent:        #C5A059; /* Antique Temple Gold — Ovulation peak & focus ring */
  --color-brand-accent-soft:   #FAF4E6; /* Warm Gold Mist — Ovulation highlight surface */
  --color-brand-secondary:     #1B4D3E; /* Auspicious Temple Green — Fertile window & TTC cues */
  --color-brand-secondary-soft:#E9F2EE; /* Soft Sage Tint — Fertile phase surface */

  /* Canvas & Surface Tokens */
  --color-canvas-base:         #FAFAF7; /* Warm Pearl Ivory — Non-glare page canvas */
  --color-surface-card:        #FFFFFF; /* Pure White — Elevated cards & dialogs */
  --color-surface-elevated:    #F3EFEA; /* Soft Sandstone — Secondary tabs & pill wells */
  --color-border-subtle:       #EAE5DC; /* Crisp 1px tactile divider */
  --color-border-focus:        #C5A059; /* Antique Gold focus outline */

  /* Text & Readability Tokens (WCAG AA / AAA) */
  --color-text-primary:        #1C1917; /* Charcoal Slate — Primary headings & metrics */
  --color-text-secondary:      #4B5563; /* Warm Neutral — Supporting descriptions */
  --color-text-muted:          #6B7280; /* Subtle Gray — Captions & metadata */
  --color-text-inverse:        #FFFFFF; /* Pure White — Text on maroon/green fills */

  /* Semantic Feedback Tokens */
  --color-feedback-success:    #15803D;
  --color-feedback-warning:    #B45309;
  --color-feedback-error:      #B91C1C;
}
```

---

## 3. Typography Hierarchy & Fluid Type Scale

Zero external font requests are made so health tracking stays 100% offline and private. Local serif and humanist sans stacks provide high editorial contrast:

* **Display / Editorial Headings:** `"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Georgia, serif`
* **UI Controls & Body Copy:** `"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
* **Numeric Metrics & Cycle Counts:** `font-variant-numeric: tabular-nums` enforced across all cycle day counters, countdowns, calendar grids, BBT readings, and history charts.

```css
--font-size-hero:    clamp(2rem, 5vw + 0.75rem, 2.75rem);
--font-size-h1:      clamp(1.5rem, 2.5vw + 0.75rem, 2rem);
--font-size-h2:      clamp(1.2rem, 1.5vw + 0.5rem, 1.45rem);
--font-size-body:    0.96875rem; /* 15.5px */
--font-size-caption: 0.8125rem;  /* 13px */
--font-size-micro:   0.75rem;    /* 12px */
```

---

## 4. Spacing, Radii, Elevation & Motion Craft

* **8-Point Spatial Grid:** `4px`, `8px`, `12px`, `16px`, `24px`, `32px`.
* **Concentric Radii:** `12px` modal/card containers, `8px` nested inner wells/inputs, `6px` buttons, `9999px` semantic tags and calendar day rings.
* **Hairline Elevation:** `1px solid var(--color-border-subtle)` paired with `0 2px 4px rgba(28, 25, 23, 0.04), 0 8px 20px -4px rgba(107, 29, 47, 0.07)`.
* **Motion Craft:** Composite-only transitions (`transform`, `opacity`) using `cubic-bezier(0.23, 1, 0.32, 1)` (`180ms–260ms`), tactile `:active { transform: scale(0.97); }`, and `@media (prefers-reduced-motion: reduce)` disablement.

---

## 5. Accessibility & Platform Contracts

1. **Minimum Tap Targets:** Every button, calendar day cell, symptom chip, tab item, and switch meets `>= 44×44px` hit area.
2. **Keyboard Focus:** `2px solid var(--color-border-focus)` with `2px` offset via `:focus-visible`.
3. **Native Top-Layer Dialogs:** All modals use `<dialog>` via `showModal()` with `closedby="any"` (+ pointer fallback), `overscroll-behavior: contain` on `dialog:modal` and `dialog::backdrop`, and `overflow: hidden` on `dialog::backdrop`.
4. **Native Switches:** Settings toggles use `<input type="checkbox" switch>` with `accent-color` and conditional `input-switch-polyfill`.
5. **Location-Agnostic Dates:** All period, ovulation, and pregnancy dates use `Temporal.PlainDate` (`YYYY-MM-DD`) so travel across timezones or DST transitions never shifts a cycle day.
