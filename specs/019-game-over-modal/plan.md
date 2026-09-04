# Implementation Plan: Game-Over Results Modal (Feature 019)

## Architectural Overview

The game-over modal is a **console-only, additive UI feature** that surfaces the engine's already-produced `MatchResult` (which the console currently discards). No engine, networking, or matchmaking changes are required. The data flows through three layers:

### Data Flow

```
Wire envelope (terminal)
  → envelope-to-event.ts   [unchanged: already extracts payload.result]
  → reducer terminal case   [stores matchResult in state, builds result-aware announce text]
  → ConsoleState.matchResult (new field)
  → App reads matchResult + status
  → GameOverModal renders (when conditions met)
  → onReturnToLobby callback → lobby-runtime returnToLobby()
```

For spectators:
```
Wire envelope (terminal)
  → spectator-session.ts applySpectatorEnvelope terminal case [stores matchResult]
  → ConsoleState.matchResult (new field on spectator snapshot)
  → App (rendered statically with state prop) → GameOverModal renders
  → onReturnToLobby callback → lobby-runtime returnToLobby()
```

### What Changes

| Layer | Files | Nature of Change |
|-------|-------|-----------------|
| State contract | `contracts/console-types.ts` | Add `matchResult` to `ConsoleState` interface |
| State types | `src/state/types.ts` | No change needed — re-exports from contract |
| Reducer | `src/state/reducer.ts` | Store `event.result`, build result-aware announce text, add to `INITIAL_CONSOLE_STATE` |
| Spectator fold | `src/state/spectator-session.ts` | Store `matchResult` on terminal, add to `initialSpectatorState` |
| Modal component | `src/render/GameOverModal.tsx` | **NEW** — follows `SurrenderModal` pattern exactly |
| App | `src/render/App.tsx` | New `onReturnToLobby` prop, conditionally render `GameOverModal` |
| Lobby runtime | `src/internal/lobby-runtime.tsx` | Pass `returnToLobby` as `onReturnToLobby` to both player and spectator App instances |
| Barrel | `src/index.ts` | Export `GameOverModal` and `GameOverModalProps` |

### What Does NOT Change

- `envelope-to-event.ts` — already extracts `payload.result` correctly
- `spectator-session.ts` `spectatorTerminalText()` — preserved as-is (FR-011)
- Any file outside `packages/console/`
- Engine, networking, matchmaking packages

## Key Decisions

### Decision 1: Modal as a new file, not inline in App

**Chosen**: Separate `GameOverModal.tsx` file.

