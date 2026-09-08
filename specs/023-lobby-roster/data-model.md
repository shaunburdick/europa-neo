# Data Model: Lobby Roster (Feature 023)

## Entities

### RosterEntry

The atomic unit of roster data. Carried by both snapshots and deltas.

```typescript
interface RosterEntry {
  readonly handle: string;      // Player's accepted display handle
  readonly status: RosterStatus; // Current presence status
}
```

**Constraints**:
- `handle` is the server-accepted handle (may be `null` until set — see Edge Cases)
- `status` is one of three values (see `RosterStatus`)
- The payload is exactly `{handle, status}` — no other fields exist by construction

### RosterStatus

```typescript
type RosterStatus = 'in_lobby' | 'in_game' | 'spectating';
```

**Derivation priority** (highest wins):
1. `in_game` — player is seated in a running or filling match
2. `spectating` — player is attached as a spectator
3. `in_lobby` — player is not in any match

### RosterRevision

```typescript
type RosterRevision = number & { readonly __brand: 'RosterRevision' };
```

**Properties**:
- Starts at 1 (first roster event)
- Increments by 1 for every roster mutation (player added, removed, or status changed)
- NEVER resets — not on server restart, not on any lifecycle event
- Carried by both `RosterSnapshot` and `RosterDelta`
- Clients discard events with revision ≤ last-seen revision

### RosterSnapshot

Full roster state sent on subscribe and periodically.

```typescript
interface RosterSnapshot {
  readonly revision: RosterRevision;
  readonly players: ReadonlyArray<RosterEntry>;
}
```

**Constraints**:
- `players` is ordered deterministically by handle (case-insensitive lexicographic)
- A full snapshot replaces the client's entire local roster unconditionally
- Sent on lobby subscribe (FR-005) and periodically (every 60s or 20 deltas)

### RosterDelta

Incremental update for individual changes.

```typescript
interface RosterDelta {
  readonly revision: RosterRevision;
  readonly changes: ReadonlyArray<RosterEntry>;
}
```

**Constraints**:
- `changes` contains entries for players whose status changed OR who were added
- Does NOT carry explicit removals — removed players are confirmed only by a subsequent full snapshot
- Clients merge deltas by applying each change (add or update)
- MUST NOT remove players absent from a delta (stale entries persist until next full snapshot)

## State Transitions

### Player Lifecycle in Roster

```
                    establishIdentity
                    ┌──────────────┐
                    │              ▼
               ┌────────────────────────┐
               │     in_roster          │
               │  (Map<GuestPlayerId,   │
               │   RosterEntry>)        │
               └───┬──────┬──────┬─────┘
                   │      │      │
        join match │      │      │ spectate match
                   ▼      │      ▼
            ┌──────────┐  │  ┌────────────┐
            │ in_game  │  │  │ spectating │
            └────┬─────┘  │  └─────┬──────┘
                 │        │        │
    leave/finish │        │        │ leave
                 │        ▼        │
                 │  ┌──────────┐   │
                 └─▶│ in_lobby │◀──┘
                    └────┬─────┘
                         │
          disconnect     │
          beyond grace   │
                         ▼
                    ┌──────────┐
                    │ removed  │
                    │ (from    │
                    │  roster) │
                    └──────────┘
```

### Roster Mutation Events

| Event | Source | Effect |
|-------|--------|--------|
| Player connects + identity established | `establishIdentity` | Add entry with `in_lobby` status |
| Player joins match | `create`/`join` in lobby | Status → `in_game` |
| Player spectates match | `spectate` in lobby | Status → `spectating` |
| Player leaves match | `leave` in lobby | Status → `in_lobby` |
| Match finishes/collected | Status bus event | Status → `in_lobby` (or removed if disconnected) |
| Player disconnects beyond grace | `connectionClosed` + grace expiry | Remove entry |
| Handle changes | `setHandle` | Update entry handle, preserve status |
| Server restart | Process restart | All entries lost; roster starts empty |

### Anti-Flap Grace Period

```
Status change at t=0:  in_lobby → in_game
  → Start debounce timer (500ms)
  → Do NOT broadcast yet

Status change at t=200ms: in_game → in_lobby  (within grace)
  → Reset debounce timer (500ms from t=200ms)
  → Still do NOT broadcast

Timer fires at t=700ms:
  → Broadcast final state: in_lobby
  → Only ONE broadcast for two transitions
```

### Revision Counter

```
Initial: rosterRevision = 0 (no events sent yet)

Player A connects:
  rosterRevision = 1
  → Send roster snapshot { revision: 1, players: [A] }

Player B connects:
  rosterRevision = 2
  → Send rosterDelta { revision: 2, changes: [B] }

Player A joins match:
  rosterRevision = 3
  → Send rosterDelta { revision: 3, changes: [{ handle: A, status: 'in_game' }] }

Periodic full snapshot (60s):
  → Send roster snapshot { revision: 3, players: [A(in_game), B(in_lobby)] }
  (revision unchanged — no mutation since last event)
```

## LobbyState Extension

```typescript
interface RosterState {
  /** Current roster entries in deterministic order. */
  readonly players: ReadonlyArray<RosterEntry>;
  /** Last-applied roster revision (stale-revision protection). */
  readonly revision: RosterRevision | null;
  /** Whether a roster snapshot has been received (false = degraded). */
  readonly connected: boolean;
}
```

Added to `LobbyState`:
```typescript
interface LobbyState {
  // ... existing fields ...
  readonly roster: RosterState;
}
```

Initial roster state:
```typescript
const INITIAL_ROSTER_STATE: RosterState = {
  players: [],
  revision: null,
  connected: false,
};
```

## LobbyAction Extensions

```typescript
type LobbyAction =
  // ... existing variants ...
  | { readonly kind: 'lobbyRosterSnapshot'; readonly snapshot: RosterSnapshot }
  | { readonly kind: 'lobbyRosterDelta'; readonly delta: RosterDelta };
```

## Roster Card Derived Data

```typescript
// Heading text
const heading = roster.connected
  ? `Players online (${roster.players.length})`
  : 'Players online (?)';

// Own entry detection
const isOwnEntry = (entry: RosterEntry) =>
  state.handle !== null && entry.handle === state.handle;

// Status display text
const statusText = (status: RosterStatus) => {
  switch (status) {
    case 'in_lobby': return 'In lobby';
    case 'in_game': return 'In game';
    case 'spectating': return 'Spectating';
  }
};
```
