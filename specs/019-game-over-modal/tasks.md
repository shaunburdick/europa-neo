# Tasks: Game-Over Results Modal (Feature 019)

Branch: `issue-47-game-over`

---

## Wave 1: State Layer [foundation]

- [x] **T-001**: Add `matchResult: MatchResult | null` to `ConsoleState` in `packages/console/contracts/console-types.ts` with JSDoc. Import `MatchResult` type-only from `@europa/engine` (type-only import — already used for other engine types in this file). **FR-013**.

- [x] **T-002**: Add `matchResult: null` to `INITIAL_CONSOLE_STATE` in `packages/console/src/state/reducer.ts`. **FR-014**.

- [x] **T-003**: Update the `terminal` case in `reduceNetEvent` (`packages/console/src/state/reducer.ts`) to store `event.result` (defensively `result ?? null`) in a new `matchResult` field on the returned state. **FR-001**.

- [x] **T-004**: Add a local `terminalAnnouncementText(result: MatchResult | null): string` helper in `reducer.ts` and update the terminal case's `announce` effect text from `"Match over"` to a result-aware string (`"Match over. Player X wins!"` or `"Match over. Draw."`). **FR-012**.

- [x] **T-005**: [P] Update `initialSpectatorState()` in `packages/console/src/state/spectator-session.ts` to include `matchResult: null`.

- [x] **T-006**: [P] Update the `terminal` case in `applySpectatorEnvelope` (`packages/console/src/state/spectator-session.ts`) to store `payload.result` (defensively `result ?? null`) in the returned state's `matchResult` field. **FR-010** (spectator path).

## Wave 2: Component + App Wiring [depends on Wave 1]

- [x] **T-007**: Create `packages/console/src/render/GameOverModal.tsx` — the modal component. Pattern: follow `SurrenderModal.tsx` exactly. Single file, ~100 lines. Exports `GameOverModal` function component and `GameOverModalProps` interface. Props: `open: boolean`, `result: MatchResult | null`, `onReturnToLobby: () => void`. Renders `null` when `!open || result === null`. DOM: backdrop → dialog (role="dialog", aria-modal="true") → h2 title → p body → button. Focus moves to button on mount (useEffect + ref). handleKeyDown: Tab/Shift+Tab refocus the single button; no Escape handler. **FR-002, FR-003, FR-004, FR-005, FR-006**.

- [x] **T-008**: Add `onReturnToLobby?: () => void` to `AppProps` interface in `packages/console/src/render/App.tsx`. Import `GameOverModal`. After the SurrenderModal block (~line 557), conditionally render `<GameOverModal>` when `resolvedState.status === 'game_over' && resolvedState.matchResult !== null && onReturnToLobby !== undefined`. **FR-008**.

- [x] **T-009**: In `packages/console/src/internal/lobby-runtime.tsx`, pass `onReturnToLobby={returnToLobby}` to the `<App>` rendered for the player leg (~line 898: `<App store={leg.store} />` → `<App store={leg.store} onReturnToLobby={returnToLobby} />`). **FR-009**.

- [x] **T-010**: In `packages/console/src/internal/lobby-runtime.tsx`, thread `returnToLobby` through `SpectatorMatchLeg`: add `onReturnToLobby?: () => void` to `SpectatorMatchLegProps`, pass it through `MatchLegHost` → `SpectatorMatchLeg`, and pass to `<App state={snapshot} onReturnToLobby={onReturnToLobby} />`. **FR-010**.

- [x] **T-011**: Add `GameOverModal` and `GameOverModalProps` exports to `packages/console/src/index.ts` barrel (after the SurrenderModal export line). **FR-015**.

## Wave 3: Tests [depends on Waves 1–2]

- [x] **T-012**: [P] Update the reducer terminal case test in `packages/console/tests/unit/state/reducer.test.ts` — verify `matchResult` is stored (not null) after a terminal event, and verify the new announcement text format. Add a test for terminal with `result: undefined` (defensive null storage). Add a test for `INITIAL_CONSOLE_STATE.matchResult === null`.