**Rationale**: Follows the existing `SurrenderModal.tsx` precedent. A separate file is testable in isolation (unit, a11y, component tests), keeps App.tsx from growing, and establishes a pattern for future modals (e.g., rematch confirmation per the spec's Out-of-Scope note).

### Decision 2: Announcement text built in the reducer, not the component

**Chosen**: The reducer constructs the result-aware announce text (`"Match over. Player 1 wins!"` / `"Match over. Draw."`) using `event.result` directly, before storing it in state.

**Rationale**: The `announce` effect carries the text, and the live-region announcer is the screen-reader path (FR-007, FR-012). Building it in the reducer keeps the announcement immediate and deterministic — no dependency on React re-render timing. The `MatchResult` type is already a type-only import in the reducer module. The reducer remains pure (FR-012 compliance: store first, then build text from the already-available `event.result`).

### Decision 3: `matchResult` stored for both player and spectator paths

**Chosen**: Both the reducer and `spectator-session.ts` store `matchResult` in their respective terminal cases.

**Rationale**: The `App` component is shared between player (via store) and spectator (via static state prop) paths. The modal rendering condition (`status === 'game_over' && matchResult !== null`) must work identically for both. The spectator snapshot must carry `matchResult` so the modal can display the result text.

### Decision 4: Non-dismissable focus trap cycles on a single button

**Chosen**: The `GameOverModal` has a `handleKeyDown` that intercepts Tab/Shift+Tab to refocus the single "Return to Lobby" button. No Escape handler. No backdrop click handler.

**Rationale**: FR-005 explicitly prohibits all dismissal paths except the button. The single-button focus trap is simpler than SurrenderModal's two-button trap — Tab on the button focuses the same button. This matches the spec's AC-005.

### Decision 5: `onReturnToLobby` is optional on `AppProps`

**Chosen**: `onReturnToLobby?: () => void` (optional).

**Rationale**: FR-008 specifies that static/test boots omit the prop and the modal is not rendered. This preserves backward compatibility — every existing `<App>` call site (test fixtures, standalone boots) continues to work without modification. Only the two production render sites in `lobby-runtime.tsx` provide the callback.

### Decision 6: No animation or transition

**Chosen**: Instant mount/unmount, same as `SurrenderModal`.

**Rationale**: Out of scope per spec. No new CSS transitions needed. The existing `europa-modal-backdrop` and `europa-modal` CSS classes already handle the visual treatment.

## File-by-File Change Summary

### 1. `packages/console/contracts/console-types.ts` (FR-013)

Add `matchResult` field to the `ConsoleState` interface, after `exclusiveMode`:

```typescript
/**
 * The engine's terminal match result, stored when the `terminal` wire
 * event arrives. `null` until the match ends. The GameOverModal reads
 * this field to display who won, the reason, and the final tick.
 * `MatchResult | null` — re-exported via `@europa/engine`.
 */
readonly matchResult: MatchResult | null;
```

Requires importing `MatchResult` from `@europa/engine` (type-only — already done for other engine types in the file).

### 2. `packages/console/src/state/reducer.ts` (FR-001, FR-012, FR-014)

- Add `matchResult: null` to `INITIAL_CONSOLE_STATE`.
- In the `terminal` case: store `event.result` (or `null` defensively if undefined) in the new state field, and build a result-aware announcement text.
- Add a local helper `terminalAnnouncementText(result)` that returns `"Match over. Player X wins!"` or `"Match over. Draw."`.

### 3. `packages/console/src/state/spectator-session.ts` (FR-010, additive)

- Add `matchResult: null` to `initialSpectatorState()`.
- In `applySpectatorEnvelope`'s `terminal` case: store `payload.result` (or `null` defensively) in the returned state. This is additive to the existing status + feedback changes.

### 4. `packages/console/src/render/GameOverModal.tsx` (FR-002, FR-003, FR-004, FR-005, FR-006, FR-007)

**NEW FILE** (~100 lines). Pattern: `SurrenderModal.tsx` simplified.

- `GameOverModalProps`: `{ open: boolean; result: MatchResult | null; onReturnToLobby: () => void }`
- Renders `null` when `!open || result === null`.
- DOM structure matches the spec's example (FR-002): backdrop → dialog → title → body → actions.
- Focus moves to the button on mount (useEffect + ref, same as SurrenderModal).
- `handleKeyDown`: Tab/Shift+Tab refocus the single button. No Escape handler.
- Title: `"Player X wins!"` for win, `"Draw"` for draw.
- Body: reason text (`"Reason: last standing"` / `"Reason: all surrendered"` / `"Reason: mutual elimination"`) + `"Final tick: N"`.
- Button calls `onReturnToLobby`.
- JSDoc on every exported symbol. No `any`. No suppressions.

### 5. `packages/console/src/render/App.tsx` (FR-008)

- Add `onReturnToLobby?: () => void` to `AppProps`.
- Import `GameOverModal`.
- After the SurrenderModal block (~line 557), conditionally render `GameOverModal` when:
  `resolvedState.status === 'game_over' && resolvedState.matchResult !== null && onReturnToLobby !== undefined`.
- Pass `open={true}`, `result={resolvedState.matchResult}`, `onReturnToLobby`.

### 6. `packages/console/src/internal/lobby-runtime.tsx` (FR-009, FR-010)

- `MatchLegHost` (player path, ~line 898): pass `onReturnToLobby={returnToLobby}` to `<App store={leg.store} />`.
- `SpectatorMatchLeg` (~line 1123): pass `onReturnToLobby` to `<App state={snapshot} />`. This requires threading `returnToLobby` through as a prop to `SpectatorMatchLeg`.

### 7. `packages/console/src/index.ts` (FR-015)

Add after the SurrenderModal export line:
```typescript
export { GameOverModal, type GameOverModalProps } from './render/GameOverModal';
```

## Risk Assessment

### Low Risk

- **React re-render cost**: The modal renders only when `status === 'game_over'` — a single terminal transition during the entire match. Zero runtime cost during active gameplay. The `matchResult` field is null for the entire match and only changes once.

- **Backward compatibility**: All new props are optional. Existing `<App>` call sites (tests, static boots, the selfhost script) continue to work without modification. `INITIAL_CONSOLE_STATE` gains a new field with `null` default — existing destructuring patterns in tests that spread the initial state are unaffected.

- **Bundle size**: < 1 KB gzipped per the spec's estimate. The component is small, uses no new dependencies, and follows the existing modal pattern.

### Medium Risk

- **Spectator path threading**: `SpectatorMatchLeg` currently does not receive `returnToLobby` as a prop. Adding it requires updating the component's props interface and its parent `MatchLegHost`. This is a small, localized change but touches the same area as the player path — both need careful verification.

- **Reconnect edge case (spec Edge Case)**: When a client reconnects and receives a snapshot with `status: 'game_over'`, the `matchResult` may be `null` (the snapshot does not carry it). The modal will not render — the player sees the status text only. This is documented as acceptable behavior in the spec and requires no special handling.

### Notable Test Gaps to Fill

- Reducer terminal case must verify `matchResult` is stored (existing test checks `status` only).
- Reducer must verify the new announcement text format.
- `GameOverModal` needs its own test file for rendering, focus trap, and non-dismissability.
- A11y assertions need a new block for the game-over modal (following the `SurrenderModal` a11y test pattern).
- The existing reducer test at line 180-184 uses `as never` on the result — the test should be tightened to use a properly typed `MatchResult`.

## Constitution Alignment

| Principle | How This Plan Complies |
|-----------|----------------------|
| I. Type Safety | `matchResult: MatchResult \| null` uses the engine's own type. No `any`. No suppressions. |
| III. Tested Game Logic | New reducer behavior + modal component + a11y all have test tasks. ≥80% coverage target applies. |
| IV. Specs as Documentation | Spec is source of truth; plan maps every FR to implementation. |
| V. Simplicity | ~100-line component, ~10 lines changed in reducer, ~5 lines in App, ~5 lines in lobby-runtime. No new abstractions. |
| VI. Accessibility | WCAG 2.2 AA: focus trap, screen-reader announce via existing `aria-live`, visible focus ring. |
