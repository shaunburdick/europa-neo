# Wire Contract: Lobby Roster (Feature 023)

**Feature**: 023 — Lobby Roster
**Status**: Draft
**Dependencies**: Feature 010 (lobby wire family)

## Overview

This document defines the additive wire types for the lobby roster feature. These types extend the existing `LobbyEvent` discriminated union (feature 010) with two new variants: `roster` (full snapshot) and `rosterDelta` (incremental update).

All types are additive. No existing types are modified. `NETWORK_API_VERSION` is NOT bumped.

## New Types

### RosterStatus

```typescript
/**
 * Player presence status in the lobby roster.
 * Derived server-side from the player's current match association.
 */
type RosterStatus = 'in_lobby' | 'in_game' | 'spectating';
```

### RosterRevision

```typescript
/**
 * Monotonic roster revision counter. Starts at 1, increments by 1
 * for every roster mutation. NEVER resets (not on server restart,
 * not on any lifecycle event). Clients discard events with
 * revision ≤ last-seen revision.
 */
type RosterRevision = number; // branded in TypeScript
```

### RosterEntry

```typescript
/**
 * One player's presence data in the roster.
 * The payload is exactly {handle, status} — no other fields.
 */
interface RosterEntry {
  readonly handle: string;
  readonly status: RosterStatus;
}
```

### RosterSnapshot

```typescript
/**
 * Complete roster state. Sent on lobby subscribe and periodically.
 * Replaces the client's entire local roster unconditionally.
 */
interface RosterSnapshot {
  readonly revision: RosterRevision;
  readonly players: ReadonlyArray<RosterEntry>;
}
```

### RosterDelta

```typescript
/**
 * Incremental roster update. Contains entries for players whose
 * status changed or who were added. Does NOT carry removals —
 * removed players are confirmed by a subsequent full snapshot.
 */
interface RosterDelta {
  readonly revision: RosterRevision;
  readonly changes: ReadonlyArray<RosterEntry>;
}
```

## LobbyEvent Extensions

Two new variants added to the existing `LobbyEvent` discriminated union:

```typescript
// Full roster snapshot (sent on subscribe and periodically)
| {
    readonly kind: 'roster';
    readonly roster: RosterSnapshot;
  }

// Incremental roster update (sent on individual changes)
| {
    readonly kind: 'rosterDelta';
    readonly delta: RosterDelta;
  }
```

## Wire Examples

### Roster Snapshot (server → client)

```json
{
  "kind": "lobbyEvent",
  "event": {
    "kind": "roster",
    "roster": {
      "revision": 5,
      "players": [
        { "handle": "Alice", "status": "in_lobby" },
        { "handle": "Bob", "status": "in_game" },
        { "handle": "Charlie", "status": "spectating" }
      ]
    }
  }
}
```

### Roster Delta (server → client)

```json
{
  "kind": "lobbyEvent",
  "event": {
    "kind": "rosterDelta",
    "delta": {
      "revision": 6,
      "changes": [
        { "handle": "Alice", "status": "in_game" }
      ]
    }
  }
}
```

## Delivery Rules

1. **On lobby subscribe**: Server sends a complete `roster` snapshot as the first roster event.
2. **On status change**: Server sends a `rosterDelta` with the changed entry.
3. **On player join**: Server sends a `rosterDelta` with the new entry.
4. **On player disconnect**: Server sends a `rosterDelta` is NOT sent immediately — the entry persists until the next full snapshot omits it. (Removals are confirmed by full snapshots only.)
5. **Periodic full snapshot**: Every 60 seconds OR when accumulated unsent deltas exceed 20 changes.
6. **Anti-flap**: Status changes within the grace window (default 500ms) are coalesced — only the final stable state is broadcast.
7. **Audience**: Only connections that have subscribed to the lobby (existing `lobbySubscribe` gate). Gameplay-only clients never observe roster traffic.

## Client Behavior

1. **On `roster` snapshot**: Replace entire local roster. Apply revision gate (discard if ≤ last-seen).
2. **On `rosterDelta`**: Merge changes into local roster (add or update entries). Do NOT remove entries absent from delta. Apply revision gate.
3. **On reconnect**: Reset last-seen revision to 0. Accept fresh full snapshot from server.
4. **Degraded state**: If no roster snapshot received within a reasonable timeout (e.g., 5 seconds after subscribe), show "Presence unavailable".

## Compatibility

- Old clients ignore unrecognized `LobbyEvent` kinds (existing tolerance rule).
- New clients tolerate old servers that don't emit roster events (degraded state).
- No `NETWORK_API_VERSION` bump (additive change only).
- Roster events ride the existing `lobbyEvent` frame — no new message kind.
