# Research: Lobby Roster (Feature 023)

## Technology Choices

### 1. Wire Protocol Extension Pattern

**Choice**: Additive `LobbyEvent` variants (same pattern as feature 010's additive lobby family)

**Alternatives Considered**:
- **New message kind** (e.g., `rosterEvent`): Would require a new `MessageKind` discriminator and a new frame type. Rejected because the lobby already has a multiplexed `lobbyEvent` channel — adding another channel fragments the protocol unnecessarily.
- **Embed roster in existing `snapshot`**: Would couple roster revisions to lobby revisions, causing unnecessary full-lobby snapshots on roster-only changes. Rejected per decision D2.

**Evidence**: Feature 010's `LobbyEvent` union was designed for additive variants (network-types.ts line 735–745: "Additive variants may be introduced; clients MUST ignore unrecognized kinds"). The existing `identity`, `snapshot`, `actionAccepted`, and `error` variants demonstrate the pattern.

### 2. Server-Side Roster Storage

**Choice**: In-memory `Map<GuestPlayerId, RosterEntry>` inside `LobbyService`

**Alternatives Considered**:
- **Separate `RosterService` module**: Would require cross-module access to the `presence` map or duplicating it. Rejected for simplicity (Principle V).
- **Extend `presence` map directly**: The `presence` map already has `matchId` and `role` but not `handle` — and its semantics (match association) are different from roster semantics (presence broadcast). Keeping them separate avoids polluting the match-assocation data model.

**Evidence**: The existing `LobbyService` already manages `connections`, `subscriptions`, `presence`, and `ledger` maps — adding one more is consistent with the module's scope.

### 3. Anti-Flap Implementation

**Choice**: Per-player `setTimeout` debounce with grace window (default 500ms)

**Alternatives Considered**:
- **Batch window on broadcast**: Buffer all changes for N ms, then broadcast once. Rejected because it adds latency to every status change, not just rapid toggles.
- **No anti-flap**: Simplest, but the spec explicitly requires it (FR-011) to prevent broadcast spam from rapid leave/rejoin cycles.

**Evidence**: The debounce pattern is well-understood and used in UI frameworks (e.g., search input debouncing). The per-player timer is lightweight (one `setTimeout` handle per active player).

### 4. Console State Management

**Choice**: Extend `LobbyState` with `roster: RosterState` and add `LobbyAction` variants

**Alternatives Considered**:
- **Separate React context**: Would create a parallel state tree that needs synchronization with the lobby state. Rejected for consistency with the existing reducer pattern.
- **Zustand/other state library**: Not used in the project; introducing a new dependency violates Principle V and the self-hostable constraint.

**Evidence**: The existing lobby reducer pattern (lobby-state.ts → lobby-reducer.ts) is well-established and handles similar concerns (snapshot application, identity resolution, action lifecycle). Roster state follows the same flow.

### 5. Roster Component Styling

**Choice**: CSS classes using `europa-*` design tokens (matching existing lobby components)

**Alternatives Considered**:
- **Inline styles**: Used by game primitives but not by generic components. The roster card is a generic layout component, so CSS classes are appropriate.
- **Shadow DOM web component**: The roster card is React-rendered inside the lobby; it does not need framework isolation.

**Evidence**: The existing `lobby-landing.tsx`, `lobby-match-list.tsx`, and `lobby-create-form.tsx` all use `europa-*` CSS classes for styling. The roster card follows this pattern.

### 6. Periodic Full Snapshot Strategy

**Choice**: Every 60 seconds OR when accumulated unsent deltas exceed 20 changes

**Alternatives Considered**:
- **Delta-only with client-side full rebuild**: Clients would need to track all-ever-seen handles and detect removals. Complex and error-prone.
- **Full snapshot on every change**: Simple but wasteful for small changes in a busy lobby.

**Evidence**: The 60s/20-change thresholds match the spec's FR-005 guidance. The lobby itself uses full snapshots on every mutation (no deltas), so the roster's delta approach is actually an optimization over the existing pattern.

## Version Compatibility

All changes are additive:
- New types (`RosterEntry`, `RosterSnapshot`, `RosterDelta`, `RosterRevision`, `RosterStatus`) are additive
- New `LobbyEvent` variants (`roster`, `rosterDelta`) are additive
- No existing types are modified
- `NETWORK_API_VERSION` is NOT bumped
- Old clients ignore unrecognized `LobbyEvent` kinds (wire tolerance rule)
- New clients tolerate old servers that don't emit roster events (degraded state)

## Test Strategy

### Server (matchmaking package)
- Unit tests for roster state management (add/remove/update entries)
- Unit tests for status derivation (priority logic)
- Unit tests for anti-flap grace period (debounce behavior)
- Unit tests for revision monotonicity (never resets)
- Unit tests for delta batching (multiple simultaneous changes)
- Unit tests for handle change during active roster entry
- Integration test: full lobby flow with roster events (subscribe → snapshot → join match → delta → leave → delta)

### Wire (networking package)
- Conformance test: roster types in networking match matchmaking mirror (byte-identical)
- Conformance test: `LobbyEvent` union includes roster variants

### Console
- Component test: RosterCard renders entries with correct status badges
- Component test: "(you)" indicator for own entry
- Component test: "Players online (N)" heading
- Component test: "Presence unavailable" degraded state
- Component test: keyboard navigation
- A11y test: screen reader announcements via live region
- A11y test: contrast ratios for status badges

### E2E
- Two clients in lobby → both see each other in roster
- Player joins match → status changes to "In game" for all subscribers
- Player spectates → status changes to "Spectating"
- Player disconnects → removed from roster
