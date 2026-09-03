# Feature Specification: In-Match Help Overlay

> Version: 1.0
> Last Updated: 2026-09-03
> Status: Implemented (2026-09-03)
> Dependencies: Feature 005 (Client Console), Feature 014 (Shared UI Components), Feature 007 (Player Manual)

## Problem Statement

New players joining a Europa Neo match see a dense board of terrain, pipes, troop counts, and UI controls with no way to understand what the symbols, colors, and interactive elements mean. The original Europa game had a built-in help system; our console has none. Experienced players also lack a quick reference for keyboard shortcuts during play. The only external documentation — the player manual — requires navigating away from the game, losing sight of the match. An in-match help system keeps players in context while learning the interface.

Two complementary approaches address this: (1) a persistent help button that opens a comprehensive overlay, and (2) contextual tooltips on UI elements for discoverability without disruption.

## User Stories

### US1 — Help Button & Overlay (P1)

As a new player in a match, I want to click a `?` button or press `?` on my keyboard to open a help overlay that explains every symbol, color, and control on the screen so that I can learn the game without leaving the match.

**Why this priority**: The most common onboarding failure — staring at an opaque interface with no reference. The overlay is the single highest-impact help surface.

**Independent Test**: Join a match, press `?`, verify the overlay opens with all documented sections; press `?` again or Escape to close; verify the match continues underneath without interruption.

### US2 — Contextual Tooltips (P2)

As a player, I want brief hover/tap explanations on UI elements (HUD items, order bar buttons, reserves panel) so that I can discover their function without reading a full help page.

**Why this priority**: Tooltips complement the overlay by providing just-in-time information during active play. Lower priority because they require interaction to discover.

**Independent Test**: Hover over the "Reserves" label or order bar buttons and verify a tooltip appears within 300ms; on mobile (touch), tap the element and verify the tooltip appears.

### US3 — Keyboard Shortcut for Help (P1)

As a keyboard-oriented player, I want to press `?` to toggle the help overlay open/closed so that I can quickly reference controls without reaching for the mouse.

**Why this priority**: The existing control scheme is keyboard-heavy (i/j/k/l, p/h, g/o, 0-9); a mouse-only help button breaks the flow.

**Independent Test**: Press `?` while in a match — overlay opens; press `?` again — overlay closes; press Escape while overlay is open — overlay closes; press `?` with the overlay open — overlay closes (toggle behavior).

## Functional Requirements

### FR-001 — Help Button in HUD

A `?` button is rendered in the match HUD section. The button is visually distinct from other HUD elements (status, tick, participants, minimap) and positioned in a corner of the HUD area (top-right or bottom-right, consistent across viewports). The button uses `europa-button` with `variant="secondary"` or an equivalent unobtrusive style that does not dominate the HUD.

**Placement**: The `?` button is added inside the existing `<section id="hud">` in `App.tsx`, after the `ParticipantStrip` and before (or adjacent to) the `Minimap`. It sits in the same horizontal strip as other HUD items.

### FR-002 — Keyboard Shortcut `?`

Pressing `?` (Shift+/ on US layout) toggles the help overlay. The binding is registered in the `HotkeyController` pipeline alongside existing game shortcuts. The `?` key is excluded from order processing — it must not conflict with any pipe, paratroop, gun, or reserve command.

**Conflict check**: `?` is not in `DEFAULT_INPUT_MAPPING` (which uses i/j/k/l, p/h, g/o, 0-9, Space, Escape, arrows). Safe to bind.

### FR-003 — Help Overlay Modal

Clicking the `?` button or pressing `?` opens a modal overlay using the `europa-modal` web component (Feature 014). The overlay is non-blocking — the match continues running underneath; the player cannot issue orders while the overlay is open (modal blocks pointer/keyboard interaction with the board).

**Overlay structure**:
- `role="dialog"` with `aria-modal="true"` (enforced by `europa-modal`)
- `aria-labelledby` pointing to the overlay title
- Focus trapped inside the overlay (enforced by `europa-modal`)
- Escape key closes the overlay (enforced by `europa-modal`)
- Close button (×) in the top-right corner of the modal
- Backdrop click closes the overlay (enforced by `europa-modal`)

### FR-004 — Symbol Legend Section

