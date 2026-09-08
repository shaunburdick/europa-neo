# Tasks: Lobby Roster (Feature 023)

**Input**: Design documents from `/specs/023-lobby-roster/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/roster-wire.md

## Phase 1: Wire Types (Foundational)

**Purpose**: Define the roster types in both contract mirrors. All subsequent work depends on these types existing.

- [ ] T001 **[P]** Add roster types (`RosterEntry`, `RosterStatus`, `RosterRevision`, `RosterSnapshot`, `RosterDelta`) to `packages/networking/src/contracts/network-types.ts` — extend the `LobbyEvent` union with `roster` and `rosterDelta` variants. Do NOT bump `NETWORK_API_VERSION`.
- [ ] T002 **[P]** Mirror the same roster types and `LobbyEvent` extensions in `packages/matchmaking/src/contracts/lobby-types.ts` — field-for-field identical to the networking copy. Update the conformance test to include the new variants.
- [ ] T003 **[P]** Add roster type exports to `packages/networking/src/index.ts` and `packages/matchmaking/src/index.ts` so downstream packages can import them.

**Checkpoint**: TypeScript compiles; both contract copies are structurally identical.

---

## Phase 2: Server Roster Logic

**Purpose**: Implement the authoritative roster state in `LobbyService`.

- [ ] T004 Add roster state to `LobbyService` internals in `packages/matchmaking/src/internal/lobbyService.ts`: `roster: Map<GuestPlayerId, RosterEntry>`, `rosterRevision: number`, `rosterDebounceTimers: Map<GuestPlayerId, ReturnType<typeof setTimeout>>`, `rosterPendingChanges: Map<GuestPlayerId, RosterEntry>`, `rosterUnsentDeltaCount: number`.
- [ ] T005 Implement `deriveRosterStatus(guestId: GuestPlayerId): RosterStatus` — reads from the existing `presence` map. Priority: `in_game` (seated player) > `spectating` > `in_lobby`.
- [ ] T006 Implement `updateRosterEntry(guestId: GuestPlayerId, handle: string): void` — adds or updates a roster entry with the derived status. Applies anti-flap grace period (FR-011): if a change arrives within the grace window, reset the debounce timer; only broadcast the final state when the timer fires.
- [ ] T007 Implement `removeRosterEntry(guestId: GuestPlayerId): void` — removes a roster entry and clears its debounce timer. Increment `rosterRevision`.
- [ ] T008 Implement `broadcastRosterSnapshot(): void` — sends a full `roster` snapshot to all subscribed connections. Reset `rosterUnsentDeltaCount`.
- [ ] T009 Implement `broadcastRosterDelta(entries: ReadonlyArray<RosterEntry>): void` — sends a `rosterDelta` to all subscribed connections. Increment `rosterRevision`. Increment `rosterUnsentDeltaCount`.
- [ ] T010 Integrate roster into `establishIdentity`: call `updateRosterEntry` with the player's handle and `in_lobby` status.
- [ ] T011 Integrate roster into `setHandle`: update the roster entry's handle (preserve status) when the handle changes.
- [ ] T012 Integrate roster into `create`/`join`/`spectate`/`leave`: after presence changes, call `updateRosterEntry` to re-derive and broadcast status.
- [ ] T013 Integrate roster into `connectionClosed` and the lifecycle funnels (`onMatchTerminal`, `onStatusChanged`, `onSeatExpired`): remove or update roster entries as appropriate.
- [ ] T014 Integrate roster into `subscribe`: send a full roster snapshot as the first roster event after the lobby snapshot.
- [ ] T015 Implement periodic full snapshot: on every `recomputeAndPublish`, check if `rosterUnsentDeltaCount >= 20` or if 60 seconds have elapsed since the last full snapshot; if so, send a full roster snapshot instead of deltas.
- [ ] T016 Clean up roster state in `close()`: clear all debounce timers, clear roster maps.

**Checkpoint**: Server roster logic is complete. Roster events are emitted on all state transitions.

---

## Phase 3: Server Roster Tests

**Purpose**: Verify roster logic with comprehensive tests.

- [ ] T017 Write unit tests for `deriveRosterStatus` in `packages/matchmaking/tests/unit/roster.test.ts`: test all status derivations (no match → in_lobby, seated player → in_game, spectator → spectating, seated player also spectating → in_game wins).
- [ ] T018 Write unit tests for anti-flap grace period: rapid leave/rejoin within 500ms produces at most one broadcast; change outside grace window broadcasts normally.
- [ ] T019 Write unit tests for revision monotonicity: revision never resets; each mutation increments by exactly 1.
- [ ] T020 Write unit tests for delta batching: multiple simultaneous status changes (e.g., match start with 2 players) are batched into a single `rosterDelta`.
- [ ] T021 Write unit tests for handle change: updating a handle preserves status and updates the entry.
- [ ] T022 Write unit tests for full snapshot periodicity: full snapshot sent after 20 deltas or 60 seconds.
- [ ] T023 Write unit tests for player removal: disconnected player removed from roster; entry absent from subsequent snapshots.
- [ ] T024 Write integration test: full lobby flow — connect → subscribe (gets roster snapshot) → join match (gets rosterDelta) → leave match (gets rosterDelta) → disconnect (removed from roster).

**Checkpoint**: Server roster logic is verified with ≥80% coverage.

---

## Phase 4: Console Transport

**Purpose**: Handle roster events in the browser lobby client.

- [ ] T025 Add `onRoster` subscriber to `WsLobbyClient` interface in `packages/console/src/net/ws-lobby-client.ts`: `onRoster(handler: (snapshot: RosterSnapshot) => void): () => void`.
- [ ] T026 Handle `roster` lobby event in `handleLobbyEvent`: call `applyRosterSnapshot` which replaces local roster state and invokes `onRoster` handlers.
- [ ] T027 Handle `rosterDelta` lobby event in `handleLobbyEvent`: merge changes into local roster state and invoke `onRoster` handlers.
- [ ] T028 Add roster revision gating: discard roster events with revision ≤ last-seen roster revision. Reset roster revision baseline on each establish cycle.
- [ ] T029 Add roster state to `WsLobbyClientState`: `roster: ReadonlyArray<RosterEntry>`, `rosterRevision: RosterRevision | null`.
- [ ] T030 Implement degraded roster timeout: if no roster snapshot received within 5 seconds of subscribe, set roster state to degraded.

**Checkpoint**: Browser transport handles roster events correctly.

---

## Phase 5: Console State & Reducer

**Purpose**: Add roster state to the lobby application state.

- [ ] T031 Add `RosterState` interface to `packages/console/src/state/lobby-state.ts`: `{ players: ReadonlyArray<RosterEntry>; revision: RosterRevision | null; connected: boolean }`.
- [ ] T032 Add `roster: RosterState` to `LobbyState` interface.
- [ ] T033 Add `INITIAL_ROSTER_STATE` to the initial state.
- [ ] T034 Add `lobbyRosterSnapshot` and `lobbyRosterDelta` variants to `LobbyAction` union.
- [ ] T035 Handle roster actions in `reduceLobby`: `lobbyRosterSnapshot` replaces roster state; `lobbyRosterDelta` merges changes.
- [ ] T036 Reset roster state on `lobbyConnectionChanged` to `'idle'` or `'failed'` (clear players, set `connected: false`).
- [ ] T037 Wire roster events from `WsLobbyClient.onRoster` to the lobby controller dispatch.

**Checkpoint**: Console state management handles roster data.

---

## Phase 6: Console Roster UI

**Purpose**: Render the roster card in the lobby.

- [ ] T038 Create `packages/console/src/ui/lobby-roster-card.tsx`: the `RosterCard` component. Props: `roster: RosterState`, `ownHandle: string | null`. Renders heading "Players online (N)" or "Players online (?)", list of entries with handle + status badge + "(you)" indicator, or "Presence unavailable" degraded state.
- [ ] T039 Style the roster card using `europa-*` design tokens: card container, entry rows, status dots/badges (green for in_lobby, amber for in_game, blue for spectating), "(you)" highlight.
- [ ] T040 Add keyboard navigation: roster entries as focusable items or within a navigable region (WCAG 2.2 AA).
- [ ] T041 Add screen reader support: `role="list"` for the roster, `role="listitem"` for entries, `aria-live="polite"` region for updates (with coalescing to avoid spam).
- [ ] T042 Add `prefers-reduced-motion` support: disable any status-change animations; roster updates instantly.
- [ ] T043 Integrate `RosterCard` into `lobby-landing.tsx`: render in the sidebar section, below the identity card and create form.
- [ ] T044 Add roster announcements to the lobby landing: announce player joins/leaves via the shared `LiveRegionAnnouncer` (polite, coalesced).

**Checkpoint**: Roster card renders correctly in the lobby.

---

## Phase 7: Console Tests

**Purpose**: Verify roster UI with component, a11y, and unit tests.

- [ ] T045 Write component tests for `RosterCard` in `packages/console/tests/unit/lobby-roster-card.test.tsx`: renders entries with correct handles and status text; shows "(you)" for own entry; shows "Players online (N)" heading; shows "Presence unavailable" when not connected; handles empty roster.
- [ ] T046 Write a11y tests: keyboard navigation through roster entries; screen reader announcements via live region; contrast ratios for status badges.
- [ ] T047 Write unit tests for roster reducer actions: snapshot replacement, delta merging, connection reset.
- [ ] T048 Write unit tests for roster state derivation in the landing page: heading text, own-entry detection, status display text.

**Checkpoint**: Console roster UI is verified.

---

## Phase 8: Conformance & Drift Tests

**Purpose**: Ensure contract mirrors stay in sync.

- [ ] T049 Update networking conformance test to verify roster types are structurally identical between networking and matchmaking copies.
- [ ] T050 Update matchmaking lobby conformance test to include roster `LobbyEvent` variants.

**Checkpoint**: Contract drift is caught by automated tests.

---

## Phase 9: Documentation

**Purpose**: Update player manual and README per FR-021/FR-022.

- [ ] T051 Create `docs/manual/roster.md` describing the roster feature: what it shows, how status is derived, meaning of each status value.
- [ ] T052 Link `docs/manual/roster.md` from `docs/manual/index.md`.
- [ ] T053 Update `README.md` to mention the roster in the lobby section.

**Checkpoint**: Documentation is complete and accurate.

---

## Phase 10: Polish & Verification

**Purpose**: Final verification and cleanup.

- [ ] T054 Run full test suites: `pnpm test` across all packages. Verify ≥80% coverage on roster logic.
- [ ] T055 Run `pnpm typecheck` and `pnpm lint` — zero errors, zero suppressions.
- [ ] T056 Run `pnpm format:check` — clean.
- [ ] T057 Manual smoke test: `pnpm host` → two browser tabs → verify roster shows both players → one joins match → status updates → one disconnects → removed from roster.
- [ ] T058 Verify existing lobby/match/gameplay test suites still pass (no regressions).
- [ ] T059 Update spec status to Implemented.

**Checkpoint**: Feature 023 is complete and verified.

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Wire Types)**: No dependencies — start immediately
- **Phase 2 (Server Logic)**: Depends on Phase 1 (types must exist)
- **Phase 3 (Server Tests)**: Depends on Phase 2 (logic must exist)
- **Phase 4 (Console Transport)**: Depends on Phase 1 (types must exist); can run in parallel with Phase 2/3
- **Phase 5 (Console State)**: Depends on Phase 4 (transport must handle events)
- **Phase 6 (Console UI)**: Depends on Phase 5 (state must exist)
- **Phase 7 (Console Tests)**: Depends on Phase 6 (UI must exist)
- **Phase 8 (Conformance)**: Depends on Phase 1 (types must exist); can run in parallel with Phases 2-7
- **Phase 9 (Documentation)**: Can run in parallel with Phases 2-8
- **Phase 10 (Polish)**: Depends on all previous phases

### Parallel Opportunities
- T001 and T002 can run in parallel (different packages, same types)
- T003 can run in parallel with T001/T002 (just exports)
- Phase 4 (console transport) can run in parallel with Phase 2/3 (server logic/tests)
- Phase 8 (conformance) can run in parallel with Phases 2-7
- Phase 9 (documentation) can run in parallel with Phases 2-8
- Within Phase 3, test tasks T017-T023 can run in parallel
- Within Phase 7, test tasks T045-T048 can run in parallel

### Estimated Task Count: 59 tasks
