# Feature 019: Game-Over Results Modal

> Version: 1.0
> Last Updated: 2026-09-04
> Status: Implemented (2026-09-04)
> Dependencies: Feature 005 (console), Feature 001 (engine MatchResult type)

## Problem Statement

When a multiplayer match ends, the console transitions to `status: 'game_over'` but provides no clear indication of what happened or how to leave. The player sees a frozen board with a `Status: game_over` label in the HUD and has no obvious navigation path back to the lobby. The engine already produces a `MatchResult` payload (who won, why, at which tick) via the `terminal` wire event, but the console reducer discards it — storing only the status string. This leaves the player stranded on a dead screen with no contextual information about the match outcome.

## User Stories

- As a **player**, I want to see who won and why when the match ends so that I understand the outcome without having to parse technical status strings.
- As a **player**, I want a clear "Return to Lobby" button when the match ends so that I can easily navigate back and start a new match.
- As a **spectator**, I want to see the match result (winner, reason, final tick) when the game ends so that I have closure on what I watched.
- As a **screen-reader user**, I want the game-over result announced and presented in a keyboard-navigable dialog so that I can access the same information as sighted users.

## Functional Requirements

- **FR-001**: The reducer's `terminal` case must store `event.result` (the engine's `MatchResult`) in a new `ConsoleState.matchResult` field, in addition to setting `status: 'game_over'`. The field is `MatchResult | null`, defaulting to `null` in `INITIAL_CONSOLE_STATE`.

- **FR-002**: A new `GameOverModal` component renders a `role="dialog" aria-modal="true"` overlay when `status === 'game_over' && matchResult !== null`. The modal follows the existing `SurrenderModal` pattern: backdrop, dialog container, title, body, and action button, using the same CSS classes (`europa-modal-backdrop`, `europa-modal`, `europa-modal__title`, `europa-modal__body`, `europa-modal__actions`, `europa-modal__button`).

- **FR-003**: The modal displays the match result as human-readable text:
  - Win: `"Player X wins!"` where X is `result.winner` (the `PlayerId`).
  - Draw: `"Draw — mutual elimination."`.
  - The reason text is shown as a secondary line: `"Reason: last standing"`, `"Reason: all surrendered"`, or `"Reason: mutual elimination"`.
  - The final tick is shown: `"Final tick: N"`.

- **FR-004**: The modal displays a single action button: `"Return to Lobby"`. This button calls the `onReturnToLobby` callback prop provided by the parent.

- **FR-005**: The modal is NOT dismissable. Specifically:
  - No backdrop click handler (clicking the backdrop does nothing).
  - No Escape key handler (the Escape key is not intercepted).
  - No close button ("X") in the title bar.
  - The only exit path is the "Return to Lobby" button.
  - The focus trap cycles only through the single "Return to Lobby" button (Tab on the button returns focus to the same button).

- **FR-006**: When the modal opens, focus moves to the "Return to Lobby" button (WCAG 2.4.3 Focus Order). The button receives the `europa-focus-ring` class for visible focus indication.

- **FR-007**: The modal is announced to screen readers via `aria-live="assertive"` on a companion live region (or by the existing `LiveRegionAnnouncer`) with text summarizing the result: e.g., `"Match over. Player 1 wins!"` or `"Match over. Draw."`.

- **FR-008**: The `App` component accepts an optional `onReturnToLobby?: () => void` prop. When provided and `status === 'game_over' && matchResult !== null`, the `GameOverModal` is rendered. When `onReturnToLobby` is absent (e.g., static/test boots), the modal is not rendered — the existing behavior (status text only) is preserved.

- **FR-009**: The `MatchLegHost` in `lobby-runtime.tsx` passes `onReturnToLobby={returnToLobby}` to the `App` component. The existing `returnToLobby()` function (which calls `controller.leaveMatch()` and navigates to `/lobby`) is reused without modification.

