# Data Model — 016 Security Sweep (Phase 1)

Shapes changed by the sweep. Wire contracts live canonically in `packages/networking/src/contracts/network-types.ts` with the matchmaking mirror in `packages/matchmaking/src/contracts/lobby-types.ts`; both MUST change together (004 FR-026).

## 1. Server-internal: `GuestPlayerIdentity` (matchmaking registry record)

```ts
// packages/matchmaking/src/internal/guestPlayerIdentity.ts
interface GuestPlayerIdentity {
    readonly id: GuestPlayerId;          // unchanged — non-secret correlation id
    handle: string | null;               // unchanged
    handleKey: string | null;            // unchanged
    status: GuestIdentityStatus;         // unchanged ('active' | 'grace')
    disconnectedAtMs: number | null;     // unchanged
    readonly createdAtMs: number;        // unchanged
    /** NEW: owner-only bearer credential (006 FR-018). NEVER leaves the
     *  registry except folded into the directed establishment event. */
    resumeSecret: string;
}
```

- Minted in `mintIdentity()` from the injected `randomSecret` dep (default `randomUUID()` from `packages/matchmaking/src/crypto.ts`); regenerated on every successful claim-based restore (D3, single-epoch).
- `projectIdentity()` and every snapshot/roster projection are structurally secret-free: they are built from selected fields, not from the record.
- New registry accessors: `reactivate(id: GuestPlayerId): boolean` — grace→active for server-internal paths that have ALREADY verified a bearer credential upstream (seat reconnect, `lobbyService.onSeatReconnected`). No secret check; authority source documented at the definition (plan AD-2). Not reachable from any client claim. And `resumeSecretOf(id): string | undefined` — internal-only read used solely to compose the secret into the establishment emission (plan AD-11); never returned through `projectIdentity` or any projection.

## 2. Wire: additive optional fields (004 FR-026 — no `NETWORK_API_VERSION` bump)

```ts
// network-types.ts AND lobby-types.ts — identical additions
interface GuestIdentityClaim {
    readonly guestPlayerId?: GuestPlayerId;
    readonly handle?: string;
    readonly resumeSecret?: string;      // NEW — restore proof (client→server)
}

interface IdentityState {
    readonly handle: string | null;
    readonly hasIdentity: true;
    readonly guestPlayerId?: GuestPlayerId;
    readonly resumeSecret?: string;      // NEW — owner-only delivery (server→client)
}
```

Delivery constraints (normative, 004 FR-026 / 010 FR-040):

| Surface | `resumeSecret` allowed? |
|---|---|
| Directed `identity` event on establishment — **all three outcomes** (fresh mint → new secret; claim-based restore → rotated successor; F-8 same-connection refresh → current, unchanged secret), to the authenticated owner's connection | ✅ only here |
| Directed `identity` event on `setHandle`/rename | ❌ |
| Lobby snapshots, roster events, public projections, participant labels | ❌ |
| URLs, logs, diagnostics, documentation examples | ❌ (privacy check rejects, 010 FR-042) |
| Client→server: `lobbyIdentity` claim | ✅ when the client holds one |
| Any other client→server payload | ❌ |

**Invariant (plan AD-11)**: an identity event carries a secret ⟺ it is an establishment-path emission (composed via the internal-only `resumeSecretOf`). Rotation happens only on successful claim-based restores, so an F-8 refresh re-delivers the secret the client already holds — nothing rotates, nothing wipes. Client-side, an identity event **without** a secret must never clear a stored one; only `invalidateClaim` (server-forgot, expiry, explicit reset) clears it.

Absent-tolerant both directions: old client → server treats claim as id-only (advisory → mint-fresh); new client → old server ignores the extra field (same degradation). Id-only claims never restore, rename, release, displace, or evict (004 FR-027). Carve-out (PO ruling D10; approved spec text in 004 FR-027 / 006 FR-018 dated 2026-10-11 entries; plan AD-11): an id-only claim on the connection **already bound** to that same active identity is a no-op refresh governed by the binding — the branch mutates nothing and never reaches `restoreIdentity` (`lobbyService.ts:1084–1093`, pinned by `lobby.facade.test.ts:264`).

## 3. Client storage: `StoredLobbyClaim` (console)