- [x] **T-013**: [P] Create `packages/console/tests/unit/render/GameOverModal.test.ts` — unit tests for the modal component: renders nothing when `open=false`; renders nothing when `result=null`; renders correct title for win; renders correct body text for win with `last_standing` reason; renders correct title for draw; renders correct body text for draw with `mutual_elimination` reason; button text is "Return to Lobby"; button click calls `onReturnToLobby` exactly once; focus is on the button after mount; Tab on the button keeps focus on the same button (single-element focus trap); Escape does NOT call `onReturnToLobby`; backdrop click does NOT call `onReturnToLobby`.

- [x] **T-014**: [P] Add game-over modal accessibility assertions to `packages/console/tests/a11y/wcag-assertions.test.ts` — following the `SurrenderModal` pattern: verify `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby` target the correct elements, focus moves to the button on open, Tab cycling stays on the button. Add an `aria-live` region assertion for the announcement text (FR-007).

- [x] **T-015**: [P] Update spectator session tests (in `packages/console/tests/unit/state/spectator-session.test.ts` or equivalent) — verify `matchResult` is stored on terminal envelope, and `matchResult` is `null` in `initialSpectatorState`. Verify the `terminal` case still appends feedback text (FR-011 — no change to `spectatorTerminalText`).

## Wave 4: Integration + Polish

- [x] **T-016**: [P] Verify App conditional rendering — add a test (in existing App test file or component test) that `GameOverModal` is NOT rendered when `onReturnToLobby` is absent even if `status === 'game_over'` and `matchResult` is set. **AC-009**.

- [x] **T-017**: [P] Verify App conditional rendering — add a test that `GameOverModal` IS rendered when all three conditions are met (`status === 'game_over'`, `matchResult !== null`, `onReturnToLobby` provided). **AC-010** (player path) and **AC-010** (spectator path via `state` prop).

- [x] **T-018**: Run full console test suite (`pnpm --filter @europa/console test`), typecheck (`pnpm --filter @europa/console typecheck`), lint (`pnpm --filter @europa/console lint`), and format check (`pnpm --filter @europa/console format:check`). Fix any failures.

- [x] **T-019**: Run full `pnpm verify` from repo root to ensure no cross-package regressions. Verify bundle size is within budget.

---

## Coverage Traceability

| Spec FR | Tasks |
|---------|-------|
| FR-001 (reducer stores matchResult) | T-002, T-003, T-012 |
| FR-002 (GameOverModal dialog structure) | T-007 |
| FR-003 (result text display) | T-007, T-013 |
| FR-004 (Return to Lobby button) | T-007, T-013 |
| FR-005 (non-dismissable) | T-007, T-013, T-014 |
| FR-006 (focus on mount) | T-007, T-013, T-014 |
| FR-007 (screen-reader announce) | T-004, T-014 |
| FR-008 (App optional prop) | T-008, T-016, T-017 |
| FR-009 (player path wiring) | T-009 |
| FR-010 (spectator path wiring) | T-006, T-010, T-015, T-017 |
| FR-011 (spectatorTerminalText unchanged) | T-015 |
| FR-012 (result-aware announce text) | T-004, T-012 |
| FR-013 (ConsoleState contract) | T-001 |
| FR-014 (INITIAL_CONSOLE_STATE) | T-002, T-012 |
| FR-015 (barrel exports) | T-011 |

## Coverage Traceability (Acceptance Criteria)

| AC | Tasks |
|----|-------|
| AC-001 (matchResult stored on terminal) | T-003, T-012 |
| AC-002 (modal renders with correct text) | T-007, T-008, T-013, T-017 |
| AC-003 (backdrop click no dismiss) | T-007, T-013 |
| AC-004 (Escape no dismiss) | T-007, T-013 |
| AC-005 (Tab stays on button) | T-007, T-013, T-014 |
| AC-006 (button calls onReturnToLobby) | T-007, T-013 |
| AC-007 (focus on mount) | T-007, T-013, T-014 |
| AC-008 (draw result text) | T-007, T-013 |
| AC-009 (no modal without onReturnToLobby) | T-008, T-016 |
| AC-010 (spectator path) | T-006, T-010, T-015, T-017 |
| AC-011 (screen reader announce) | T-004, T-014 |
| AC-012 (reducer purity) | T-003, T-004, T-012 |
