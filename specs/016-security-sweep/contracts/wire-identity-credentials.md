# Contract: Wire identity credentials (resume secret)

Covers 004 FR-026/FR-027, 006 FR-018, 010 FR-040…FR-043. Mirrors: `packages/networking/src/contracts/network-types.ts` + `packages/matchmaking/src/contracts/lobby-types.ts` (identical text, changed together).

## Interface deltas

```ts
interface GuestIdentityClaim {          // client→server, `lobbyIdentity` payload
    readonly guestPlayerId?: GuestPlayerId;
    readonly handle?: string;
    readonly resumeSecret?: string;     // restore proof; absence = advisory id-only claim
}

interface IdentityState {               // server→client, directed `identity` LobbyEvent
    readonly handle: string | null;
    readonly hasIdentity: true;
    readonly guestPlayerId?: GuestPlayerId;
    readonly resumeSecret?: string;     // present ONLY on establishment delivery to the owner
}
```

## Behavioral contract

| # | Rule | Source |
|---|---|---|
| W-1 | `NETWORK_API_VERSION` unchanged; both fields optional and absent-tolerant in both directions | 004 FR-026, D4 (PO) |
| W-2 | Secret minted server-side (Web Crypto CSPRNG), delivered only on the directed establishment `identity` event to the authenticated owner's single connection | 004 FR-026, 010 FR-040 |
| W-3 | Id-only claim → advisory: mint fresh; never restore/rename/release/evict/displace/force; establishment never fails | 004 FR-027, 006 FR-018 |
| W-4 | Grace restore / rename / leave require matching `resumeSecret` OR an existing server-bound session/reconnect/seat bearer | 006 FR-018, 010 FR-040/FR-043 |
| W-5 | Active holder superseded only by matching secret; supersession = secret rotation + immediate eviction of the lobby binding and spectator subscription (the rotation locks the old holder out of every future restore). **2026-10-12 layering ruling (supersedes the earlier "superseded socket closes" wording)**: socket severing stays the match-server's single-seat re-claim semantic, out of the lobby facade's reach; the old client learns it lost from the `identity_invalid` → `superseded` "session moved elsewhere" notice, not from socket closure | 010 FR-041, D2 (delivery amended 2026-10-12; 006 FR-018 / 010 FR-041 dated sub-entries) |
| W-6 | Secret regenerated on every successful restore (single-epoch); ordering: verify → reactivate → rotate → deliver; lost delivery degrades to mint-fresh, never lockout | 006 FR-018, D3, plan AD-1 |
| W-7 | Rename/leave with only an id credential (correct or not) → existing recoverable error, no ID-existence disclosure | 010 FR-043, 004 FR-016 |
| W-8 | Secret never appears in snapshots, roster events, public projections, labels, URLs, logs, diagnostics, or documentation examples | 004 FR-026, 006 FR-018, 010 FR-042 |
| W-9 | Establishment-path identity events carry the record's **current** secret in all three outcomes (mint → new; claim restore → rotated successor; F-8 same-connection refresh → unchanged current); rename-path identity events carry none. Event carries a secret ⟺ establishment path (plan AD-11) | plan AD-11 (Gate 2 Q1b) |
| W-10 | F-8 carve-out: an id-only claim on the connection already bound to that same ACTIVE identity is a no-op refresh governed by the binding — mutates nothing, never reaches `restoreIdentity`, delivers the current secret unchanged, no rotation; every other id-only claim mints fresh per W-3. Approved spec text (PO ruling D10; 004 FR-027 / 006 FR-018 dated 2026-10-11 entries; mirrors manifest A-02/A-09) | plan AD-11 (Gate 2 Q1b), D10 |

## Server-side interfaces

```ts
// identityRegistry deps (addition)
interface IdentityRegistryDeps {
    readonly randomId?: () => string;
    readonly randomSecret?: () => string;   // NEW — default randomUUID() (crypto.ts)
    readonly now?: () => number;
    readonly graceMs?: number;
}

// registry surface (additions/changes)
restoreIdentity(claim: GuestIdentityClaim | undefined): IdentityRestoreOutcome;
    // claim-based path: grace restore requires claim.resumeSecret === record.resumeSecret;
    // success rotates the record's secret and returns the successor for delivery
reactivate(id: GuestPlayerId): boolean;     // NEW: grace→active, server-internal only (plan AD-2)
resumeSecretOf(id: GuestPlayerId): string | undefined;  // NEW: internal-only read for the
    // establishment emission (plan AD-11); never flows through projectIdentity/projections
projectIdentity(id): IdentityState | undefined;   // structurally secret-free
```

## Conformance pins

- Contract round-trip: both optional fields serialize/deserialize; absent claim restores nothing.
- `NETWORK_API_VERSION` literal unchanged (existing networking conformance tests).
- Establishment event carries the record's current secret in all three outcomes (mint / restore successor / F-8 refresh — W-9); rename event carries none (unit test on the lobbyService emission).
- Registry: id-only claim never restores; matching secret restores and rotates; stale secret after rotation mints fresh; drop-mid-restore sequence (plan AD-1).
- F-8 carve-out stays green: `lobby.facade.test.ts:264–278` and `:245–262` unchanged; the id-only grace-restore test at `:201–206` flips to mint-fresh (it presents a bare id from a NEW connection — W-3 territory).
