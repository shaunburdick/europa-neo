# Implementation Plan: In-Match Help Overlay (Feature 018)

## 1. Technical Context

### Problem
New players joining a Europa Neo match see a dense board with no way to understand symbols, colors, and controls. The original Europa had a built-in help system; our console has none. An in-match help overlay and contextual tooltips keep players in context while learning.

### Scope
- `?` button in HUD that opens a help overlay modal (using `europa-modal`)
- `?` keyboard shortcut to toggle the overlay
- Contextual tooltips on HUD elements (hover on desktop, tap on mobile)
- Hardcoded content — no dynamic sourcing from manual files
- Lazy-loaded overlay component (no initial bundle impact)

### Constitution Alignment
- **Principle I (Type Safety)**: TypeScript strict mode, no `any`, no suppressions
- **Principle V (Simplicity)**: Minimal new code — reuse `europa-modal`, CSS-only tooltips where possible
- **Principle VI (Accessibility)**: WCAG 2.2 AA — focus trap, `role="dialog"`, `role="tooltip"`, `aria-describedby`, reduced motion
- **Development Workflow**: Spec-driven, feature branch, conventional commits

## 2. Architecture Decisions

### Decision 1: `?` Key Binding — Separate from HotkeyController

**Choice**: Register the `?` key listener in `App.tsx` via a dedicated `useEffect`, NOT inside `HotkeyController`.

**Rationale**: The `HotkeyController` is an order-producing pipeline — its `HotkeyId` union and `InputMapping` contract are for game commands (pipes, paratroops, guns, reserves). Adding `?` to `HotkeyId` would pollute a pure game-action contract with a UI-only concern. The `?` key is also outside `DEFAULT_INPUT_MAPPING` by design. A separate document-level `keydown` listener in `App.tsx` (next to the existing hotkey wiring) is the simplest path:

```typescript
// In App.tsx useEffect:
const handleHelpToggle = (e: KeyboardEvent) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen(prev => !prev);
    }
};
document.addEventListener('keydown', handleHelpToggle);
```

The `shouldIgnoreKeyEvent` guard in `HotkeyController` already suppresses when focus is inside buttons/inputs — our listener should apply the same guard so `?` inside the modal's close button doesn't re-toggle.

### Decision 2: Help Overlay Component — `europa-modal` Wrapper

**Choice**: Create `HelpOverlay.tsx` in `packages/console/src/ui/` as a React component that renders `<europa-modal>` with hardcoded content sections.

**Rationale**: The `europa-modal` web component (Feature 014) already handles `role="dialog"`, `aria-modal="true"`, focus trapping, Escape-to-close, backdrop click, and focus restore. We compose it in React using JSX intrinsic declarations (same pattern as `WaitingOverlay` with `<europa-waiting>`). The overlay receives `open` and `onClose` props; `europa-modal` fires `europa-close` on Escape/backdrop/close-button, which we handle.

**Content layout** (per spec FR-015):
1. Title: "Game Help"
2. Symbol Legend (hardcoded table — FR-004)
3. Keyboard Shortcuts (hardcoded table — FR-005, derived from `DEFAULT_INPUT_MAPPING`)
4. Game Status (reads from `resolvedState` — FR-007)
5. Learn More (link to manual — FR-006)

### Decision 3: Tooltip System — Lightweight React Hook + Wrapper

**Choice**: A `useTooltip` hook + `<Tooltip>` wrapper component, pure CSS positioning, no external library.

**Rationale**: The spec requires tooltips on 8 HUD elements. A wrapper component (`<Tooltip content="..."><target-element /></Tooltip>`) keeps each call site clean. The hook manages:
- Desktop: `mouseenter`/`mouseleave` + `focus`/`blur`
- Mobile: `touchstart` toggle (per FR-013)
- Positioning: CSS `position: absolute` relative to the HUD container; flip above/below based on viewport space
- ARIA: `role="tooltip"` on the tooltip element, `aria-describedby` on the trigger

