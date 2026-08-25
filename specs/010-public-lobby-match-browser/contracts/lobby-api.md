# Contract: Server Lobby API

```ts
export interface LobbyService {
    establishIdentity(claim: GuestIdentityClaim | undefined, connectionId: ConnectionId): IdentityState;
    setHandle(connectionId: ConnectionId, handle: string): Result<IdentityState, LobbyError>;
    subscribe(connectionId: ConnectionId): Result<LobbySnapshot, LobbyError>;
    create(connectionId: ConnectionId, settings?: Partial<MatchSettings>): Result<MatchJoinTarget, LobbyError>;
    join(connectionId: ConnectionId, matchId: MatchId): Result<MatchJoinTarget, LobbyError>;
    spectate(connectionId: ConnectionId, matchId: MatchId): Result<SpectatorTarget, LobbyError>;
    leave(connectionId: ConnectionId): Result<void, LobbyError>;
    close(): Promise<void>;
}
```

`Result` is the repository's explicit success/error union. `MatchJoinTarget`
contains only the existing server-issued match/session assignment needed to enter
networking; it never accepts a client-selected seat or identity. `SpectatorTarget`
contains no player seat/token. All methods are synchronous at the state mutation
boundary except shutdown. Matchmaker bridge callbacks publish revisions after
create/fill/start/collect and reconnect/grace callbacks update identity state.

The API is intentionally not a persistence interface, account interface, or
private-match interface.
