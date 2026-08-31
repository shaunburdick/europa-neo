# Data Model: Public Lobby & Match Browser

## 1. Branded primitives and identity

```ts
type GuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };
type LobbyRevision = number & { readonly __brand: 'LobbyRevision' };
type NormalizedHandle = string & { readonly __brand: 'NormalizedHandle' };
```

`GuestPlayerId` is server-issued, opaque, unique among active identities, and
non-secret. It may be serialized into correlation surfaces, but never grants
authority or reveals private-match existence or fog-hidden state. The browser
may store a claim, but the server can reject it and issue a new identity.
`LobbyRevision` is monotonic for one process. `NormalizedHandle` is
trimmed and case-folded for uniqueness only.

## 2. GuestPlayerIdentity (server internal)

| Field | Type | Constraints |
| --- | --- | --- |
| `guestPlayerId` | `GuestPlayerId` | opaque UUID/random ID; immutable |
| `handle` | `string \| null` | accepted trimmed display value; 1–24 Unicode code points when present |
| `normalizedHandle` | `NormalizedHandle \| null` | unique among active identities |
| `status` | `'active' \| 'disconnected' \| 'released'` | released records are removed from the registry |
| `activeConnectionId` | `ConnectionId \| null` | at most one lobby connection; match reconnect uses existing token association |
| `currentMatchId` | `MatchId \| null` | at most one active match |
| `createdAtMs` | `number` | host boundary timestamp |
| `lastSeenAtMs` | `number` | host boundary timestamp |
| `releaseAtMs` | `number \| null` | set when grace cleanup authorizes release |

Identity relates to zero/one matchmaking `PlayerSession`, zero/one occupied
`SeatRecord`, and zero/many historical connections only through logs/events
(not retained as history). The current handle is copied into a seat projection
only as a display snapshot; authority remains the identity record.

## 3. Public projections

```ts
interface PublicLobbyEntry {
    readonly matchId: MatchId;
    readonly seatsFilled: number;
    readonly capacity: 2 | 3 | 4;
    readonly status: 'waiting' | 'in_progress';
    readonly settings: { readonly boardSize: number; readonly tickIntervalMs: number };
}
interface LobbySnapshot {
    readonly revision: LobbyRevision;
    readonly entries: ReadonlyArray<PublicLobbyEntry>;
    readonly activeMatchId: MatchId | null;
}
```

Entries include no seat token, private data, finished match, or participant list.
Guest IDs may be included where the projection explicitly needs identity
correlation; they are not credentials and do not authorize an action. Waiting
entries are joinable only when capacity remains;
in-progress entries are spectatable only. Collected matches are absent.

## 4. Client lobby state

```ts
interface LobbyClientState {
    readonly phase: LobbyPhase;
    readonly identity: { readonly handle: string | null; readonly confirmed: boolean };
    readonly snapshot: LobbySnapshot | null;
    readonly selectedMatchId: MatchId | null;
    readonly message: string | null;
}
```

The client stores `{ guestPlayerIdClaim, handle }` under a namespaced
local-storage key. It treats both as untrusted input and may display or forward
the ID for correlation. Match tokens remain in memory/session handling as
already defined by networking and must not enter unsafe URLs or logs.

## 5. State transitions and invariants

| From | Event | To | Authority/side effect |
| --- | --- | --- | --- |
| none | new connection | `identity` | server creates or restores identity |
| identity | valid handle | `ready` | atomically reserve normalized handle; broadcast snapshot |
| ready | create accepted | `waiting` | matchmaker creates and seats creator; identity association set |
| ready | join accepted | `waiting`/`transitioning` | matchmaker atomically assigns one seat |
| ready | spectate accepted | `transitioning` | networking attaches read-only spectator; no seat |
| waiting | final seat fills | `transitioning` → match | matchmaker auto-starts; lobby entry becomes in-progress/removed per contract |
| any lobby phase | leave/return | `ready` | release only this identity's association; cleanup policy applies |
| disconnected | valid reconnect token | prior phase | restore same identity/handle/seat/role |
| disconnected | grace expiry | `released` then removed | release handle and stale associations |
| any | server restart | none | all memory is lost; next connection is fresh |

Invariants: one normalized handle per active identity; one active match per
identity; seats never exceed configured capacity; client claims cannot alter
server associations; spectator has no seat/order authority; every accepted
order uses the connection's server-resolved seat; player views prefer handles
and may include non-secret IDs without changing authorization or fog filtering.

## 6. Validation and cleanup

- Trim handle, reject empty/whitespace-only, control characters, and >24 Unicode
  code points; compare normalized values case-insensitively.
- Reject duplicate handle without changing the incumbent or requester state.
- Recheck match status/capacity/identity association at action time.
- Use feature 006 empty-match/results TTL and feature 004 reconnect grace; do not
  add a lobby timer that can disagree with those authorities.
- On collection, remove lobby entry and release match association. On grace
  expiry, release identity handle only after the existing session is actually
  expired. `close()` removes all records and subscriptions.
