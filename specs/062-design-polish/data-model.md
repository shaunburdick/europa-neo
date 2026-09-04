# Data Model: Design Polish

**Feature**: 062-design-polish | **Date**: 2026-09-03 | **Spec**: [`spec.md`](./spec.md)

This document defines the token data model and the CSS custom-property map for the Design Polish feature. It is the authoritative reference for what tokens are added, what values they carry, and how they map to CSS variables.

---

## 1. Token Data Model

The token table (`packages/design/src/tokens.ts`) is the single source of truth. Each token is a leaf in a group, with a canonical value. The CSS emitter derives the variable name as `--europa-{group}-{kebab(name)}`.

### 1.1 Token Groups

| Group | Existing tokens | New tokens (this feature) |
|-------|-----------------|---------------------------|
| `shadows` | `board`, `modal`, `plate` (all `none`) | `cardHover`, `cardActive`, `hud` (new); `board`, `modal`, `plate` (updated) |
| `motion` | `durationMs`, `easing`, `easingLinear`, `spinDuration` | `duration`, `transitionFast`, `transitionDefault`, `transitionSlow`, `transitionSpring`, `easingOut`, `easingInOut` |
| `color` | (existing palette) | `textLink`, `accentActive`, `divider`, `cardHoverBorder` |
| `typography` | (existing sizes/fonts) | `heading`, `subheading`, `trackingTight`, `trackingNormal`, `trackingWide` |
| `focusRing` | `color`, `offset`, `style`, `width` | `darkColor`, `lightColor` |

### 1.2 New Token Definitions

#### shadows

| Token name | CSS variable | Value | Type | Purpose |
|------------|--------------|-------|------|---------|
| `cardHover` | `--europa-shadows-card-hover` | `0 4px 12px rgba(0, 0, 0, 0.3)` | string | Elevated hover state for interactive cards |
| `cardActive` | `--europa-shadows-card-active` | `0 2px 4px rgba(0, 0, 0, 0.25)` | string | Pressed/lifted state for interactive cards |
| `hud` | `--europa-shadows-hud` | `0 2px 8px rgba(0, 0, 0, 0.25)` | string | HUD panel depth |
| `board` | `--europa-shadows-board` | `inset 0 1px 4px rgba(0, 0, 0, 0.3)` | string | Board area depth (inset, recessed) |
| `modal` | `--europa-shadows-modal` | `0 8px 32px rgba(0, 0, 0, 0.4)` | string | Modal dialog elevation |
| `plate` | `--europa-shadows-plate` | `0 2px 8px rgba(0, 0, 0, 0.2)` | string | Card/plate surface elevation |

**Constraint**: All shadow values use `rgba(0,0,0,...)` (dark-slate palette) to avoid light-theme incompatibility (spec 012 § 6). Opacity is proportional to depth: plate (0.2) < hud (0.25) < cardActive (0.25) < cardHover (0.3) < modal (0.4).

#### motion

| Token name | CSS variable | Value | Type | Purpose |
|------------|--------------|-------|------|---------|
| `duration` | `--europa-motion-duration` | `120ms` | string | Pre-composed CSS time equivalent of `durationMs` (120) |
| `transitionFast` | `--europa-motion-transition-fast` | `80ms` | string | Fast feedback: button hover, focus ring appear |
| `transitionDefault` | `--europa-motion-transition-default` | `120ms` | string | Standard transitions: card lift, color shifts |
| `transitionSlow` | `--europa-motion-transition-slow` | `200ms` | string | Slower transitions: modal enter, toast slide |
| `transitionSpring` | `--europa-motion-transition-spring` | `300ms` | string | Spring-like ease for bouncy animations |
| `easingOut` | `--europa-motion-easing-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | string | Refined decelerating ease for enter animations |
| `easingInOut` | `--europa-motion-easing-in-out` | `ease-in-out` | string | Accelerating-decelerating ease for exit animations |

**Constraint**: `durationMs` (number, 120) is unchanged and remains the canonical "unitless" duration for programmatic use. The new tokens are CSS `time` values for `transition` shorthand composition.

#### color

| Token name | CSS variable | Value | Reuses | Purpose |
|------------|--------------|-------|--------|---------|
| `textLink` | `--europa-color-text-link` | `#f59e0b` | `accent` | Link text color (semantic name for link context) |
| `accentActive` | `--europa-color-accent-active` | `#d97706` | `banner` | Active/pressed state for accent-colored elements |
| `divider` | `--europa-color-divider` | `#374151` | `border` | Semantic divider/separator color |
| `cardHoverBorder` | `--europa-color-card-hover-border` | `#f59e0b` | `accent` | Accent border on card hover (interactive-only) |

**Constraint**: All new color tokens reuse existing hex values — zero new hex literals beyond the token table (FR-009/FR-010, G-04).

