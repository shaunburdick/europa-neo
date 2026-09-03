# Feature Specification: Design Polish

> Version: 1.1
> Last Updated: 2026-09-03
> Status: Implemented (2026-09-03)
> Dependencies: Feature 012 (Design System), Feature 014 (Shared UI Components), Feature 005 (Client Console)

## Problem Statement

The design system (`@europa/design`) established in Feature 012 ships a solid token foundation and a component catalog, but its visual treatment is deliberately minimal: shadow tokens are all `none`, motion tokens lack variety, interactive states are absent, and console-specific surfaces have no elevation or hover polish. The result is a flat, undifferentiated chrome where every card, button, and panel sits at the same visual depth, hover states are invisible, and the interface feels static rather than responsive to user input.

This feature delivers the polish layer on top of the existing design system — adding shadow depth, transition timing, interactive states, new catalog components, responsive breakpoints, page-specific layout refinements, and a standalone design system preview page. No backend changes; all work is CSS/token/TSX in `@europa/design` and `@europa/console`. The spec covers five phases of implementation (Foundation → Console Polish → New Components → Responsive → Page-Specific Layouts) plus design-system documentation and DX improvements.

## User Stories

### US1 — Cards and Panels Have Visual Depth (P1)

As a player, I want the cards, HUD, and modals to feel like they exist at different layers — with subtle shadows and hover lift on interactive cards — so that the interface communicates hierarchy and responsiveness rather than flatness.

**Why this priority**: Shadow and elevation tokens are the hard dependency for everything else. Without them, none of the visual polish can land.

**Independent Test**: Build the console and verify `.europa-card`, `.europa-hud`, `.europa-modal`, `.europa-plate`, and `.europa-board-area` each have non-`none` box-shadow values matching the new shadow tokens. Hover an interactive card and verify a visible lift (shadow + translateY change) occurs within 120ms.

### US2 — Buttons and Controls Feel Responsive (P1)

As a player, I want buttons to transition smoothly on hover/active/focus and the surrender button to show a danger state, so that every interaction feels intentional and feedback is immediate.

**Why this priority**: Interactive states are the most noticeable polish improvement and directly affect gameplay UX.

**Independent Test**: Hover a primary button and verify a background-color transition occurs within 120ms. Press and verify an active state (scale or color shift). Focus via keyboard and verify the focus ring is visible. Hover the surrender button and verify a danger-colored state appears.

### US3 — Lobby and Match Views Adapt to Screen Size (P2)

As a player on a laptop, tablet, or phone, I want the lobby grid to stack on narrow screens and the HUD to lay out horizontally on wide screens, so that the game is usable at every viewport width.

**Why this priority**: Responsive design is required by the accessibility-minded UI principle (constitution Principle VI) and directly impacts mobile usability.

**Independent Test**: Render the lobby at 480px width — grid should stack to single column. At 768px — two columns. At 1200px+ — HUD sections should display horizontally.

### US4 — New Design System Components Are Available (P2)

As a developer, I want `.europa-link`, `.europa-divider`, `.europa-tooltip`, `.europa-badge` (status indicator), and `.europa-empty-state` in the catalog, so that I can compose common patterns without writing custom CSS.

**Why this priority**: These components fill gaps in the current catalog identified by the product owner and reduce ad-hoc CSS in consumer surfaces.

**Independent Test**: Apply each new class in a test HTML page and verify it renders correctly using only design tokens (no hex/rgb literals). Verify each component is documented in DESIGN.md § 2.

### US5 — The Design System Has a Standalone Preview Page (P2)

As a contributor, I want a design system preview/documentation page that showcases all tokens, colors, typography, components, and accessibility information in a self-contained page, so that I can understand the design language without reading source code.

**Why this priority**: The mockup reference is the visual contract for the preview page; it improves onboarding and serves as a living reference.

**Independent Test**: Navigate to the preview page (served via the design package or a dev route) and verify the hero section, color swatches, typography scale, token tables, component catalog, accessibility pairings, and layout patterns all render correctly.

### US6 — Documentation and DX Are Complete (P2)

As a maintainer, I want DESIGN.md updated with all new tokens/components, `tokens.json` generated from the token table, and CSS variable comments explaining the void-bg vs page-bg distinction, so that the design contract stays truthful and tooling is consistent.

**Why this priority**: The "specs stay truthful" rule (constitution Principle IV) requires DESIGN.md to be updated in the same change set as implementation.

## Functional Requirements

### Phase 1 — Foundation Tokens

#### FR-001: Shadow Tokens

The `shadows` group in `packages/design/src/tokens.ts` gains the following new tokens. Existing tokens `board`, `modal`, `plate` are updated from `none` to real shadow values. New tokens `cardHover`, `cardActive`, and `hud` are added. All shadow values use rgba with the dark-slate palette to avoid light-theme incompatibility (spec 012 § 6).

| Token name | CSS variable | Value | Purpose |
|---|---|---|---|
| `cardHover` | `--europa-shadows-card-hover` | `0 4px 12px rgba(0, 0, 0, 0.3)` | Elevated hover state for interactive cards |
| `cardActive` | `--europa-shadows-card-active` | `0 2px 4px rgba(0, 0, 0, 0.25)` | Pressed/lifted state for interactive cards |
| `hud` | `--europa-shadows-hud` | `0 2px 8px rgba(0, 0, 0, 0.25)` | HUD panel depth |
| `board` | `--europa-shadows-board` | `inset 0 1px 4px rgba(0, 0, 0, 0.3)` | Board area depth (inset for recessed feel) |
| `modal` | `--europa-shadows-modal` | `0 8px 32px rgba(0, 0, 0, 0.4)` | Modal dialog elevation |
| `plate` | `--europa-shadows-plate` | `0 2px 8px rgba(0, 0, 0, 0.2)` | Card/plate surface elevation |

**Implementation note**: Values are chosen to be subtle on the dark-slate palette. The `rgba(0,0,0,...)` approach ensures no color cast; opacity levels are proportional to the intended depth (plate < hud < cardHover < modal).

#### FR-002: Transition Tokens

The `motion` group gains a pre-composed duration token, three new transition-duration tokens, and two new easing tokens.

