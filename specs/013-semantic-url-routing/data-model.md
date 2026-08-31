# Data Model: Semantic URL Routing

Routing is an in-memory, non-persistent value model. It creates no matchmaking
entity and stores no identity or transport credentials.

```ts
type MatchRouteIntent = 'adaptive' | 'join' | 'spectate';
type Route =
  | { readonly kind: 'root'; readonly pathname: '/' }
  | { readonly kind: 'lobby'; readonly pathname: '/lobby' }
  | { readonly kind: 'match'; readonly pathname: string; readonly matchId: string; readonly intent: MatchRouteIntent }
  | { readonly kind: 'unknown'; readonly pathname: string; readonly reason: RouteRejection };
type RouteRejection =
  | 'malformed-encoding' | 'empty-match-id' | 'decoded-slash' | 'unsafe-character'
  | 'wrong-segment-count' | 'unsupported-path';
```

`pathname` is the browser-visible path; `matchId` is decoded only for
authoritative lookup. Adaptive resolution may select player only for a waiting
match with an open seat, or spectator only for an in-progress match. Explicit
intents cannot be silently changed; the lobby service performs final
authorization and identity/seat association.

URL builders must produce only `origin + /lobby` or
`origin + /match/<encoded-id>[/join|/spectate]`. They must include no query,
guest ID, handle, reconnect token, or WebSocket URL. Classification is pure and
has no clock, random source, storage, or I/O.