```ts
// packages/console/src/net/lobby-storage.ts
interface StoredLobbyClaim {
    readonly guestPlayerId: GuestPlayerId | null;
    readonly resumeSecret: string | null;   // NEW — bearer credential (010 FR-042)
    readonly handle: string | null;
}
```

- Key unchanged: `europa:lobby:identity:v1`. The shape guard reads a missing `resumeSecret` as `null` (legacy v1 records are valid "cannot restore" states — mint-fresh, identical to today's degradation). Plan AD-9.
- `resumeSecret` is `null` until the directed `identity` event delivers one; adoption overwrites the `{ guestPlayerId, resumeSecret }` pair **only when the event carries a secret** (a delivered secret always supersedes the stored one, single-epoch). **A secret-less identity event (e.g., the rename emission) preserves the stored secret** — `adoptServerGuestId` and the `applyIdentity` claim rebuild (`ws-lobby-client.ts:1083–1086`) carry `resumeSecret` forward unchanged; only `invalidateClaim` clears it (plan AD-9/Q1a pin). Tests: secret-less event leaves secret intact; rename → reload → restore succeeds; establishment event with secret overwrites.
- Cleared together with the identity on `invalidateClaim` (`identity_expired`, `server_restarted`, explicit forget) and on storage clear (010 FR-042).
- Never displayed, never URLed, never logged; registered in the client redaction choke point.
- Same-change-set obligation (010 data-model.md §4, constitution IV): the module JSDoc in `lobby-storage.ts` that currently mirrors §4 is updated with this shape.

## 4. Console client instance state (005 FR-033 — was module-global)

```ts
// per client instance (inside the factory closure) — NOT module scope
interface MatchClientInstanceState {
    nextWireSeq: number;                       // was client.ts module global
    pendingAcks: Map<SequenceNumber, PendingAck>; // bounded: 64 (PENDING_ORDERS_CAP-consistent)
}

interface LobbyClientInstanceState {
    lastCapturedSeatSessionToken: string | null;  // was ws-lobby-client module global — bearer
    currentClaim: StoredLobbyClaim | null;        // now carries resumeSecret (§3)
    // …existing per-instance fields unchanged
}
```

- Correlation-map discipline (FR-029): consumed on ack; pruned on correlation timeout, disconnect, teardown; cap 64 with documented eviction; late/duplicate acks never re-correlate; growth flat across N acks.
- Seat-token isolation is the security-relevant half: one instance's captured bearer must be unreadable from any other instance, existing or later-created.

## 5. State-transition deltas

| Transition | Before | After (authority) |
|---|---|---|
| Grace restore via claim | bare id → active | matching `resumeSecret` (or session/reconnect/seat bearer) → active + secret rotated + successor delivered on directed event; id-only claim → mint-fresh (006 FR-018) |
| Active-holder supersede | — (impossible via claim) | matching `resumeSecret` only; id-only claim → mint-fresh, incumbent untouched (010 FR-041). **2026-10-12 layering ruling (supersedes the earlier "old socket closed as single-seat re-claim" wording, D2)**: delivery is secret rotation + immediate lobby-binding/spectator-subscription eviction — the rotation locks the old holder out of future restores; socket severing stays the match-server's single-seat semantic, and the old client learns it lost from the `identity_invalid` → `superseded` "session moved elsewhere" notice, not from socket closure. Landed in 006 FR-018 / 010 FR-041 dated sub-entries |
| Seat reconnect reactivation | `restoreIdentity({guestPlayerId})` | `reactivate(id)` — authority is the upstream-verified seat credential, not the id (plan AD-2) |
| Rename / leave | connection-binding proof | unchanged binding proof OR presented resume secret; id-only credential rejected with existing recoverable error, no ID-existence disclosure (010 FR-043) |
| Same-connection refresh (F-8): id-only claim on the connection already bound to that active identity | keeps binding, mints nothing | UNCHANGED — no-op refresh governed by the connection binding, never reaches `restoreIdentity`; establishment event re-delivers the record's current secret, no rotation (plan AD-11; pinned by `lobby.facade.test.ts:264`; carve-out approved by PO ruling D10 and landed in 004 FR-027 / 006 FR-018 dated 2026-10-11 entries, mirrored by manifest A-02/A-09) |
| Establish (first visit / post-expiry) | mint + deliver id on directed event | mint + deliver `{ id, resumeSecret }` on directed event (all establishment outcomes carry the record's current secret — plan AD-11); establishment never fails (004 v1.6 rule) |