#### typography

| Token name | CSS variable | Value | Reuses | Purpose |
|------------|--------------|-------|--------|---------|
| `heading` | `--europa-typography-heading` | `1.5rem` | `size3xl` | Semantic heading size alias |
| `subheading` | `--europa-typography-subheading` | `1.2rem` | `size2xl` | Semantic subheading size alias |
| `trackingTight` | `--europa-typography-tracking-tight` | `-0.025em` | — | Tight letter-spacing for headings |
| `trackingNormal` | `--europa-typography-tracking-normal` | `0` | — | Default letter-spacing (explicit zero) |
| `trackingWide` | `--europa-typography-tracking-wide` | `0.05em` | — | Wide letter-spacing for meta/badges |

#### focusRing

| Token name | CSS variable | Value | Purpose |
|------------|--------------|-------|---------|
| `darkColor` | `--europa-focus-ring-dark-color` | `#111827` | Focus ring color for light surfaces (future light theme) |
| `lightColor` | `--europa-focus-ring-light-color` | `#ffffff` | Focus ring color for dark surfaces (current default) |

**Constraint**: The existing `color` token (`#ffffff`) is unchanged. The `--europa-focus-ring-color` variable continues to use the `lightColor` value.

---

## 2. CSS Custom-Property Map

The emitter (`build-css.ts`) walks the token table in sorted key order and emits each leaf as a CSS custom property in the `:root` block. The complete new-variable map:

### 2.1 `:root` additions

```
--europa-shadows-card-hover: 0 4px 12px rgba(0, 0, 0, 0.3);
--europa-shadows-card-active: 0 2px 4px rgba(0, 0, 0, 0.25);
--europa-shadows-hud: 0 2px 8px rgba(0, 0, 0, 0.25);
--europa-shadows-board: inset 0 1px 4px rgba(0, 0, 0, 0.3);
--europa-shadows-modal: 0 8px 32px rgba(0, 0, 0, 0.4);
--europa-shadows-plate: 0 2px 8px rgba(0, 0, 0, 0.2);
--europa-motion-duration: 120ms;
--europa-motion-transition-fast: 80ms;
--europa-motion-transition-default: 120ms;
--europa-motion-transition-slow: 200ms;
--europa-motion-transition-spring: 300ms;
--europa-motion-easing-out: cubic-bezier(0.16, 1, 0.3, 1);
--europa-motion-easing-in-out: ease-in-out;
--europa-color-text-link: #f59e0b;
--europa-color-accent-active: #d97706;
--europa-color-divider: #374151;
--europa-color-card-hover-border: #f59e0b;
--europa-typography-heading: 1.5rem;
--europa-typography-subheading: 1.2rem;
--europa-typography-tracking-tight: -0.025em;
--europa-typography-tracking-normal: 0;
--europa-typography-tracking-wide: 0.05em;
--europa-focus-ring-dark-color: #111827;
--europa-focus-ring-light-color: #ffffff;
```

### 2.2 `:root` comments (FR-046)

The emitter adds inline comments for the two background tokens:

```css
/* page-bg: the outermost page background (lobby, manual pages) */
--europa-color-page-bg: #0b0f19;
/* void-bg: the board/canvas recessed background (distinct from page-bg) */
--europa-color-void-bg: #1a2233;
```

---

## 3. `tokens.json` Schema (FR-006)

`dist/tokens.json` is a machine-readable representation of the complete token table. One entry per CSS variable:

```json
[
    {
        "name": "cardHover",
        "group": "shadows",
        "cssVar": "--europa-shadows-card-hover",
        "value": "0 4px 12px rgba(0, 0, 0, 0.3)"
    },
    {
        "name": "duration",
        "group": "motion",
        "cssVar": "--europa-motion-duration",
        "value": "120ms"
    }
]
```

**Fields**:
- `name` — the leaf key (e.g., `cardHover`)
- `group` — the group key (e.g., `shadows`)
- `cssVar` — the derived CSS variable name (e.g., `--europa-shadows-card-hover`)
- `value` — the canonical value (string or number, stringified)

**Determinism**: Entries are sorted lexicographically by `cssVar` (matching the CSS emitter). Repeated runs produce byte-identical output.

---

## 4. `contrast-notes.json` Schema (FR-045, G9)

`dist/contrast-notes.json` is a machine-readable representation of the documented contrast pairings. One entry per pairing:

```json
[
    {
        "foreground": "#f59e0b",
        "background": "#111827",
        "ratio": 8.26,
        "target": "AA 1.4.3 normal (≥ 4.5:1)",
        "meets": true
    }
]
```

