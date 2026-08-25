# Contract: Lobby Types and Events

These TypeScript-flavored shapes are the source of truth for the implementation
and must be mirrored wherever the repository keeps contract copies.

```ts
export type GuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };
export type LobbyRevision = number & { readonly __brand: 'LobbyRevision' };
export type LobbyActionId = number & { readonly __brand: 'LobbyActionId' };
export type LobbyStatus = 'waiting' | 'in_progress';

export interface GuestIdentityClaim {
    readonly guestPlayerId?: GuestPlayerId;
    readonly handle?: string;
}
export interface IdentityState {
    readonly handle: string | null;
    readonly hasIdentity: true;
}
export interface PublicLobbyEntry {
    readonly matchId: MatchId;
    readonly seatsFilled: number;
    readonly capacity: 2 | 3 | 4;
    readonly status: LobbyStatus;
    readonly boardSize: number;
    readonly tickIntervalMs: number;
}
export interface LobbySnapshot {
    readonly revision: LobbyRevision;
    readonly entries: ReadonlyArray<PublicLobbyEntry>;
    readonly activeMatchId: MatchId | null;
}
export type LobbyErrorCode =
    | 'identity_invalid'
    | 'handle_invalid'
    | 'handle_taken'
    | 'match_not_found'
    | 'match_full'
    | 'match_not_joinable'
    | 'identity_in_match'
    | 'identity_expired'
    | 'server_restarted'
    | 'internal_error';

export type LobbyEvent =
    | { readonly kind: 'identity'; readonly identity: IdentityState }
    | { readonly kind: 'snapshot'; readonly snapshot: LobbySnapshot }
    | { readonly kind: 'actionAccepted'; readonly actionId: LobbyActionId; readonly transition: 'waiting' | 'match' }
    | { readonly kind: 'error'; readonly actionId?: LobbyActionId; readonly code: LobbyErrorCode; readonly message: string };
```

`MatchId` is imported from networking/matchmaking. No shape in this document
contains a guest ID in a public projection; the claim is input only.