| Token name | CSS variable | TS constant | Value | Purpose |
|---|---|---|---|---|
| `duration` | `--europa-motion-duration` | `TOKENS.motion.duration` | `120ms` | Pre-composed CSS time equivalent of the existing `durationMs` (120) for use in `transition` shorthand |
| `transitionFast` | `--europa-motion-transition-fast` | `TOKENS.motion.transitionFast` | `80ms` | Fast feedback: button hover, focus ring appear |
| `transitionDefault` | `--europa-motion-transition-default` | `TOKENS.motion.transitionDefault` | `120ms` | Standard transitions: card lift, color shifts |
| `transitionSlow` | `--europa-motion-transition-slow` | `TOKENS.motion.transitionSlow` | `200ms` | Slower transitions: modal enter, toast slide |
| `transitionSpring` | `--europa-motion-transition-spring` | `TOKENS.motion.transitionSpring` | `300ms` | Spring-like ease for bouncy animations (waiting overlay) |
| `easingOut` | `--europa-motion-easing-out` | `TOKENS.motion.easingOut` | `cubic-bezier(0.16, 1, 0.3, 1)` | Refined decelerating ease for enter animations (smooth, organic feel) |
| `easingInOut` | `--europa-motion-easing-in-out` | `TOKENS.motion.easingInOut` | `ease-in-out` | Accelerating-decelerating ease for exit animations |

**Implementation note**: All new transition tokens respect `prefers-reduced-motion: reduce` via the existing catalog guard (spec 012 FR-008). The `durationMs` token (120) is unchanged and remains the canonical "unitless" duration for programmatic use; the new tokens are CSS `time` values for `transition` shorthand composition. The `duration` token is the CSS `time` equivalent for contexts that need a `transition` shorthand value instead of a JS number.

#### FR-003: Color Token Additions

New tokens added to the `color` group:

| Token name | CSS variable | Value | Purpose |
|---|---|---|---|
| `textLink` | `--europa-color-text-link` | `#f59e0b` | Link text color (reuses accent — same value, semantic name for link context) |
| `accentActive` | `--europa-color-accent-active` | `#d97706` | Active/pressed state for accent-colored elements |
| `divider` | `--europa-color-divider` | `#374151` | Semantic divider/separator color (reuses border — same value, semantic name) |
| `cardHoverBorder` | `--europa-color-card-hover-border` | `#f59e0b` | Accent border on card hover (interactive-only) |

#### FR-004: Typography Token Additions

New tokens added to the `typography` group:

| Token name | CSS variable | Value | Purpose |
|---|---|---|---|
| `heading` | `--europa-typography-heading` | `1.5rem` | Semantic heading size alias (reuses size3xl) |
| `subheading` | `--europa-typography-subheading` | `1.2rem` | Semantic subheading size alias (reuses size2xl) |
| `trackingTight` | `--europa-typography-tracking-tight` | `-0.025em` | Tight letter-spacing for headings |
| `trackingNormal` | `--europa-typography-tracking-normal` | `0` | Default letter-spacing (explicit zero) |
| `trackingWide` | `--europa-typography-tracking-wide` | `0.05em` | Wide letter-spacing for meta/badges |

#### FR-005: Focus Ring Token Additions

New tokens added to the `focusRing` group:

| Token name | CSS variable | Value | Purpose |
|---|---|---|---|
| `darkColor` | `--europa-focus-ring-dark-color` | `#111827` | Focus ring color for light surfaces (if future light theme) |
| `lightColor` | `--europa-focus-ring-light-color` | `#ffffff` | Focus ring color for dark surfaces (current default) |

**Note**: The existing `color` token (`#ffffff`) is unchanged. The `darkColor`/`lightColor` pair provides the semantic names for theme-aware focus rings without breaking existing usage. The `--europa-focus-ring-color` variable continues to use the `lightColor` value.

#### FR-006: `tokens.json` Generation

The build-css emitter (`packages/design/scripts/build-css.ts`) gains a new output mode (`--emit-json`) that writes `dist/tokens.json` — a machine-readable JSON representation of the complete token table, one entry per CSS variable with `name`, `value`, and `group` fields. This file is gitignored (build output) and consumed by tooling, documentation generators, and the design system preview page.

### Phase 2 — Console CSS Polish

All changes in this phase are in `packages/console/src/styles/index.css`. No new TypeScript components unless noted.

#### FR-007: Card Elevation and Hover Lift

`.europa-lobby__card` gains:
- `box-shadow: var(--europa-shadows-plate)` (elevation at rest)
- `transition: box-shadow var(--europa-motion-transition-default) var(--europa-motion-easing), transform var(--europa-motion-transition-default) var(--europa-motion-easing)`

Interactive cards (`.europa-lobby__card[role="button"]`, `.europa-lobby__card` inside a clickable container) gain:
- `cursor: pointer`
- `:hover` — `box-shadow: var(--europa-shadows-card-hover); transform: translateY(-2px)`
- `:active` — `box-shadow: var(--europa-shadows-card-active); transform: translateY(0)`

**A11y note**: Transform is subtle (2px translateY) and does not affect layout for screen readers. The hover shadow is not the sole identifier — the card's border and text remain the primary cues.

#### FR-008: Match Row Hover with Accent Border

`.europa-lobby__row` gains:
- `transition: border-color var(--europa-motion-transition-fast) var(--europa-motion-easing)`
- `:hover` — `border-color: var(--europa-color-accent)` (amber accent border replaces neutral border on hover)

This provides a visual cue that the row is interactive without relying on color alone — the row already carries text labels and action buttons.

