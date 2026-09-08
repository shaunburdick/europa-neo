# Implementation Plan: Lobby Roster (Feature 023)

## Technical Context

Feature 023 adds a server-authoritative presence roster to the lobby, showing every active player's handle and current status (`in_lobby`, `in_game`, `spectating`). The roster is pushed to lobby subscribers in real time via additive wire events.

### Key Constraints (from spec + issue #28)

- **Payload is exactly `{handle, status}`** — no privacy enforcement, no opaque IDs, no compile-time witnesses
- **Additive wire variants only** — no `NETWORK_API_VERSION` bump
- **Server-authoritative, in-memory roster** — no persistence, no external services
- **Anti-flap grace period** for rapid status transitions (default 500ms)
- **Deterministic ordering** by handle (case-insensitive lexicographic)
- **`rosterRevision` counter NEVER resets** — not on server restart, not on any lifecycle event
- Must not break existing lobby, match, or gameplay behavior

## Architecture Overview

### What Changes (layered)

```
┌─────────────────────────────────────────────────────┐
│ Wire Protocol (networking + matchmaking mirror)     │
│  + roster/RosterSnapshot LobbyEvent variant         │
│  + rosterDelta/RosterDelta LobbyEvent variant       │
│  + RosterEntry, RosterStatus, RosterRevision types  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Server: LobbyService (matchmaking package)          │
│  + roster map: GuestPlayerId → RosterEntry          │
│  + rosterRevision counter (monotonic, never reset)  │
│  + anti-flap debounce timers per player              │
│  + status derivation from presence map               │
│  + broadcastRosterDelta() + broadcastRosterSnapshot()│
│  + roster events on subscribe + periodic full sync   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Browser Transport (ws-lobby-client)                 │
│  + roster event dispatch → onRoster/onRosterDelta   │
│  + local roster state merge (snapshot replaces,     │
│    delta applies changes)                            │
│  + revision-gated stale protection                  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Console UI                                         │
│  + RosterCard component (lobby sidebar section)     │
│  + roster state in LobbyState (players[], revision)  │
│  + lobbyReducer actions for roster events            │
│  + "(you)" indicator, status badges, count heading   │
│  + degraded "Presence unavailable" state             │
│  + keyboard nav + screen reader live region          │
└─────────────────────────────────────────────────────┘
```

### Wire Protocol Changes

Two new `LobbyEvent` variants, additive to the existing discriminated union:

```typescript
// Full snapshot (sent on subscribe and periodically)
| { readonly kind: 'roster'; readonly roster: RosterSnapshot }

// Incremental update (sent on individual changes)
| { readonly kind: 'rosterDelta'; readonly delta: RosterDelta }
```

Where:
```typescript
type RosterStatus = 'in_lobby' | 'in_game' | 'spectating';
type RosterRevision = number; // branded, monotonic, never resets

interface RosterEntry {
  readonly handle: string;
  readonly status: RosterStatus;
}

interface RosterSnapshot {
  readonly revision: RosterRevision;
  readonly players: ReadonlyArray<RosterEntry>;
}

interface RosterDelta {
  readonly revision: RosterRevision;
  readonly changes: ReadonlyArray<RosterEntry>;
}
```

### Server Roster Logic (in LobbyService)

The roster lives alongside the existing `presence` map. Key behaviors:

1. **Add to roster**: on `establishIdentity` — the player gets `in_lobby` status
2. **Status derivation**: from `presence` map — `in_game` (seated player) > `spectating` (spectator) > `in_lobby` (no match)
3. **Remove from roster**: on `connectionClosed` when identity grace expires or session ends
4. **Broadcast deltas**: on any status change or roster membership change, subject to anti-flap grace
5. **Periodic full snapshot**: every 60 seconds OR when unsent deltas exceed 20 changes
6. **Subscribe delivery**: full roster snapshot as the first roster event on `lobbySubscribe`
7. **Handle changes**: update entry in-place, preserve status

### Anti-Flap Grace Period

When a status change occurs within the grace window (default 500ms) of a prior change for the same player:
- The intermediate state is NOT broadcast
- Only the final stable state is broadcast after the window elapses
- Implementation: per-player `setTimeout` that coalesces rapid transitions

### Status Derivation Priority

```
in_game (seated in a running or filling match)
  > spectating (attached as spectator)
  > in_lobby (not in any match)
```

The highest-priority applicable status wins. This is derived from the existing `presence` map which already tracks `role: 'player' | 'spectator'` and `matchId`.

### Console UI

A new `RosterCard` component in the lobby sidebar (beside the identity card and create form). Layout from spec:

```
Players online (3)
┌─────────────────────────────────────┐
│ Alice (you)         ● In lobby      │
│ Bob                 ● In game       │
│ Charlie             ● Spectating    │
└─────────────────────────────────────┘
```

Degraded state:
```
Players online (?)
┌─────────────────────────────────────┐
│ Presence unavailable                │
│ Presence data is not connected.     │
└─────────────────────────────────────┘
```

## Constitution Alignment