The overlay contains a "Symbol Legend" section documenting all major visual elements. Each entry shows the visual element (rendered inline or as a description) alongside its meaning. The legend covers:

| Category | Elements |
|----------|----------|
| **Pipe Directions** | North/South/East/West pipe indicators, pipe slope colors (green = downhill, amber = flat, red = uphill, gray hollow = stalled) |
| **Troop Counts** | Numeric overlays on cells showing troop strength |
| **City Markers** | City ownership indicators (player color fill) |
| **Fog of War** | Unknown/void areas (black), recently-seen areas, visible areas |
| **Elevation Shading** | Terrain color gradient from low (dark) to high (light) |
| **Reserves** | Reserve percentage indicators on cells |
| **Combat Indicators** | Battle flash effects, capture indicators |
| **Paratroop Paths** | Paratroop targeting overlay (range-2 subcell indicator) |
| **Gun Fire** | Gun targeting overlay |

**Content source**: All legend content is hardcoded in the component (not sourced from manual markdown files). Each entry is a static label + description pair.

### FR-005 — Keyboard Shortcuts Section

The overlay contains a "Keyboard Shortcuts" section listing all game controls. The list is derived from `DEFAULT_INPUT_MAPPING` (Feature 005 contract):

| Action | Keys |
|--------|------|
| Toggle pipe (N/S/E/W) | i / k / l / j |
| Exclusive pipe (N/S/E/W) | Alt+i / Alt+k / Alt+l / Alt+j |
| Clear all pipes | Space |
| Fire paratroop | p (or h) |
| Fire gun | g (or o) |
| Set reserves 0%–90% | 0–9 |
| Cancel / clear selection | Escape |
| Move selection | Arrow keys |
| Open help | ? |

**Content source**: Hardcoded in the component. Matches `DEFAULT_INPUT_MAPPING` at time of implementation.

### FR-006 — Documentation Link

The overlay includes a link to the player manual: `https://shaunburdick.github.io/europa-neo/manual/`. The link opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). The link text reads "Open Player Manual →" or similar.

### FR-007 — Game Status Context

The overlay displays current match context:

- **Current tick number**: read from `resolvedState.latestView.tick` (same source as the HUD tick display)
- **Player color/identity**: read from `resolvedState.session` (the player's seat label and color)
- **Match status**: read from `resolvedState.status` (live, reconnecting, etc.)
- **Players remaining**: derived from `resolvedState.session.opponents.length + 1`

This section is informational only and does not enable any interaction.

### FR-008 — Overlay Toggle Behavior

The `?` key and button follow toggle semantics:

- **Closed → Open**: Pressing `?` or clicking the button opens the overlay, traps focus inside it.
- **Open → Closed**: Pressing `?`, pressing Escape, clicking the close button, or clicking the backdrop closes the overlay and restores focus to the previously focused element.
- **Single instance**: Only one overlay can be open at a time. If already open, pressing `?` closes it (does not re-open or stack).

### FR-009 — Non-Blocking Gameplay

The overlay does not pause the game. Ticks continue arriving; the match state updates underneath. The player cannot issue orders while the overlay is open (the modal captures all pointer and keyboard events). On close, the player resumes control immediately with the current game state.

### FR-010 — Tooltip System

A lightweight tooltip system provides contextual explanations on UI elements:

- **Trigger (desktop)**: `mouseenter` / `focus` shows the tooltip; `mouseleave` / `blur` hides it.
- **Trigger (mobile/touch)**: `touchstart` on the element toggles the tooltip (tap-to-reveal). A second tap on the element or a tap elsewhere dismisses it.
- **Positioning**: Tooltip appears above or below the target element, whichever has more viewport space. Positioned via CSS (no external positioning library).
- **Content**: Each tooltip contains a short text string (≤100 characters). Content is hardcoded per element (not generated from spec text).
- **ARIA**: Tooltip elements use `role="tooltip"` with `aria-describedby` pointing from the trigger element to the tooltip.

### FR-011 — Tooltip Targets

Tooltips are attached to the following UI elements:

| Element | Tooltip Text |
|---------|-------------|
| HUD status label | "Current connection and game status" |
| HUD tick counter | "Current game tick number" |
| Minimap | "Board overview — click to move viewport" |
| Order bar: Exclusive toggle | "Toggle exclusive pipe mode (replaces all pipes in a cell)" |
| Order bar: Clear pipes | "Clear all pipes in selected cell (Space)" |
| Reserves panel | "Set troop reserve percentage for selected cell (0–9 keys)" |
| Surrender button | "Forfeit the current match" |
| `?` help button | "Open help overlay (? key)" |

Elements without tooltips (the participant strip, feedback messages) are excluded because their meaning is self-evident or transient.

### FR-012 — Tooltip Styling

Tooltips use the project's dark-theme design tokens:

- Background: `--europa-color-bg` (or a slightly lighter variant for contrast against the HUD)
- Text: `--europa-color-text`
- Border: subtle 1px border using `--europa-color-border` or equivalent
- Border-radius: matching the project's existing radius tokens
- Font size: smaller than body text (e.g., `--europa-font-size-sm` or equivalent)
- Max-width: 240px to prevent overly wide tooltips on long text
- Box-shadow: subtle shadow for depth (matching `europa-modal` or design system shadow tokens)
- Animation: fade-in/fade-out (respecting `prefers-reduced-motion`)

### FR-013 — Mobile Tooltip Alternative

On viewports < 768px (or touch-primary devices), tooltips use tap-to-reveal instead of hover:

- First tap on a tooltip target shows the tooltip.
- Second tap on the same target hides the tooltip.
- Tap on a different tooltip target hides the previous tooltip and shows the new one.
- Tap on empty space (outside any tooltip target) hides the active tooltip.
- Tooltips are not positioned off-screen; if the target is near a viewport edge, the tooltip repositions to stay visible.

### FR-014 — Accessibility

The overlay and tooltips meet WCAG 2.2 AA:

- **Focus management**: Opening the overlay moves focus to the close button or the first focusable element inside the overlay. Closing restores focus to the `?` button (or whichever element triggered the overlay).
- **Focus trap**: Tab and Shift+Tab cycle within the overlay only (enforced by `europa-modal`).
- **Keyboard navigation**: All overlay content is readable and navigable via keyboard. The overlay is scrollable if content exceeds viewport height (keyboard: arrow keys or Tab to scroll areas).
- **Screen reader**: The overlay announces its title via `aria-labelledby`. The legend entries are structured as a definition list (`<dl>`) or a list with clear heading hierarchy.
- **Contrast**: All text in the overlay and tooltips meets 4.5:1 contrast ratio against its background.
- **Tooltips**: `role="tooltip"` on tooltip elements; `aria-describedby` on trigger elements pointing to the tooltip ID; tooltips are not the only means of conveying information (the overlay provides the comprehensive reference).
- **Reduced motion**: Tooltip animations are suppressed when `prefers-reduced-motion: reduce` is active.

### FR-015 — Overlay Content Layout

The overlay is organized into clearly separated sections with headings:

1. **Title**: "Game Help" (or "How to Play")
2. **Symbol Legend** — the visual element reference table (FR-004)
3. **Keyboard Shortcuts** — the control reference table (FR-005)
4. **Game Status** — current match context (FR-007)
5. **Learn More** — link to the player manual (FR-006)

Each section uses a heading (`<h2>` inside the modal) for screen-reader navigation. The overlay is scrollable when content exceeds the viewport (especially on mobile).

### FR-016 — Overlay Dismissal

The overlay can be dismissed by:

1. Pressing `?` (toggle — FR-008)
2. Pressing Escape (enforced by `europa-modal`)
3. Clicking the close (×) button (enforced by `europa-modal`)
4. Clicking/tapping the backdrop (enforced by `europa-modal`)

All four methods restore focus to the `?` button.

## Non-Functional Requirements

- **Performance**: The overlay component is lazy-loaded (dynamic `import()`) so it does not increase the initial bundle for match views. Tooltip logic is lightweight — no external library, pure CSS + minimal JS event handlers. Tooltip show/hide completes in < 50ms.
- **Bundle Size**: The help overlay adds < 5KB gzipped to the production bundle (static content, no heavy dependencies). The tooltip system adds < 1KB gzipped.
- **Compatibility**: Renders correctly in Chrome 90+, Firefox 90+, Safari 15+, Edge 90+. Tooltip positioning works with `position: absolute` relative to the HUD container (no `position: fixed` viewport calculations needed for HUD-local tooltips).
- **Accessibility**: WCAG 2.2 AA compliance (see FR-014). The overlay passes axe-core automated checks with zero violations.
- **Observability**: No logging or metrics required for the help overlay. It is a UI-only feature with no server interaction.

## Acceptance Criteria

- [ ] **AC-001**: A `?` button is visible in the match HUD area during an active match.
- [ ] **AC-002**: Clicking the `?` button opens the help overlay modal.
- [ ] **AC-003**: Pressing `?` on the keyboard opens the help overlay modal.
- [ ] **AC-004**: With the overlay open, pressing `?` again closes the overlay.
- [ ] **AC-005**: With the overlay open, pressing Escape closes the overlay.
- [ ] **AC-006**: With the overlay open, clicking the close (×) button closes the overlay.
- [ ] **AC-007**: With the overlay open, clicking the backdrop closes the overlay.
- [ ] **AC-008**: The overlay contains a Symbol Legend section covering pipes, troops, cities, fog, elevation, reserves, combat, paratroops, and guns.
- [ ] **AC-009**: The overlay contains a Keyboard Shortcuts section listing all controls from `DEFAULT_INPUT_MAPPING`.
- [ ] **AC-010**: The overlay contains a link to `https://shaunburdick.github.io/europa-neo/manual/` that opens in a new tab.
- [ ] **AC-011**: The overlay displays the current tick number, player identity, match status, and player count.
- [ ] **AC-012**: The overlay has `role="dialog"`, `aria-modal="true"`, and focus is trapped inside.
- [ ] **AC-013**: Focus is restored to the `?` button after the overlay is closed.
- [ ] **AC-014**: The match continues running while the overlay is open (ticks update, but orders cannot be issued).
- [ ] **AC-015**: On a 375px-wide viewport, the overlay is scrollable and all content is readable.
- [ ] **AC-016**: Tooltips appear on hover (desktop) for all FR-011 listed elements.
- [ ] **AC-017**: On touch devices, tooltips toggle on tap (first tap shows, second tap hides).
- [ ] **AC-018**: Tooltips have `role="tooltip"` and trigger elements have `aria-describedby`.
- [ ] **AC-019**: The overlay passes axe-core automated accessibility checks (zero violations).
- [ ] **AC-020**: The `?` key does not interfere with any game command (pipe, paratroop, gun, reserve).
- [ ] **AC-021**: The overlay component is lazy-loaded and does not increase the initial match-view bundle.
- [ ] **AC-022**: Tooltip animations respect `prefers-reduced-motion: reduce`.

## Out of Scope

The following are explicitly **not** part of this feature:

- **First-match tutorial / guided walkthrough**: A step-by-step interactive tutorial for brand-new players. Deferred to a future feature.
- **Contextual help tied to specific game actions**: For example, showing "Press p to fire paratroops" when hovering over a paratroop-capable cell. This is a guided-tutorial concern.
- **Help content sourced from the player manual**: All overlay content is hardcoded; it does not read from `docs/manual/` markdown files.
- **Internationalization / localization**: All text is English. i18n is a future concern.
- **Server-side help state**: No help preferences, no "has seen help" flags, no server interaction.
- **Help overlay for the lobby**: The lobby has its own UI patterns; this feature is match-only.
- **Video or animated help content**: Static text and visual descriptions only.

## Edge Cases

- **Overlay open during disconnect**: If the connection drops while the overlay is open, the reconnecting banner appears behind the overlay. The overlay remains functional (can be closed). On reconnection, the game state resumes normally.
- **Overlay open during game end**: If the match ends (victory/defeat) while the overlay is open, the game-over screen renders behind the overlay. Closing the overlay reveals the game-over state.
- **Overlay open on mobile rotation**: If the device rotates while the overlay is open, the overlay reflows to fit the new viewport dimensions. Content remains scrollable.
- **Rapid `?` key presses**: Toggle behavior prevents stacking. Rapid presses toggle open/closed; only one overlay instance exists.
- **`?` key in text input fields**: The `?` binding is suppressed when focus is inside a text input (e.g., the lobby name field — though this is match-only, the guard prevents accidental overlay opens if the architecture ever shares the binding). The `HotkeyController` already suppresses game shortcuts when focus is in non-game elements.
- **Tooltip on disabled element**: When the Surrender button is disabled (e.g., during reconnect), the tooltip still appears on hover/tap — the tooltip describes the button's purpose, not its current state.
- **Tooltip overflow on small screens**: If a tooltip target is near the viewport edge, the tooltip repositions (flips above/below, or shifts left/right) to stay fully visible. Max-width is enforced; no horizontal scroll.

## Examples

### Help Overlay Layout (Desktop)

```
┌─────────────────────────────────────────────────────┐
│  Game Help                                    [×]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Symbol Legend                                      │
│  ─────────────                                      │
│  ▲ North pipe    Pipe direction: troops flow north  │
│  ▶ East pipe     Pipe direction: troops flow east   │
│  ▼ South pipe    Pipe direction: troops flow south  │
│  ◀ West pipe     Pipe direction: troops flow west   │
│  🟢 Green slope  Downhill (flow accelerates)        │
│  🟡 Amber slope  Flat (normal flow)                 │
│  🔴 Red slope    Uphill (flow decelerates)          │
│  ⚪ Stalled      No flow (too steep)                │
│  [5]             Troop count on cell                │
│  ⬤ City marker  City ownership (player color)      │
│  ░░░ Fog         Unknown area (not in horizon)      │
│  ██  Elevation   Terrain height (dark=low, light=hi)│
│  70%             Reserve percentage                 │
│  ⚡ Combat       Battle/capture in progress         │
│  ··· Paratroop   Targeting path (range 2)           │
│  ─── Gun         Gun fire line                      │
│                                                     │
│  Keyboard Shortcuts                                 │
│  ──────────────────                                 │
│  i / j / k / l     Toggle pipe N / W / S / E       │
│  Alt+i/j/k/l       Exclusive pipe N / W / S / E    │
│  Space             Clear all pipes                  │
│  p (or h)          Fire paratroop                   │
│  g (or o)          Fire gun                         │
│  0–9               Set reserves 0%–90%              │
│  Escape            Cancel selection                 │
│  Arrow keys        Move selection                   │
│  ?                 Toggle this help                 │
│                                                     │
│  Game Status                                        │
│  ────────────                                       │
│  Tick: 42  |  You: Player 1 (Blue)  |  Status: Live│
│  Players: 2                                          │
│                                                     │
│  Learn More                                         │
│  ───────────                                        │
│  📖 Open Player Manual →                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Tooltip Example (Desktop)

```
     ┌──────────────────┐
     │ Status: Live     │ ◄── hover here
     └──────────────────┘
              │
     ┌────────▼───────────────┐
     │ Current connection and │
     │ game status             │
     └────────────────────────┘
```

### Tooltip Example (Mobile — Tap to Reveal)

```
     ┌──────────────────┐
     │ Tick: 42         │ ◄── tap
     └──────────────────┘
              │
     ┌────────▼───────────────┐
     │ Current game tick       │
     │ number                  │
     └────────────────────────┘
     (tap elsewhere to dismiss)
```

## Open Questions

None. All requirements are fully specified based on user clarifications (both Option A and Option B implemented; hardcoded content; `?` keyboard shortcut; mobile tap-to-reveal).

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | Should the help overlay be Option A (button+modal) or Option B (tooltips) or both? | Both — implement the help button+overlay AND contextual tooltips. | FR-001 through FR-016 |
| 2 | Should the help content be sourced from the player manual markdown files or hardcoded? | Hardcoded content in the component. Not driven from manual source files. | FR-004, FR-005 (Content source notes) |
| 3 | Should the `?` keyboard shortcut open the help overlay? | Yes — `?` key toggles the help overlay open/closed. | FR-002, FR-003, FR-008 |
| 4 | How should tooltips behave on mobile (no hover)? | Tap-to-reveal: first tap shows, second tap hides, tap elsewhere dismisses. | FR-010, FR-013 |
| 5 | What is the priority/scope timeline? | High priority, implement now. Both features (overlay + tooltips) in this spec. | All FRs |