**State modifiers** (additive, applied via the row's existing status class):
- `.europa-lobby__row--waiting` — `border-left: 3px solid var(--europa-color-success)` (green left-border for waiting/filling matches)
- `.europa-lobby__row--in-progress` — `border-left: 3px solid var(--europa-color-warning)` (amber left-border for in-progress matches)
- `.europa-lobby__row--your-match` — `background-color: var(--europa-color-accent)` (accent background for the player's own match, with `color: var(--europa-color-surface)` for contrast)

These modifiers are additive — the base `.europa-lobby__row` style is unchanged. The left-border treatment mirrors the identity-card accent (FR-027) for visual consistency.

#### FR-009: HUD Depth Shadow

`.europa-hud` gains:
- `box-shadow: var(--europa-shadows-hud)` — subtle elevation to distinguish the HUD panel from the page background.

The HUD was previously flat (no box-shadow). The `hud` shadow token provides a visual anchor for the status panel.

#### FR-010: Button Transitions

`.europa-button` and all variants gain:
- `transition: background-color var(--europa-motion-transition-fast) var(--europa-motion-easing), border-color var(--europa-motion-transition-fast) var(--europa-motion-easing), color var(--europa-motion-transition-fast) var(--europa-motion-easing), box-shadow var(--europa-motion-transition-fast) var(--europa-motion-easing)`

This ensures all button color shifts (hover, active, disabled) animate within 80ms — fast enough to feel responsive but slow enough to be visible.

#### FR-011: Surrender Button Danger Hover

`.europa-hud__surrender` gains:
- `:hover:not(:disabled)` — `background-color: var(--europa-color-error-bg); border-color: var(--europa-color-error); color: var(--europa-color-error-text)`
- `:active:not(:disabled)` — `background-color: var(--europa-color-error-active)`

This provides a danger-color feedback on hover, reinforcing the destructive nature of surrender. The button text and label remain the primary identifier (not color alone).

#### FR-012: Order Bar Active State

`.europa-order-bar__button[aria-pressed="true"]` is refined:
- The existing amber inset-shadow and border-color remain.
- Add: `transition: border-color var(--europa-motion-transition-fast) var(--europa-motion-easing), box-shadow var(--europa-motion-transition-fast) var(--europa-motion-easing)` so the engaged state animates in.

`.europa-order-bar__mode--active` (the mode toggle's active state) gains:
- `background-color: var(--europa-color-accent); color: var(--europa-color-page-bg)` — accent fill with page-bg text for a clear engaged-mode indicator
- `transition: background-color var(--europa-motion-transition-fast) var(--europa-motion-easing), color var(--europa-motion-transition-fast) var(--europa-motion-easing)` — smooth state change

This makes the active mode visually distinct from inactive modes without relying on color alone — the mode label text (FR-033) and `aria-pressed` remain the primary identifiers.

#### FR-013: Feedback Toast Slide-In Animation

`.europa-feedback__item` gains:
- `@keyframes europa-toast-enter` — slides in from `translateX(-8px)` to `translateX(0)` with `opacity: 0` to `opacity: 1`
- `animation: europa-toast-enter var(--europa-motion-transition-slow) var(--europa-motion-easing-out) forwards`
- `@keyframes europa-toast-exit` — slides out to `translateX(-8px)` with `opacity: 1` to `opacity: 0`
- `.europa-feedback__item--exiting` applies the exit animation.

The animation respects `prefers-reduced-motion: reduce` via the existing catalog guard (no additional code needed — the global `animation: none !important` rule applies).

**Variant borders** (additive, applied via the item's existing status class):
- `.europa-feedback__item--success` — `border-left: 3px solid var(--europa-color-success)`
- `.europa-feedback__item--error` — `border-left: 3px solid var(--europa-color-error)`
- `.europa-feedback__item--info` — `border-left: 3px solid var(--europa-color-info)`

These left-border accents reinforce the toast's status without relying on color alone — the toast text and icon remain the primary identifiers.

#### FR-014: Modal Backdrop Blur and Enter Animation

`.europa-modal-backdrop` gains:
- `backdrop-filter: blur(4px)` — subtle blur effect on the backdrop veil.
- `animation: europa-backdrop-enter var(--europa-motion-transition-slow) var(--europa-motion-easing-out)`
- `@keyframes europa-backdrop-enter` — fades in from `opacity: 0` to `opacity: 1`

`.europa-modal` gains:
- `animation: europa-modal-enter var(--europa-motion-transition-slow) var(--europa-motion-easing-out)`
- `@keyframes europa-modal-enter` — fades in and scales from `0.95` to `1`

Both animations respect `prefers-reduced-motion: reduce`. Fallback: `backdrop-filter` degrades gracefully (browser renders without blur if unsupported).

#### FR-015: Error Boundary Refinement

`.europa-error-boundary` gains:
- `background-color: var(--europa-color-page-bg)` — explicit background (was implicit from body)
- `box-shadow: inset 0 0 0 2px var(--europa-color-error-border)` — subtle error-colored inset ring for visual weight
- `.europa-error-boundary__reload` gains the same transition treatment as `.europa-button`
- `.europa-error-boundary__icon` — `font-size: 4rem; line-height: 1` (large error icon for visual weight)
- `.europa-error-boundary__details` — `font-family: var(--europa-typography-font-mono); font-size: var(--europa-typography-size-xs); color: var(--europa-color-text-muted)` (monospace details block for the error message)

#### FR-016: Route Notice Panel Polish

`.europa-route-notice__panel` gains:
- `box-shadow: var(--europa-shadows-plate)` — elevation consistent with other plates
- `transition: box-shadow var(--europa-motion-transition-default) var(--europa-motion-easing)` — smooth shadow appear
- `.europa-route-notice__icon` — `font-size: 3rem; line-height: 1; color: var(--europa-color-text-muted)` (muted icon for visual weight without competing with the message text)

### Phase 3 — New Design System Components

All new classes are added to `packages/design/src/styles/catalog.css` and documented in `DESIGN.md` § 2.

#### FR-017: `.europa-link` Component

A styled `<a>` element with design-system tokens. Not a web component — it is a CSS-only class applied to standard `<a>` elements.

**Structure**: `<a class="europa-link" href="...">text</a>`

**States**:
- Default: `color: var(--europa-color-text-link); text-decoration: none; border-bottom: 1px solid transparent; transition: color var(--europa-motion-transition-fast) var(--europa-motion-easing), border-color var(--europa-motion-transition-fast) var(--europa-motion-easing)`
- `:hover` — `color: var(--europa-color-text-link); border-bottom-color: var(--europa-color-text-link)` (underline appears on hover)
- `:visited` — `color: var(--europa-color-text-muted)` (muted after visit, still ≥ AA)
- `:focus-visible` — shared focus ring from `var(--europa-focus-ring-*)` tokens

**A11y**: The link is not color-alone — the hover underline provides a non-color state cue. Contrast: `text-link` (#f59e0b) on `surface` (#111827) ≈ 8.26:1 (AA 1.4.3 normal ≥ 4.5:1: meets). Muted visited state ≈ 6.99:1 (meets).

#### FR-018: `.europa-divider` Component

A semantic `<hr>` element styled as a horizontal separator. Variants for status context.

**Structure**: `<hr class="europa-divider">`

**Variants**:
- Default: `border: none; border-top: var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-divider); margin: var(--europa-spacing-lg) 0`
- `.europa-divider--success` — `border-top-color: var(--europa-color-success-border)`
- `.europa-divider--error` — `border-top-color: var(--europa-color-error-border)`
- `.europa-divider--warning` — `border-top-color: var(--europa-color-warning-border)`

**A11y**: The divider is decorative (not conveying information); it uses `border-top` only, no `role` needed. Variants are redundantly encoded by surrounding content context.

#### FR-019: `.europa-tooltip` Component

A CSS-only tooltip using the `data-tooltip` attribute. No JavaScript required.

**Structure**: `<span class="europa-tooltip" data-tooltip="Help text">Hover me</span>`

**Behavior**:
- `position: relative` on the host
- `::after` pseudo-element: `content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); opacity: 0; pointer-events: none; transition: opacity var(--europa-motion-transition-fast) var(--europa-motion-easing)`
- `:hover::after` — `opacity: 1`
- Tooltip plate: `background-color: var(--europa-color-surface); color: var(--europa-color-text-primary); padding: var(--europa-spacing-xs) var(--europa-spacing-sm); border-radius: var(--europa-radii-sm); font-size: var(--europa-typography-size-xs); white-space: nowrap; box-shadow: var(--europa-shadows-plate); z-index: 100`
- Arrow: `::before` pseudo-element creates a CSS triangle pointing down (matching tooltip plate)

**A11y**: The tooltip is supplementary — it provides the same information as the visible label text. It does not replace an `aria-label`. The `data-tooltip` attribute is not announced by screen readers (purely visual). Focus via keyboard does not trigger the tooltip (it is hover-only); this is acceptable because the tooltip content is redundant with the visible text.

#### FR-020: `.europa-badge` Component (Status Indicator)

The existing `.europa-badge` in the catalog is a simple text pill (used for lobby row badges). This FR adds status-indicator variants to the same selector, making it a multi-purpose badge.

**Existing behavior preserved**: The base `.europa-badge` style is unchanged (surface background, text-muted color, pill border). Additive variants:

- `.europa-badge--success` — `background-color: var(--europa-color-success-bg); color: var(--europa-color-success); border-color: var(--europa-color-success-border)`
- `.europa-badge--warning` — `background-color: var(--europa-color-warning-bg); color: var(--europa-color-warning); border-color: var(--europa-color-warning-border)`
- `.europa-badge--error` — `background-color: var(--europa-color-error-bg); color: var(--europa-color-error); border-color: var(--europa-color-error-border)`
- `.europa-badge--info` — `background-color: var(--europa-color-info-bg); color: var(--europa-color-info); border-color: var(--europa-color-info-border)`
- `.europa-badge--accent` — `background-color: var(--europa-color-chip-bg); color: var(--europa-color-accent); border-color: var(--europa-color-accent)`

**A11y**: Each variant carries a text label (not color alone). Contrast: success-text on success-bg ≈ 4.71:1 (AA); warning-text on warning-bg ≈ 8.32:1; error-text on error-bg ≈ 5.28:1; info-text on info-bg ≈ 7.76:1; accent on chip-bg ≈ 8.26:1 — all meet AA 1.4.3 normal (≥ 4.5:1).

#### FR-021: `.europa-empty-state` Component

A centered placeholder for empty content areas.

**Structure**: `<div class="europa-empty-state"><span class="europa-empty-state__icon">📋</span><p class="europa-empty-state__title">No matches</p><p class="europa-empty-state__message">Create a match to get started.</p></div>`

**Styles**:
- `.europa-empty-state` — `display: flex; flex-direction: column; align-items: center; gap: var(--europa-spacing-md); padding: var(--europa-spacing-xl); text-align: center; color: var(--europa-color-text-muted)`
- `.europa-empty-state__icon` — `font-size: 2rem; line-height: 1` (emoji or icon placeholder)
- `.europa-empty-state__title` — `margin: 0; font-size: var(--europa-typography-size-lg); color: var(--europa-color-text-secondary); font-weight: 600`
- `.europa-empty-state__message` — `margin: 0; font-size: var(--europa-typography-size-sm); max-width: 24rem`

**A11y**: The empty state is informational, not interactive. Title and message are readable text. The icon uses an emoji (supplementary) or can be replaced with an SVG with `aria-hidden="true"`.

### Phase 4 — Responsive Breakpoints

#### FR-022: Lobby Grid Responsive Breakpoints

`.europa-lobby__grid` gains media-query breakpoints:
- `@media (max-width: 768px)` — `grid-template-columns: 1fr` (single column)
- `@media (min-width: 769px) and (max-width: 1199px)` — `grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr))` (current behavior, explicit)
- `@media (min-width: 1200px)` — `grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr))` (unchanged, but explicitly documented)

**Note**: The `480px` breakpoint adds `padding: var(--europa-spacing-sm)` to `.europa-lobby` for tighter padding on small screens.

#### FR-023: Match View Stacking on Small Screens

`.europa-board-layout` (the flex-wrap container holding board + HUD) gains:
- `@media (max-width: 768px)` — `flex-direction: column; align-items: stretch` (board on top, HUD below, full width)

The board area and HUD become full-width stacked on narrow screens.

#### FR-024: HUD Horizontal Layout on Wide Screens

`.europa-hud` gains:
- `@media (min-width: 1200px)` — `flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: var(--europa-spacing-md)` — HUD sections display horizontally when there is enough room, wrapping as needed.

On screens < 1200px, the HUD remains a vertical column (current behavior).

#### FR-025: Modal Responsive Width

`.europa-modal` and `.europa-modal__dialog` gain:
- `@media (max-width: 480px)` — `max-width: calc(100vw - 2rem)` — modal fills most of the viewport on narrow screens with minimal margin.

The current `max-width: 24rem` is unchanged for wider screens.

### Phase 5 — Page-Specific Layouts

#### FR-026: Lobby Landing Hero Lockup

`.europa-lobby` gains a hero section treatment:
- `.europa-lobby__hero` — new class for the top section containing the logo and title: `text-align: center; padding: var(--europa-spacing-xl) 0`
- `.europa-lobby__logo` already exists; it gains `max-width: 20rem` on viewports ≥ 768px (scale constraint for the lockup)

#### FR-027: Identity Card Accent Treatment

`.europa-lobby__card` (the identity card specifically) gains:
- A left-border accent: `border-left: 3px solid var(--europa-color-accent)` — applied via `.europa-lobby__card--identity` modifier (additive)

This visually distinguishes the identity card from other lobby cards without changing the identity card's structure.

#### FR-028: Match List Visual Hierarchy

`.europa-lobby__row` gains:
- `font-size: var(--europa-typography-size-sm)` (unchanged, already present)
- The match ID (`.europa-lobby__row-id`) gains `letter-spacing: var(--europa-typography-tracking-tight)` for tighter monospaced text
- `.europa-lobby__row-meta` gains `letter-spacing: var(--europa-typography-tracking-normal)` (explicit reset)
- `.europa-lobby__row-badge` gains `letter-spacing: var(--europa-typography-tracking-wide)` for badge emphasis

#### FR-029: Empty State Usage

The lobby's existing `.europa-lobby__empty` is refactored to use the new `.europa-empty-state` component class (FR-021). The `.europa-lobby__empty` class is preserved as a thin wrapper that applies the empty-state layout within the lobby context.

#### FR-030: Create Form Polish

`.europa-lobby__form` gains:
- `.europa-lobby__input` transition: `transition: border-color var(--europa-motion-transition-fast) var(--europa-motion-easing), box-shadow var(--europa-motion-transition-fast) var(--europa-motion-easing)`
- `.europa-lobby__input:focus` — `border-color: var(--europa-color-accent); box-shadow: 0 0 0 1px var(--europa-color-accent)` — accent border on focus (reinforces the focus ring with a color cue)

#### FR-031: Board Area Depth

`.europa-board-area` gains:
- `box-shadow: var(--europa-shadows-board)` — the inset shadow from FR-001 creates a recessed-board feel

#### FR-032: HUD Information Hierarchy

`.europa-hud__section` gains:
- `border-top: var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-divider)` — visual separator between HUD sections
- `padding-top: var(--europa-spacing-xs)` — breathing room above the separator

`.europa-hud__title` gains:
- `letter-spacing: var(--europa-typography-tracking-tight)` — tighter heading

#### FR-033: Order Bar Mode Clarity

`.europa-order-bar__mode` gains:
- `text-transform: uppercase; letter-spacing: var(--europa-typography-tracking-wide); font-size: var(--europa-typography-size-xs)` — mode label becomes a small caps indicator for clearer mode distinction

#### FR-034: Reserves Panel Compact Layout

`.europa-reserves` gains:
- The digits grid (`.europa-reserves__digits`) remains `grid-template-columns: repeat(5, 1fr)`
- `.europa-reserves__digit` gains `transition: border-color var(--europa-motion-transition-fast) var(--europa-motion-easing), background-color var(--europa-motion-transition-fast) var(--europa-motion-easing)` — smooth selection feedback

#### FR-035: Feedback Toast Positioning

`.europa-feedback` gains:
- `position: fixed; bottom: var(--europa-spacing-lg); left: var(--europa-spacing-lg); z-index: 800` — toasts are anchored to the bottom-left corner, above the board but below the banner/modal z-indexes
- `.europa-feedback__list` remains the column flex container

#### FR-036: Waiting Overlay Blur

`.europa-waiting` gains:
- `backdrop-filter: blur(2px)` — subtle blur behind the waiting overlay (consistent with modal backdrop blur in FR-014)
- Degrades gracefully if `backdrop-filter` is unsupported

#### FR-037: Surrender Modal Danger Emphasis

`.europa-modal__button--danger` (already exists) gains:
- `background-color: var(--europa-color-error); color: var(--europa-color-surface); border-color: var(--europa-color-error)` — filled danger button (was border-only)
- `:hover` — `background-color: var(--europa-color-error-hover)`
- `:active` — `background-color: var(--europa-color-error-active)`
- `transition: background-color var(--europa-motion-transition-fast) var(--europa-motion-easing)`

#### FR-038: Branded Footer CSS Classes

`.europa-footer` — new catalog class for the branded footer area:
- `padding: var(--europa-spacing-md) var(--europa-spacing-lg); border-top: var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-divider); color: var(--europa-color-text-muted); font-size: var(--europa-typography-size-xs); text-align: center`

`.europa-footer__links` — flex row of footer links:
- `display: flex; justify-content: center; gap: var(--europa-spacing-md); flex-wrap: wrap`

#### FR-039: Global Layout Patterns

New catalog utility classes for common layout patterns:
- `.europa-layout-centered` — `display: flex; flex-direction: column; align-items: center; max-width: 40rem; margin: 0 auto; padding: var(--europa-spacing-lg)`
- `.europa-layout-sidebar` — `display: flex; gap: var(--europa-spacing-lg); align-items: start` (board + sidebar composition)
- `.europa-layout-card-grid` — `display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: var(--europa-spacing-lg); align-items: start`

These are layout-only utility classes; they carry no color or typography declarations.

#### FR-040: Typography Scale Refinements

Existing `.europa-typography--heading` gains:
- `letter-spacing: var(--europa-typography-tracking-tight)` — tighter heading
- Line-height documented as `var(--europa-typography-line-height-normal)` (1.2) — no value change, documentation only

Existing `.europa-typography--muted` gains:
- `line-height: var(--europa-typography-line-height-relaxed)` (already present, explicitly documented)

Existing `.europa-typography--meta` gains:
- `letter-spacing: var(--europa-typography-tracking-wide)` — wider tracking for meta text

#### FR-040a: Typography Utility Classes

New catalog utility classes for common typography patterns, composing only `--europa-*` tokens:

| Class | Font-size | Font-weight | Color | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| `.europa-heading-1` | `var(--europa-typography-size3xl)` | `700` | `var(--europa-color-text-primary)` | `var(--europa-typography-line-height-normal)` | `var(--europa-typography-tracking-tight)` |
| `.europa-heading-2` | `var(--europa-typography-size2xl)` | `700` | `var(--europa-color-text-primary)` | `var(--europa-typography-line-height-normal)` | `var(--europa-typography-tracking-tight)` |
| `.europa-heading-3` | `var(--europa-typography-size-xl)` | `700` | `var(--europa-color-text-primary)` | `var(--europa-typography-line-height-normal)` | `var(--europa-typography-tracking-tight)` |
| `.europa-subheading` | `var(--europa-typography-size-lg)` | `600` | `var(--europa-color-text-secondary)` | `var(--europa-typography-line-height-normal)` | `var(--europa-typography-tracking-normal)` |
| `.europa-body` | `var(--europa-typography-size-base)` | `400` | `var(--europa-color-text-secondary)` | `var(--europa-typography-line-height-relaxed)` | `var(--europa-typography-tracking-normal)` |
| `.europa-body-sm` | `var(--europa-typography-size-sm)` | `400` | `var(--europa-color-text-secondary)` | `var(--europa-typography-line-height-relaxed)` | `var(--europa-typography-tracking-normal)` |
| `.europa-caption` | `var(--europa-typography-size-xs)` | `400` | `var(--europa-color-text-muted)` | `var(--europa-typography-line-height-normal)` | `var(--europa-typography-tracking-wide)` |

These are layout-agnostic utility classes — they carry only typography declarations (no color beyond the text color, no spacing, no display). They complement the existing `.europa-typography--*` semantic classes and are documented in DESIGN.md § 2.

#### FR-041: Interactive State Patterns

Documented in DESIGN.md § 2 as recommended patterns (not new catalog classes):
- **Hover-lift**: card translateY(-2px) + shadow elevation (FR-007)
- **Hover-glow**: accent border appears (FR-008)
- **Active-press**: translateY(0) + reduced shadow (FR-007)
- **Focus-ring**: shared focus ring via `var(--europa-focus-ring-*)` tokens (existing, unchanged)
- **Focus-glow**: accent border + subtle box-shadow on input focus (FR-030)

These patterns are the recommended approach for interactive elements; they are not mandatory but are the documented standard.

### Phase 6 — Design System Preview Page

#### FR-042: Standalone Design System Preview Page

A self-contained HTML page (or React route) that serves as the visual documentation for the design system. The page is built from the design package's CSS and tokens — it is not a separate application.

**Structure**: The page is organized into sections matching the mockup reference:

1. **Sticky Navigation** — links to Colors, Typography, Components, Accessibility, Tokens sections
2. **Hero Section** — logo, stats (20+ components, 18+ color tokens, 100% AA compliance)
3. **Color Swatches** — organized by category (Surfaces, Text, Semantic) with contrast ratios displayed
4. **Typography Scale** — visual display of each size token with sample text
5. **Design Tokens** — spacing, radii, shadows (marked "New"), motion (marked "New"), focus ring
6. **Component Catalog** — live examples of each catalog class (buttons, cards, chips/badges, link+divider+tooltip+empty-state [marked "New"], banner, form inputs)
7. **Accessibility Contrast Pairings** — table of measured contrast ratios
8. **Layout Patterns** — examples of layout utility classes
9. **Footer** — version, links to source

**Implementation**: The page uses only `@europa/design` tokens and classes. It is served from the design package (e.g., `packages/design/preview/index.html`) or as a console route. The page uses `europa-*` token naming throughout — no hex literals.

**Content source**: Color values and contrast ratios are read from the token table at build time (or hardcoded with the same values as `DESIGN.md`). The page is a visual companion to `DESIGN.md`, not a replacement.

### Phase 7 — Documentation & DX

#### FR-043: DESIGN.md Token Table Updates

DESIGN.md § 1.1 gains rows for all new color tokens (`textLink`, `accentActive`, `divider`, `cardHoverBorder`). § 1.2 gains rows for `heading`, `subheading`, `trackingTight`, `trackingNormal`, `trackingWide`. § 1.6 gains rows for `cardHover`, `cardActive`, `hud` (updated from `none`). § 1.7 gains rows for `darkColor`, `lightColor`. § 1.8 gains rows for all new motion tokens.

Every new row includes the CSS variable, TS constant, canonical value, and pairing/accessibility notes.

#### FR-044: DESIGN.md § 2 Catalog Updates

DESIGN.md § 2 gains entries for all new catalog classes: `.europa-link`, `.europa-divider`, `.europa-divider--success/error/warning`, `.europa-tooltip`, `.europa-badge--success/warning/error/info/accent`, `.europa-empty-state`, `.europa-footer`, `.europa-footer__links`, `.europa-layout-centered/sidebar/card-grid`, plus the typography utility classes (FR-040a).

Each entry includes: selector, variants, required DOM structure, intended use, and a11y obligations.

**§ 2 table split**: The existing single § 2 catalog table is split into two sub-tables:
- **Component Identity** — selector, variants, required DOM structure, intended use
- **Accessibility Obligations** — a11y obligations per component (roles, labels, focus, contrast, non-color cues)

This split separates the "what it is" from the "how it must behave accessibly", making the a11y contract independently auditable.

**HTML usage snippets**: Each § 2 catalog entry includes a short HTML usage snippet showing the required DOM structure (e.g., `<a class="europa-link" href="...">text</a>` for `.europa-link`). Snippets are illustrative, not exhaustive — they show the canonical usage pattern.

#### FR-045: DESIGN.md § 3 Accessibility Table Updates

DESIGN.md § 3 gains rows for new pairings:
- `textLink` on `surface` ≈ 8.26:1 (AA 1.4.3 normal ≥ 4.5:1: meets)
- Badge status variants (success/warning/error/info/accent on their respective backgrounds)
- Focus ring `darkColor` on `page-bg` (future light-theme proof)

**Machine-readable contrast notes**: In addition to the human-readable § 3 table, the new pairings are emitted as a machine-readable JSON/YAML file (e.g., `packages/design/dist/contrast-notes.json` or a tracked `contrast-notes.yaml`) that lists each pairing with `foreground`, `background`, `ratio`, and `target` fields. This file is consumed by drift tests and documentation generators to assert the documented ratios match the canonical token values (no manual re-measurement drift).

#### FR-046: CSS Variable Comments

The `:root` block in `dist/design.css` gains inline comments for distinguishing `void-bg` from `page-bg`:
```css
/* page-bg: the outermost page background (lobby, manual pages) */
--europa-color-page-bg: #0b0f19;
/* void-bg: the board/canvas recessed background (distinct from page-bg) */
--europa-color-void-bg: #1a2233;
```

These comments are added by the emitter (`build-css.ts`) only for the two background tokens, documenting the distinction that is otherwise a source of confusion.

#### FR-047: Line-Height Documentation Per Component

DESIGN.md § 2 table entries for each component include the `line-height` value used, making the typography contract explicit. This is a documentation-only change (no value modifications).

## Non-Functional Requirements

- **Performance**: All new CSS transitions and animations must complete within their specified durations (fast ≤ 80ms, default ≤ 120ms, slow ≤ 200ms, spring ≤ 300ms). No JavaScript animation loops. `backdrop-filter` is GPU-composited and must not cause layout thrashing.
- **Bundle Size**: New CSS additions must not exceed 5 KB uncompressed (≈ 1.5 KB gzipped) to the combined `dist/design.css` and `packages/console/src/styles/index.css`. The console browser-payload gzip budget remains < 150 KB (DESIGN.md G-08).
- **Compatibility**: All new CSS features (`backdrop-filter`, CSS `@keyframes`, CSS `calc()`) degrade gracefully in browsers that do not support them (graceful degradation — no visual breakage). Shadow tokens use `rgba()` which is universally supported.
- **Accessibility**: All new interactive states meet WCAG 2.2 AA. Hover states are not the sole identifier for any component (constitution Principle VI). `prefers-reduced-motion: reduce` suppresses all new animations (existing catalog guard applies). Focus indicators remain visible on all interactive elements.
- **Determinism**: Token values are deterministic and constant. No runtime computation affects shadow/transition/motion values. The `build-css.ts` emitter remains byte-identical for the same token table (no timestamps, no randomness).
- **No Backend Changes**: This feature is purely CSS/token/TSX in the design and console packages. No server-side changes, no WebSocket protocol changes, no engine changes.

## Acceptance Criteria

### Phase 1 — Foundation Tokens

- [ ] **AC-001**: `packages/design/src/tokens.ts` exports all new shadow tokens (`cardHover`, `cardActive`, `hud`) and updated values for `board`, `modal`, `plate` — none remain `none`.
- [ ] **AC-002**: `packages/design/src/tokens.ts` exports all new motion tokens (`duration`, `transitionFast`, `transitionDefault`, `transitionSlow`, `transitionSpring`, `easingOut`, `easingInOut`).
- [ ] **AC-003**: `packages/design/src/tokens.ts` exports all new color tokens (`textLink`, `accentActive`, `divider`, `cardHoverBorder`).
- [ ] **AC-004**: `packages/design/src/tokens.ts` exports all new typography tokens (`heading`, `subheading`, `trackingTight`, `trackingNormal`, `trackingWide`).
- [ ] **AC-005**: `packages/design/src/tokens.ts` exports new focus ring tokens (`darkColor`, `lightColor`).
- [ ] **AC-006**: `pnpm --filter @europa/design build` produces byte-identical `dist/design.css` on repeated runs.
- [ ] **AC-007**: `dist/design.css` contains all new `--europa-*` CSS variables in the `:root` block.
- [ ] **AC-008**: `pnpm --filter @europa/design build --emit-json` (or equivalent) produces `dist/tokens.json` with all token entries.

### Phase 2 — Console CSS Polish

- [ ] **AC-009**: `.europa-lobby__card` has a non-`none` `box-shadow` at rest and a different `box-shadow` on `:hover`.
- [ ] **AC-010**: `.europa-lobby__row` changes `border-color` to the accent color on `:hover`.
- [ ] **AC-010a**: `.europa-lobby__row--waiting` has a green left-border, `--in-progress` has an amber left-border, and `--your-match` has an accent background.
- [ ] **AC-011**: `.europa-hud` has `box-shadow` matching the `hud` shadow token.
- [ ] **AC-012**: `.europa-button` transitions `background-color` within 80ms on hover (verified via computed style in test).
- [ ] **AC-013**: `.europa-hud__surrender` shows error colors on `:hover:not(:disabled)`.
- [ ] **AC-014**: `.europa-feedback__item` slides in from the left on mount (animation is visible without `prefers-reduced-motion`).
- [ ] **AC-014a**: `.europa-feedback__item--success/error/info` each have the respective semantic left-border color.
- [ ] **AC-015**: `.europa-modal-backdrop` has `backdrop-filter: blur(4px)` and fades in.
- [ ] **AC-016**: `.europa-modal` scales from 0.95 to 1 on enter.
- [ ] **AC-016a**: `.europa-order-bar__mode--active` has an accent background with page-bg text.
- [ ] **AC-017**: Under `prefers-reduced-motion: reduce`, no animation or transition runs for more than 0.01ms (verified via test).
- [ ] **AC-017a**: `.europa-error-boundary__icon` renders at 4rem and `.europa-error-boundary__details` uses the monospace font stack.
- [ ] **AC-017b**: `.europa-route-notice__icon` renders at 3rem in muted color.

### Phase 3 — New Design System Components

- [ ] **AC-018**: `.europa-link` renders with accent color, underline-on-hover, focus ring, and visited state. No hex/rgb literals.
- [ ] **AC-019**: `.europa-divider` renders as a horizontal line. Variants `--success`, `--error`, `--warning` use the respective semantic border colors.
- [ ] **AC-020**: `.europa-tooltip` shows the `data-tooltip` content on hover with a plate background and arrow. No JavaScript.
- [ ] **AC-021**: `.europa-badge--success/warning/error/info/accent` each render with their respective semantic background and text colors. All meet AA contrast.
- [ ] **AC-022**: `.europa-empty-state` renders centered with icon, title, and message in muted/secondary colors.
- [ ] **AC-023**: All new classes are in `catalog.css` and documented in DESIGN.md § 2.
- [ ] **AC-023a**: `.europa-heading-1/2/3`, `.europa-subheading`, `.europa-body`, `.europa-body-sm`, and `.europa-caption` render with the typography tokens from FR-040a.

### Phase 4 — Responsive

- [ ] **AC-024**: At 480px width, `.europa-lobby__grid` renders a single column.
- [ ] **AC-025**: At 768px width, `.europa-lobby__grid` renders two columns.
- [ ] **AC-026**: At 1200px+ width, `.europa-hud` renders horizontally (flex-direction: row).
- [ ] **AC-027**: At 480px width, `.europa-modal` fills the viewport width minus 2rem margin.
- [ ] **AC-028**: At 768px width, `.europa-board-layout` stacks board and HUD vertically.

### Phase 5 — Page-Specific Layouts

- [ ] **AC-029**: `.europa-lobby__hero` centers the logo and title with extra vertical padding.
- [ ] **AC-030**: `.europa-lobby__card--identity` has a 3px left accent border.
- [ ] **AC-031**: Match row badge uses `tracking-wide` letter-spacing.
- [ ] **AC-032**: `.europa-lobby__input` shows accent border on `:focus`.
- [ ] **AC-033**: `.europa-board-area` has the `board` inset shadow.
- [ ] **AC-034**: `.europa-hud__section` has a top border separator.
- [ ] **AC-035**: `.europa-order-bar__mode` renders as uppercase with wide tracking.
- [ ] **AC-036**: `.europa-reserves__digit` transitions border-color on selection.
- [ ] **AC-037**: `.europa-feedback` is fixed-positioned at bottom-left.
- [ ] **AC-038**: `.europa-waiting` has `backdrop-filter: blur(2px)`.
- [ ] **AC-039**: `.europa-modal__button--danger` fills with error colors on hover.
- [ ] **AC-040**: `.europa-footer` renders with a top divider and centered muted text.

### Phase 6 — Preview Page

- [ ] **AC-041**: The design system preview page loads and displays all sections (hero, colors, typography, tokens, components, accessibility, layouts).
- [ ] **AC-042**: The preview page uses only `europa-*` token variables (no hex/rgb literals in its own CSS).
- [ ] **AC-043**: The preview page renders correctly at both desktop (1200px+) and mobile (375px) widths.

### Phase 7 — Documentation & DX

- [ ] **AC-044**: DESIGN.md § 1 contains rows for all new tokens added by this feature.
- [ ] **AC-045**: DESIGN.md § 2 contains entries for all new catalog classes.
- [ ] **AC-045a**: DESIGN.md § 2 is split into "Component Identity" and "Accessibility Obligations" sub-tables, and each entry includes an HTML usage snippet.
- [ ] **AC-045b**: A machine-readable contrast-notes file (JSON/YAML) lists the new pairings with foreground, background, ratio, and target fields.
- [ ] **AC-046**: DESIGN.md § 3 contains contrast pairings for new color tokens.
- [ ] **AC-047**: `dist/design.css` contains comments distinguishing `void-bg` from `page-bg`.
- [ ] **AC-048**: DESIGN.md § 2 entries include `line-height` values for each component.

## Out of Scope

The following are explicitly **not** part of this feature:

- **Light theme / dark mode toggle**: Token *names* are extended (FR-005) but no light-theme *values* ship. The dark-slate theme remains the only shipped theme (spec 012 § 6).
- **New web components**: All new additions are CSS-only classes, not `customElements.define` registrations. Web components are additive and belong in a follow-up.
- **Animation choreography**: Complex sequenced animations (staggered card reveals, page transitions) are out of scope. Only simple enter/exit animations are included.
- **Performance metrics dashboard**: The design preview page is documentation, not an analytics tool.
- **Dark-theme contrast re-measurement**: New tokens are designed for the existing dark palette. No new computed-style contrast measurements beyond the documented pairings.
- **Canvas rendering changes**: The board/canvas rendering (palette.ts, Canvas painter) is untouched. Shadow tokens for the board area are CSS-only (inset shadow on the container).
- **Backend/API changes**: Zero server-side work. No WebSocket protocol changes. No engine modifications.
- **Package version bump**: This feature does not bump `APP_VERSION` or `package.json#version`. Version bump is a separate release concern.

## Edge Cases

- **`backdrop-filter` unsupported**: Older browsers (e.g., Firefox < 103 without flag) ignore the property. The modal/waiting overlay still renders with the `overlay-strong` or `overlay-soft` background — no visual breakage, just no blur. The feature degrades gracefully.
- **Shadow on very dark surfaces**: The dark `rgba(0,0,0,...)` shadows are nearly invisible on `page-bg` (#0b0f19). This is intentional — shadows on the darkest background are subtle. The most impactful shadows are on `surface` (#111827) and `surface-raised` (#1f2937) where the contrast is higher.
- **Tooltip overflow on edge of viewport**: The tooltip's `position: absolute` may clip at viewport edges. This is acceptable for a CSS-only tooltip — no JavaScript repositioning. A future enhancement could add a `data-tooltip-position` attribute for edge cases.
- **`prefers-reduced-motion` with transitions**: The global catalog guard collapses transition durations to `0.01ms`, which effectively makes all transitions instant. This is the correct behavior per WCAG 2.3.3.
- **Concurrent animations**: Multiple elements may animate simultaneously (toast + modal enter). These are independent CSS animations on separate elements with no shared timing dependencies. The GPU compositor handles them without layout thrashing.
- **Token backward compatibility**: All new tokens are additive. Existing consumers that do not reference the new tokens see no change. Existing shadow tokens change from `none` to real values — consumers using `var(--europa-shadows-plate)` on an element that previously had no shadow will now see one. This is the intended behavior and matches the spec 012 design (named tokens that were `none` were always intended to receive values later).

## Examples

### Card Hover Lift

```
Before (hover):                    After (hover):
┌──────────────────┐               ┌──────────────────┐ ← translateY(-2px)
│  Lobby Card       │               │  Lobby Card       │
│  border: #374151  │               │  border: #f59e0b  │ ← accent border
│  shadow: plate    │               │  shadow: cardHover│ ← elevated shadow
└──────────────────┘               └──────────────────┘
```

### Tooltip on Hover

```
            ┌───────────────┐
            │  Help text    │ ← data-tooltip content
            └──────┬────────┘
                   ▼ (triangle arrow)
         ┌──────────────────┐
         │   Hover me       │
         └──────────────────┘
```

### Responsive Lobby Grid

```
Desktop (≥768px):               Mobile (<768px):
┌─────────┬─────────┐           ┌─────────────────┐
│  Card 1 │  Card 2 │           │     Card 1      │
├─────────┴─────────┤           ├─────────────────┤
│    Match List     │           │     Card 2      │
│    (wide)         │           ├─────────────────┤
└───────────────────┘           │   Match List    │
                                │   (wide)        │
                                └─────────────────┘
```

### New Badge Variants

```
[Running]   ← .europa-badge--success (green bg, green text)
[Warning]   ← .europa-badge--warning (amber bg, amber text)
[Error]     ← .europa-badge--error (red bg, red text)
[Info]      ← .europa-badge--info (blue bg, blue text)
[Featured]  ← .europa-badge--accent (chip bg, accent text)
```

## Open Questions

None. All requirements are fully specified.

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

### v1.1 — Product-Owner Rulings (2026-09-03)

Fifteen product-owner rulings were incorporated into this spec, correcting discrepancies and adding gaps identified during review. Each ruling is documented below with the FR/AC it affects.

**Discrepancy corrections:**

- **D1 — Toast animation direction**: The feedback toast slides in from the **LEFT** (`translateX(-8px)`), not from the right. Updated FR-013 (keyframes `europa-toast-enter`/`europa-toast-exit`) and AC-014.
- **D2 — Feedback toast position**: The feedback toast is anchored **bottom-LEFT**, not bottom-right. Updated FR-035 and AC-037.
- **D3 — Easing-out value**: The `easingOut` token uses the refined `cubic-bezier(0.16, 1, 0.3, 1)`, not plain `ease-out`. Updated FR-002 transition-tokens table.
- **D4 — Layout class prefix**: Layout utility classes use the `layout-` prefix (`.europa-layout-centered`, `.europa-layout-sidebar`, `.europa-layout-card-grid`). Confirmed in FR-039 (the spec already used the correct prefix; no change needed).
- **D5 — Link token**: `.europa-link` uses the `--europa-color-text-link` token (not `--europa-color-accent`). Confirmed in FR-017 (the spec already used the correct token; no change needed).

**Gap additions:**

- **G1 — Pre-composed duration token**: Added `--europa-motion-duration: 120ms` (`TOKENS.motion.duration`) to FR-002 transition-tokens table and AC-002.
- **G2 — Match row state modifiers**: Added `.europa-lobby__row--waiting` (green left-border), `--in-progress` (amber left-border), and `--your-match` (accent background) to FR-008 and AC-010a.
- **G3 — Order bar mode active styling**: Added `.europa-order-bar__mode--active` (accent bg + page-bg text) to FR-012 and AC-016a.
- **G4 — Feedback item variant borders**: Added `.europa-feedback__item--success/error/info` left-border variants to FR-013 and AC-014a.
- **G5 — Typography utility classes**: Added new FR-040a with `.europa-heading-1/2/3`, `.europa-subheading`, `.europa-body`, `.europa-body-sm`, `.europa-caption` and AC-023a.
- **G6 — Error boundary icon + details**: Added `.europa-error-boundary__icon` (4rem) and `.europa-error-boundary__details` (monospace) to FR-015 and AC-017a.
- **G7 — Route notice icon**: Added `.europa-route-notice__icon` (3rem muted) to FR-016 and AC-017b.
- **G8 — DESIGN.md § 2 table split**: Split the § 2 catalog table into "Component Identity" + "Accessibility Obligations" sub-tables. Updated FR-044 and AC-045a.
- **G9 — Machine-readable contrast notes**: Added a JSON/YAML contrast-notes file for drift tests. Updated FR-045 and AC-045b.
- **G10 — HTML usage snippets**: Added HTML usage snippets per class in DESIGN.md § 2 catalog table. Updated FR-044 and AC-045a.
