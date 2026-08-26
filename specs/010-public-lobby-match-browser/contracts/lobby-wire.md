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

The `error` variant of `LobbyEvent` carries an optional machine-readable
`detail` record alongside its `code` and human-readable `message`
(additive ruling of 2026-08-25; see spec Clarifications v1.3):

```ts
{
    readonly kind: 'error';
    readonly actionId?: LobbyActionId;
    readonly code: LobbyErrorCode;
    readonly message: string;
    readonly detail?: Readonly<Record<string, string | number | boolean>>;
}
```

`detail` mirrors matchmaking's `LobbyError.detail` verbatim (field name →
message/value) so validation failures can name the offending fields (US3
AC-4 field-specific feedback). Clients render actionable text from `code`
plus `detail` and MUST tolerate `detail` being absent (older servers, or
codes that need no specifics).

The server sends a complete `LobbySnapshot` on subscribe and after each
mutation/lifecycle event. Clients apply only snapshots with a newer revision.
Unknown additive lobby events are ignored by older clients; incompatible edits
require the existing version policy and conformance updates.

Handshake gating: lobby frames are exempt from the greeted-state gate — every
`LobbyMessageKind` is valid before the `hello`/`helloAck` handshake, so a
freshly opened connection can establish identity immediately. Identity
bootstrap necessarily precedes the gameplay handshake, and no credentials
are at risk before a match seat exists. Per-frame envelope version
validation still applies to every lobby frame: cross-boundary version drift
is rejected with `version_mismatch` exactly as for any other frame.
`joinMatch` alone remains greeted-gated.