| Principle | Alignment |
|-----------|-----------|
| **I. Type Safety** | All new types are `readonly`, no `any`, branded primitives for `RosterRevision`. Strict TypeScript. |
| **II. Server-Authoritative** | Roster is server-maintained; client renders what it receives. No client-to-server roster mutations. |
| **III. Tested Logic** | ≥80% coverage on roster logic (status derivation, anti-flap, revision gating, delta merge). |
| **IV. Specs as Documentation** | This plan + spec serve as the documentation; manual page added per FR-021. |
| **V. Simplicity** | No privacy enforcement machinery (payload is `{handle, status}` by construction). No persistence. In-memory only. |
| **VI. Accessibility** | Keyboard navigation, screen reader live region, WCAG 2.2 AA contrast. |
| **VII. Self-Hostable** | In-memory only, no external services, single-process compatible. |

## Key Decisions

### D1: Roster lives in LobbyService, not a separate module

**Decision**: The roster state (map + revision + debounce timers) lives directly in `LobbyService` alongside the existing `presence` and `ledger` maps.

**Rationale**: The roster derives from the same `presence` map that already tracks match associations. A separate module would require either duplicating that data or creating a cross-module dependency. Keeping it in the facade follows the existing pattern (single projection path).

### D2: RosterRevision is independent from LobbyRevision

**Decision**: A separate `rosterRevision` counter tracks roster state independently from `revisionCounter` (lobby snapshot revisions).

**Rationale**: The spec requires it (FR-004). Roster changes and lobby snapshot changes are orthogonal — a roster status change doesn't affect the match list, and vice versa. Coupling them would cause unnecessary snapshot broadcasts on roster-only changes.

### D3: Delta-then-snapshot model (not snapshot-only)

**Decision**: The server sends `rosterDelta` for incremental changes and periodic full `roster` snapshots. Deltas do NOT carry removals — stale entries persist until the next full snapshot.

**Rationale**: Per FR-003, this keeps deltas small and simple. Clients merge deltas by applying changes; a full snapshot replaces the entire local roster. This matches the lobby snapshot pattern (full replacement on subscribe, deltas in between would be an optimization but the lobby uses full snapshots everywhere — the roster improves on this by using deltas for the common case of small incremental changes).

### D4: Anti-flap uses per-player setTimeout coalescing

**Decision**: Each player gets a debounce timer. When a status change arrives within the grace window, the timer is reset. Only the final state is broadcast when the timer fires.

**Rationale**: Simple, well-understood pattern. No external dependencies. The timer is cleared on player removal. The grace window is tunable (default 500ms per FR-011).

### D5: Console roster state extends existing LobbyState

**Decision**: Add `roster: RosterState` to `LobbyState` and new `LobbyAction` variants for roster events. The reducer handles them.

**Rationale**: Follows the existing pattern. The roster is lobby-scoped UI state, not match state. It belongs in the lobby reducer alongside snapshot and identity handling.

### D6: RosterCard uses design system primitives

**Decision**: The roster card uses `EuropaCard`, `EuropaBadge`, and standard CSS classes from `@europa/design`.

**Rationale**: Consistent with the existing lobby components (identity card, create form, match list all use design system primitives).

## File Impact Map

### New Files

| File | Package | Purpose |
|------|---------|---------|
| `specs/023-lobby-roster/contracts/roster-wire.md` | spec | Wire contract definition |
| `packages/console/src/ui/lobby-roster-card.tsx` | console | Roster UI component |
| `packages/console/tests/unit/lobby-roster-card.test.tsx` | console | Component tests |
| `packages/console/tests/a11y/lobby-roster-card.test.ts` | console | Accessibility tests |
| `packages/matchmaking/tests/unit/roster.test.ts` | matchmaking | Server roster logic tests |
| `docs/manual/roster.md` | docs | Player manual roster page |

### Modified Files

| File | Package | Change |
|------|---------|--------|
| `packages/networking/src/contracts/network-types.ts` | networking | Add `RosterEntry`, `RosterSnapshot`, `RosterDelta`, `RosterRevision`, `RosterStatus` types; extend `LobbyEvent` union with `roster` and `rosterDelta` variants |
| `packages/matchmaking/src/contracts/lobby-types.ts` | matchmaking | Mirror the same roster types and `LobbyEvent` extensions |
| `packages/matchmaking/src/internal/lobbyService.ts` | matchmaking | Add roster state, status derivation, anti-flap logic, broadcast methods, integrate into existing funnels |
| `packages/console/src/net/ws-lobby-client.ts` | console | Handle `roster`/`rosterDelta` lobby events, add `onRoster` subscriber |
| `packages/console/src/state/lobby-state.ts` | console | Add `RosterState` to `LobbyState`, roster-related `LobbyAction` variants |
| `packages/console/src/state/lobby-reducer.ts` | console | Handle roster actions in the reducer |
| `packages/console/src/ui/lobby-landing.tsx` | console | Render `RosterCard` in the lobby sidebar |
| `docs/manual/index.md` | docs | Link to roster page |
| `README.md` | root | Mention roster in lobby section |
| `packages/networking/tests/.../conformance.test.ts` | networking | Verify roster types are mirrored correctly |
| `packages/matchmaking/tests/.../lobby-conformance.test.ts` | matchmaking | Verify roster types match networking |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Anti-flap timer leak on rapid connect/disconnect | Timer is cleared on player removal; `close()` clears all timers |
| Roster events arriving before identity is set | Client renders all known players; "(you)" only shows when own handle is known (spec edge case) |
| Handle change mid-game | Server updates entry in-place, preserves status (spec edge case) |
| Stale delta entries persist until full snapshot | Full snapshot every 60s or 20 deltas (FR-005); acceptable latency for v1 |
| Private match participants in roster | They appear with status only, no match ID (FR-010) — by construction, payload is `{handle, status}` |