- **FR-010**: The `SpectatorMatchLeg` also passes `onReturnToLobby` to its `App` instance, using the same `returnToLobby` navigation function, so spectators see the modal on game-over too.

- **FR-011**: The existing `spectatorTerminalText()` helper in `spectator-session.ts` is NOT modified. The spectator session continues to add the terminal text to the feedback queue as before. The game-over modal is an additive overlay; the feedback message is not removed.

- **FR-012**: The reducer's terminal case announcement text is updated from `"Match over"` to a result-aware string (e.g., `"Match over. Player 1 wins!"` or `"Match over. Draw."`) to ensure screen readers announce the outcome, not just the event. The `matchResult` is stored before the announcement is constructed.

- **FR-013**: The `ConsoleState` contract file (`console-types.ts`) is updated to include `matchResult: MatchResult | null` in the `ConsoleState` interface, with a JSDoc comment explaining the field.

- **FR-014**: The `INITIAL_CONSOLE_STATE` in the reducer module includes `matchResult: null`.

- **FR-015**: The console package's public barrel (`index.ts`) exports `GameOverModal` and `GameOverModalProps`.

## Non-Functional Requirements

- **Accessibility**: WCAG 2.2 AA. The modal must be keyboard-navigable (focus trap), screen-reader announced, and use sufficient contrast. The existing `europa-modal` CSS classes already meet contrast requirements (verified in feature 005's Q-A02).
- **Performance**: The modal renders only when the match is over — zero runtime cost during active gameplay. No additional re-renders during tick updates.
- **Compatibility**: Works in all browsers supported by the console (Chromium, Firefox, Safari — same as feature 005).
- **Bundle size**: The `GameOverModal` component adds negligible bundle weight (estimated < 1 KB gzipped). No new dependencies.

## Acceptance Criteria

- [ ] **AC-001**: Given a match ends with a win, when the terminal event arrives, then `ConsoleState.matchResult` is set to the `MatchResult` object (not `null`) and `status` is `'game_over'`.
- [ ] **AC-002**: Given `status === 'game_over' && matchResult !== null && onReturnToLobby is provided`, when the App renders, then the `GameOverModal` is visible with the correct result text, reason text, and final tick.
- [ ] **AC-003**: Given the `GameOverModal` is open, when the user clicks the backdrop, then the modal remains open (no dismiss).
- [ ] **AC-004**: Given the `GameOverModal` is open, when the user presses Escape, then the modal remains open (no dismiss).
- [ ] **AC-005**: Given the `GameOverModal` is open, when the user presses Tab, then focus stays on the "Return to Lobby" button (single-element focus trap).
- [ ] **AC-006**: Given the `GameOverModal` is open, when the user activates the "Return to Lobby" button (Enter/Space/click), then `onReturnToLobby` is called exactly once.
- [ ] **AC-007**: Given the `GameOverModal` is open, when it first mounts, then focus is on the "Return to Lobby" button.
- [ ] **AC-008**: Given a draw result, when the modal renders, then the title reads "Draw" and the body includes "mutual elimination" as the reason.
- [ ] **AC-009**: Given `onReturnToLobby` is NOT provided (static boot / test), when `status === 'game_over'`, then no modal is rendered and the existing status-only behavior is preserved.
- [ ] **AC-010**: The spectator path (`SpectatorMatchLeg`) renders the same `GameOverModal` on game-over with the same behavior.
- [ ] **AC-011**: Screen readers announce the result via the existing `aria-live` region within 1 second of the terminal event.
- [ ] **AC-012**: The reducer is pure — `matchResult` is stored in the state return; no side effects in the reducer's terminal case beyond the existing `announce` effect.

## Out of Scope

- **Rematch functionality**: A "Rematch" button in the game-over modal is a future feature. This spec adds only "Return to Lobby."
- **Match statistics / scoreboard**: Detailed per-player stats (cities conquered, troops lost, etc.) are not shown in the modal. The modal shows winner, reason, and tick only.
- **Match result persistence**: Storing results to a database or showing a match history is out of scope.
- **Sound effects**: No new sound clip for game-over. The existing `announce` effect handles screen-reader audio.
- **Animation / transition**: The modal appears instantly (same as `SurrenderModal`). No entrance/exit animation is required.
- **Engine or networking changes**: The `MatchResult` type and the `terminal` wire event already exist. No changes to packages outside `packages/console`.

## Edge Cases

- **Terminal event arrives but `matchResult` is somehow `undefined`**: The reducer stores `null` (defensive). The modal does not render. The status still transitions to `'game_over'`. This matches the existing behavior.
- **Multiple terminal events**: The reducer overwrites `matchResult` on each terminal event. Since the engine emits terminal exactly once, this is a defensive no-op.
- **Reconnect after game-over**: If the client reconnects and receives a snapshot with `status: 'game_over'`, the `matchResult` may be `null` (the snapshot does not carry it). The modal does not render; the player sees the status text only. This is acceptable — the modal is a best-effort enhancement for the primary flow.
- **Spectator disconnect during game-over**: The spectator session's terminal handling (adding feedback text) is unaffected. The modal appears identically.
- **3–4 player matches**: The `MatchResult.winner` is a `PlayerId`. The modal displays the numeric ID. Player name resolution is a future feature (not in v1 scope).

## Examples

### Win result modal

```
┌─────────────────────────────────────┐
│                                     │
│         Player 1 wins!              │
│                                     │
│   Reason: last standing             │
│   Final tick: 1247                  │
│                                     │
│        [Return to Lobby]            │
│                                     │
└─────────────────────────────────────┘
```

### Draw result modal

```
┌─────────────────────────────────────┐
│                                     │
│              Draw                   │
│                                     │
│   Reason: mutual elimination        │
│   Final tick: 892                   │
│                                     │
│        [Return to Lobby]            │
│                                     │
└─────────────────────────────────────┘
```

### DOM structure (matches SurrenderModal pattern)

```html
<div class="europa-modal-backdrop">
  <div role="dialog" aria-modal="true" aria-labelledby="gameover-title"
       aria-describedby="gameover-body" class="europa-modal europa-focus-ring">
    <h2 id="gameover-title" class="europa-modal__title">Player 1 wins!</h2>
    <p id="gameover-body" class="europa-modal__body">
      Reason: last standing<br/>
      Final tick: 1247
    </p>
    <div class="europa-modal__actions">
      <button type="button" class="europa-modal__button europa-focus-ring">
        Return to Lobby
      </button>
    </div>
  </div>
</div>
```

## Clarifications Applied

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | Should the game-over modal be dismissable via backdrop click or Escape? | No. The modal is NOT dismissable. No backdrop click, no Escape. Only the "Return to Lobby" button exits. (Product owner decision.) | FR-005 |
| 2 | How does the "Return to Lobby" button navigate? Does the project use React Router? | No React Router. The project uses a hand-rolled router. The `App` component receives an `onReturnToLobby?: () => void` callback prop. The lobby-runtime provides this using its existing `returnToLobby()` function (which calls `controller.leaveMatch()` and `history.replaceState` to `/lobby`). | FR-008, FR-009 |
| 3 | Should the spectator also see the game-over modal? | Yes. `SpectatorMatchLeg` passes `onReturnToLobby` to its `App` instance, so spectators see the same modal. | FR-010 |
| 4 | What happens to the existing `spectatorTerminalText()` feedback message? | Nothing. It stays. The game-over modal is an additive overlay. The feedback message in the feedback queue remains as-is. | FR-011 |
| 5 | Should the modal show player names or just IDs? | Player IDs only. Name resolution is a future feature. The modal shows `"Player 1 wins!"` (numeric ID). | FR-003, Edge Cases |
