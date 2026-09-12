# Contract: Mounted Canonical Router Handoffs

Create, join, spectate, and share-link flows must invoke the mounted TanStack
Router route tree. They must not mutate `window.history` or bypass the route
context to mount a legacy direct-match runtime.

## Canonical outcomes

| Intent | Canonical path | Mounted view |
| --- | --- | --- |
| Create and enter match | `/match/<matchId>` | Player match route |
| Join share link | `/match/<matchId>` | Player match route after identity/session readiness |
| Spectate | `/match/<matchId>/spectate` | Read-only spectator view |
| Unnamed identity | `/profile?returnTo=...` | Profile route; return path is pathname-only and safely decoded |

Acceptance tests must assert both the final pathname and the mounted component,
including the deferred-ready/name resolution behavior. A universal ID in state or
URL must not be treated as authorization; the mounted flow still obtains the
server-bound session/reconnect proof.
