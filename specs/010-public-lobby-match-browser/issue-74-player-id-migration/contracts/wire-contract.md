# Contract: Breaking Gameplay Wire Identity

## Version boundary

The networking API major version is bumped for the numeric-to-string break.
Version validation runs before payload interpretation. A numeric-client envelope,
old-major envelope, or malformed version is rejected with the existing protocol
error/close semantics. There is no mixed-version compatibility shim.

## Identity fields

All gameplay `playerId`, winner, owner, seat-assignment, order-attribution,
snapshot, delta, event, and reconnect-association fields carry canonical
12-character IDs. Nullable spectator identity remains `null` where specified.
Client-provided IDs are advisory only; the server resolves the authoritative
identity from the session/reconnect binding.

`sessionToken` and `reconnectToken` remain bearer credentials. They must not be
derived from IDs, logged, or accepted interchangeably with IDs.

## Ordering and validation

Server drains and broadcasts use explicit UTF-16 code-unit ordering for ID keys.
JSON numeric values in any identity field are rejected. Wire contract mirrors in
the package and spec must remain byte-identical where the repository's existing
conformance tests require it.

## Security cases

The contract tests must prove that a valid-looking ID without its bound bearer
credential cannot claim a seat, reconnect, mutate identity, submit an order,
select another player's view, evict a player, or forfeit a match.
