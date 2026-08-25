# Contract: Lobby WebSocket Messages

Additive messages use the existing `ProtocolEnvelope`; the implementation must
extend the closed discriminated union and both canonical contract copies in one
change. Existing gameplay messages retain their current payloads.

```ts
type LobbyMessageKind =
    | 'lobbyIdentity'
    | 'lobbySetHandle'
    | 'lobbySubscribe'
    | 'lobbyCreate'
    | 'lobbyJoin'
    | 'lobbySpectate'
    | 'lobbyLeave'
    | 'lobbyEvent';

interface LobbyIdentityPayload { readonly claim?: GuestIdentityClaim }
interface LobbySetHandlePayload { readonly handle: string; readonly actionId: LobbyActionId }
interface LobbySubscribePayload { readonly actionId: LobbyActionId }
interface LobbyCreatePayload {
    readonly actionId: LobbyActionId;
    readonly settings?: Partial<MatchSettings>;
}
interface LobbyJoinPayload { readonly actionId: LobbyActionId; readonly matchId: MatchId }
interface LobbySpectatePayload { readonly actionId: LobbyActionId; readonly matchId: MatchId }
interface LobbyLeavePayload { readonly actionId: LobbyActionId }
interface LobbyEventPayload { readonly event: LobbyEvent }
```

Identity is established before mutating actions. The server resolves the active
identity from connection/session state; any client-supplied ID, handle in a
match join, seat number, or role override is advisory and cannot override it.
Successful create/join returns the existing session assignment through the
existing match join flow; successful spectate returns the existing spectator
view. Errors stay on the socket, are actionable, and do not close a healthy
lobby connection unless existing protocol policy requires it.

The server sends a complete `LobbySnapshot` on subscribe and after each
mutation/lifecycle event. Clients apply only snapshots with a newer revision.
Unknown additive lobby events are ignored by older clients; incompatible edits
require the existing version policy and conformance updates.