**Fields**:
- `foreground` — the foreground color (hex)
- `background` — the background color (hex)
- `ratio` — the computed WCAG contrast ratio (2 decimals)
- `target` — the WCAG target (e.g., "AA 1.4.3 normal (≥ 4.5:1)")
- `meets` — whether the ratio meets the target

**Computation**: Ratios are computed from the canonical token values using the WCAG relative-luminance formula. No hardcoded ratios.

---

## 5. New Catalog Classes (CSS-only)

All new classes are added to `packages/design/src/styles/catalog.css`. They compose only `--europa-*` tokens (no hex/rgb literals).

### 5.1 Component classes

| Class | Element | Purpose |
|-------|---------|---------|
| `.europa-link` | `<a>` | Styled link with hover underline + focus ring |
| `.europa-divider` | `<hr>` | Horizontal separator; variants `--success/error/warning` |
| `.europa-tooltip` | `<span data-tooltip>` | CSS-only tooltip via `::after`/`::before` |
| `.europa-badge--success/warning/error/info/accent` | `<span>` | Status-indicator badge variants |
| `.europa-empty-state` | `<div>` | Centered placeholder for empty content |

### 5.2 Typography utility classes (FR-040a)

| Class | Font-size | Weight | Color | Line-height | Tracking |
|-------|-----------|--------|-------|-------------|----------|
| `.europa-heading-1` | `size3xl` | 700 | `text-primary` | `normal` | `tight` |
| `.europa-heading-2` | `size2xl` | 700 | `text-primary` | `normal` | `tight` |
| `.europa-heading-3` | `size-xl` | 700 | `text-primary` | `normal` | `tight` |
| `.europa-subheading` | `size-lg` | 600 | `text-secondary` | `normal` | `normal` |
| `.europa-body` | `size-base` | 400 | `text-secondary` | `relaxed` | `normal` |
| `.europa-body-sm` | `size-sm` | 400 | `text-secondary` | `relaxed` | `normal` |
| `.europa-caption` | `size-xs` | 400 | `text-muted` | `normal` | `wide` |

### 5.3 Layout utility classes (FR-039)

| Class | Display | Purpose |
|-------|---------|---------|
| `.europa-layout-centered` | flex column, centered | Centered content column |
| `.europa-layout-sidebar` | flex row | Board + sidebar composition |
| `.europa-layout-card-grid` | grid | Card grid layout |

### 5.4 Footer classes (FR-038)

| Class | Purpose |
|-------|---------|
| `.europa-footer` | Branded footer area |
| `.europa-footer__links` | Flex row of footer links |

---

## 6. Console CSS Additions

All console polish lives in `packages/console/src/styles/index.css`. These are console-local selectors (not shared catalog surface).

### 6.1 Selector map

| Selector | Change | FR |
|----------|--------|----|
| `.europa-lobby__card` | box-shadow + transition + hover/active lift | FR-007 |
| `.europa-lobby__row` | transition + hover border + state modifiers | FR-008, G2 |
| `.europa-hud` | box-shadow | FR-009 |
| `.europa-button` | transition | FR-010 |
| `.europa-hud__surrender` | danger hover/active | FR-011 |
| `.europa-order-bar__button[aria-pressed="true"]` | transition | FR-012 |
| `.europa-order-bar__mode--active` | accent bg + page-bg text | FR-012, G3 |
| `.europa-feedback__item` | slide-in/out animation + variant borders | FR-013, G4 |
| `.europa-modal-backdrop` | backdrop-filter + fade-in | FR-014 |
| `.europa-modal` | scale-in | FR-014 |
| `.europa-error-boundary` | bg + inset ring + icon + details | FR-015, G6 |
| `.europa-route-notice__panel` | box-shadow + icon | FR-016, G7 |
| `.europa-lobby__grid` | responsive breakpoints | FR-022 |
| `.europa-board-layout` | responsive stacking | FR-023 |
| `.europa-hud` | horizontal layout ≥1200px | FR-024 |
| `.europa-modal` | responsive width ≤480px | FR-025 |
| `.europa-lobby__hero` | hero lockup | FR-026 |
| `.europa-lobby__card--identity` | left accent border | FR-027 |
| `.europa-lobby__row-id/meta/badge` | letter-spacing | FR-028 |
| `.europa-lobby__empty` | refactor to `.europa-empty-state` | FR-029 |
| `.europa-lobby__input` | focus accent border | FR-030 |
| `.europa-board-area` | inset shadow | FR-031 |
| `.europa-hud__section` | top border separator | FR-032 |
| `.europa-order-bar__mode` | uppercase + wide tracking | FR-033 |
| `.europa-reserves__digit` | transition | FR-034 |
| `.europa-feedback` | bottom-left fixed | FR-035 |
| `.europa-waiting` | backdrop-filter blur | FR-036 |
| `.europa-modal__button--danger` | filled danger | FR-037 |