**Placement in `qol/`**: The tooltip system is a QoL feature like the existing hotkeys, minimap, and zoom controllers. It lives in `packages/console/src/qol/tooltip.tsx`.

### Decision 4: Lazy Loading

**Choice**: Dynamic `import()` for `HelpOverlay` — the overlay component is loaded on first open, not at initial mount.

**Rationale**: Spec NFR requires < 5KB gz added to initial bundle. The overlay content is static text (~2-3KB), but the dynamic import ensures zero cost until first use. The tooltip system is lightweight (< 1KB) and always needed, so it ships eagerly.

Implementation in `App.tsx`:
```typescript
const HelpOverlay = lazy(() => import('../ui/help-overlay').then(m => ({ default: m.HelpOverlay })));
```

### Decision 5: Tooltip Attachment — Wrapper Pattern

**Choice**: Each HUD element that gets a tooltip is wrapped with `<Tooltip content="...">` in `App.tsx`.

**Rationale**: Minimal modification to existing components. The `OrderBar`, `ReservesPanel`, `Minimap`, and surrender button stay untouched — tooltips wrap them at the call site in `App.tsx`. The HUD status/tick spans are wrapped inline. This avoids touching 8+ component files and keeps the tooltip concern at the composition root.

For elements deep in child components (like the order bar's "Exclusive pipes" and "Clear pipes" buttons), we pass the tooltip content as props to `OrderBar` and render them inside, OR we wrap the entire `OrderBar` with a tooltip on its container (simpler — one tooltip for the whole bar, or use data-attributes on inner elements).

**Refined approach**: Use a lightweight `<EuropaTooltip>` component that wraps its child. For compound elements like `OrderBar`, add optional `tooltip` props on the specific buttons. This keeps the tooltip logic centralized while allowing per-element granularity.

## 3. File Layout

### New Files
| File | Purpose |
|------|---------|
| `packages/console/src/ui/help-overlay.tsx` | Help overlay modal component (lazy-loaded) |
| `packages/console/src/qol/tooltip.tsx` | Tooltip hook + wrapper component |
| `packages/console/src/qol/tooltip.css` | Tooltip styles (animations, positioning, tokens) |
| `packages/console/src/ui/help-overlay.css` | Help overlay content styles (legend table, shortcut list) |
| `packages/console/tests/unit/tooltip.test.ts` | Unit tests for tooltip positioning logic |
| `packages/console/tests/component/ui/help-overlay.test.tsx` | Component tests for help overlay |
| `packages/console/tests/component/ui/tooltip.test.tsx` | Component tests for tooltip behavior |
| `packages/console/tests/a11y/help-overlay.test.ts` | axe-core a11y checks for the overlay |
| `packages/console/tests/e2e/help-overlay.spec.ts` | E2E Playwright test for `?` key + overlay |

### Modified Files
| File | Change |
|------|--------|
| `packages/console/src/render/App.tsx` | Add `?` key listener, help button in HUD, lazy-load overlay, wrap HUD elements with tooltips |
| `packages/console/src/ui/order-bar.tsx` | Add optional `tooltipExclusive` / `tooltipClear` props for per-button tooltips |
| `packages/console/src/ui/reserves-panel.tsx` | Add optional `tooltip` prop for the reserves label |
| `packages/console/src/styles/index.css` | Add `.europa-help-button` styles (minimal — reuse design tokens) |

## 4. Component Architecture

### HelpOverlay

```
HelpOverlay
├── <europa-modal title="Game Help" open={open}>
│   ├── Symbol Legend section (<dl> or <table>)
│   ├── Keyboard Shortcuts section (<table>)
│   ├── Game Status section (reads resolvedState)
│   └── Learn More section (link to manual)
```

**Props**:
```typescript
interface HelpOverlayProps {
    open: boolean;
    onClose: () => void;
    tick: number | null;
    playerName: string;
    playerColor: string;
    matchStatus: string;
    playerCount: number;
}
```

**State**: Stateless — `open` is controlled by `App.tsx`.

### Tooltip

```
<Tooltip content="..." position="above|below">
  <button>?</button>
</Tooltip>
```

**Props**:
```typescript
interface TooltipProps {
    content: string;
    position?: 'above' | 'below' | 'auto';
    children: React.ReactElement;
}
```

**Behavior**:
- Desktop: hover/focus shows, blur/hide hides
- Mobile: tap toggles, tap elsewhere dismisses
- ARIA: `role="tooltip"`, `aria-describedby` on trigger
- Reduced motion: animation suppressed via `prefers-reduced-motion`

## 5. Keyboard Shortcut Integration

The `?` key binding in `App.tsx`:

1. Registered in a `useEffect` alongside the existing `HotkeyController` wiring
2. Guarded by `shouldIgnoreKeyEvent` logic (same check — target in button/input/toolbar)
3. Toggles `helpOpen` state (React `useState`)
4. When overlay is open, `europa-modal`'s own keydown handler captures Escape and Tab — `?` key still reaches our handler and closes (toggle behavior per FR-008)
5. `e.preventDefault()` prevents `?` from scrolling or other browser default

**Conflict check**: `DEFAULT_INPUT_MAPPING` uses i/j/k/l, p/h, g/o, 0-9, Space, Escape, arrows. `?` is not bound. Safe.

## 6. Tooltip Positioning

Pure CSS approach (no library):

1. Tooltip wrapper uses `position: relative` on the trigger element
2. Tooltip element uses `position: absolute` with `bottom: 100%` (above) or `top: 100%` (below)
3. A small `useEffect` checks if the tooltip would overflow the viewport and flips it
4. `max-width: 240px` prevents overly wide tooltips
5. CSS custom properties for all design tokens (background, text, border, shadow, radius, font-size)

## 7. Testing Strategy

### Unit Tests (`tests/unit/tooltip.test.ts`)
- Tooltip positioning logic (above/below/flip)
- `shouldIgnoreKeyEvent` guard applies to `?` listener

### Component Tests (`tests/component/ui/help-overlay.test.tsx`)
- Overlay renders all 5 sections (legend, shortcuts, status, link, title)
- `europa-modal` opens/closes correctly
- Game status displays correct tick, player name, status, player count
- Link opens in new tab with correct href
- Focus management (open → focus in overlay, close → focus restored)

### Component Tests (`tests/component/ui/tooltip.test.tsx`)
- Desktop: mouseenter shows, mouseleave hides
- Focus: focus shows, blur hides
- Mobile: touchstart toggles, second touch hides
- ARIA: `role="tooltip"` present, `aria-describedby` on trigger
- Position flip on viewport edge

### A11y Tests (`tests/a11y/help-overlay.test.ts`)
- axe-core automated checks on the open overlay (zero violations)
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` present
- Focus trap verified (Tab cycles within overlay)

### E2E Tests (`tests/e2e/help-overlay.spec.ts`)
- Press `?` → overlay opens
- Press `?` again → overlay closes
- Press Escape → overlay closes
- Click close button → overlay closes
- Click backdrop → overlay closes
- Match ticks continue while overlay is open
- Tooltips visible on hover
- On 375px viewport, overlay is scrollable

## 8. Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `?` key conflicts with browser find (Ctrl+F shows find bar, bare `?` doesn't) | Bare `?` has no browser default — safe. `e.preventDefault()` for safety. |
| Tooltip positioning breaks on small viewports | CSS flip logic + `max-width: 240px` + viewport edge detection |
| `europa-modal` focus trap conflicts with `?` toggle | `europa-modal` captures Tab/Escape; `?` reaches our document handler (non-conflicting) |
| Lazy-load flash on first open | Show loading skeleton or keep modal hidden until chunk loads |
| Mobile tap-to-dismiss conflicts with board taps | Tooltip dismisses on any tap outside; board taps go through normal flow |
