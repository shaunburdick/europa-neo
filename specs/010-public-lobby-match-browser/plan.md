# Implementation Plan: Public Lobby & Match Browser

**Branch**: `010-public-lobby-match-browser`  
**Spec**: [spec.md](./spec.md) (approved v1.6)
**Dependencies**: 004 networking, 005 console, 006 matchmaking

## Summary

Replace the `pnpm host` auto-created match with a default landing application. A
single in-memory lobby service will own ephemeral `GuestPlayerIdentity` records,
validated unique handles, public-match projections, and the association between
identity, matchmaking session, seat, and network connection. A browser lobby
client will use a versioned WebSocket lobby protocol over the existing server;
match gameplay continues through the existing `MatchClient` and fog-filtered
protocol unchanged. The host will boot an idle stack, serve the lobby at `/`,
and retain an explicit create action rather than preparing a match.

## Technical context

- pnpm TypeScript monorepo, Node 22, strict TypeScript, Biome 2, Vitest 4,
  Playwright, existing `ws` networking transport.
- No new runtime dependency, database, account system, timer-driven simulation,
  or cloud service.
- Lobby state is process memory. Browser `localStorage` contains only the
  opaque identity claim and selected handle needed to resume a guest session;
  it is not auth.
- Existing 2-player end-to-end behavior remains the shipped path. API settings
  retain the existing 2–4 player contract.

## Constitution alignment

| Principle | Plan decision |
| --- | --- |
| I — Type safety | New public shapes are closed discriminated unions and branded IDs; no `any` or suppressions. Contract mirrors are conformance-tested. |
| II — Authoritative/deterministic | The server resolves identity, handle, seat, role, and order authority. Lobby ordering uses stable server order; simulation/tick code is untouched. |
| III — Tested logic | Identity normalization, atomic claims, lifecycle cleanup, protocol validation, and projections receive unit/concurrency tests with ≥80% coverage for new logic. |
| IV — Specs/docs | This feature's contracts are the source of truth; README, launch guidance, API notes, and applicable manual pages change in the same implementation set. |
| V — Simplicity | One lobby service and one WebSocket endpoint are preferred over a separate broker, database, or polling subsystem. |
| VI — Accessibility | Semantic forms, labelled match rows, focus management, live-region status/error announcements, keyboard-only flows, and AA contrast are acceptance gates. |
| VII — Self-hosting | `pnpm host` starts one process with an empty lobby and no cloud/persistence requirement. |

## Architecture

### 1. Lobby/identity service

Extend `@europa/matchmaking` with a server-owned identity registry and a lobby
facade. The facade creates/restores identities, validates and atomically reserves
normalized handles, delegates supported match settings to the existing
matchmaker, and projects only public data. It stores a single active match
association per identity. Existing `MatchRecord`/`SeatRecord` remain the
authoritative lifecycle records; new fields reference the identity rather than
duplicating authority.

Expected implementation areas:

```
packages/matchmaking/src/
  contracts/lobby-types.ts
  contracts/lobby-api.ts
  internal/guestPlayerIdentity.ts
  internal/identityRegistry.ts
  lobby-service.ts
  lobby-events.ts
```

Identity allocation is server-side and opaque. The client may present a stored
identity claim, but the server accepts it only when it matches its registry;
otherwise it creates a fresh identity. Handle changes update the registry and
future projections, while existing reconnect credentials continue to point to
the same identity.

### 2. Lobby transport

Add lobby messages to the existing networking contract without changing the
meaning or shape of gameplay messages. A greeted WebSocket can request identity,
set a handle, list/subscribe to public matches, create/join/spectate, leave,
and return to lobby. The server emits a complete safe lobby snapshot after
mutations and a monotonic revisioned update for create/fill/start/collect.
One connection has at most one lobby or match presence; match joins transition
to the existing networking handshake/session path. Spectator attachment uses
the existing read-only spectator path and never creates a seat.

The message handler resolves identity from server session state, never from
client-supplied seat/guest-ID fields. Gameplay `order` handling remains gated
by the resolved network seat. Lobby actions are serialized by the Node event
loop and each mutation rechecks current state immediately before assignment.

### 3. Console state and routes

Introduce a lobby state machine beside the existing console match store:
`identitySetup → lobby → waiting → joining/spectating → match → lobby` plus
recoverable `error`/`disconnected` substates. Keep the current live console
mounted for the match state; replace query-string `?live` as the default host
entry path. A route adapter may preserve direct `?live` compatibility for
existing development/test links, but normal host output contains no match ID,
seat, token, or identity in the URL.

Create a reusable lobby UI with an identity form, create form, status-filtered
public match rows, empty/loading/error states, and accessible transitions. Match
seat labels consume server-provided handles only. The lobby client persists the
opaque identity claim and accepted handle locally, never renders or places the
opaque ID in a URL.

### 4. Host and cleanup

Refactor `packages/console/scripts/host.ts` so it starts networking, matchmaking,
and the static server without `prepareMatch()`. Bind the lobby service to the
server and expose its WebSocket/API route on the existing configured endpoint.
Keep `/version`, security headers, traversal protection, graceful SIGINT/SIGTERM,
and configurable ports. Lifecycle events from matchmaking drive lobby updates;
existing lazy match GC and reconnect grace remain the cleanup authority. On
identity/session release, remove the normalized handle and association only when
the reconnect grace window has expired. `close()` clears lobby identities,
matches, subscriptions, and browser session assumptions disappear on restart.

### 5. Documentation

Update `README.md`, self-hosting/launch guidance, API/developer notes, and the
applicable manual pages (`index`, `quick-start`, `reading-the-screen`, and a
new lobby/identity page if the existing structure cannot explain the flow).
Describe handles, validation, rename behavior, match actions, reconnect,
server-authoritative association, and in-memory reset boundaries. Never use an
opaque guest ID in examples. Update the Pages workflow only if the selected
manual paths require a new path gate.

## Compatibility and migration

- Do not change `NETWORK_API_VERSION` for additive lobby messages unless an
  existing message shape changes; old gameplay clients continue to work against
  a server match endpoint.
- Preserve `HelloAck`, `JoinAck`, snapshot/tick, order ack, fog, terminal, and
  reconnect semantics. Lobby fields are additive and unknown-message tolerant.
- Keep the existing host flags and `/version` response. Change only the default
  startup behavior from prefilled match to empty lobby.
- Do not introduce private-match discovery, invitations, accounts, persistence,
  chat, ratings, history, or gameplay mechanics.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Identity spoofing or seat confusion | Server registry is the sole authority; forged identity/handle/seat fields are ignored or rejected and tested with 100 orders. |
| Lobby races | Synchronous mutation critical sections plus 10+ conflicting request tests and 50-cycle soak. |
| Stale rows | Revisioned full snapshots, mutation-triggered broadcasts, and action-time revalidation. |
| Reconnect leaks a handle or wrong seat | Reconnect credential lookup precedes association; identity and seat are cross-checked; mismatch is recoverable failure. |
| Existing live flow regresses | Keep match client/engine/fog contracts unchanged; run existing suites and two-browser create/join/spectate E2E. |
| UI becomes inaccessible during transitions | Focus target rules, semantic status/live regions, axe checks, and keyboard-only Playwright flow. |

## Planned file surface

See [tasks.md](./tasks.md) for the ordered executable list. The principal new
surface is `packages/matchmaking` identity/lobby contracts and implementation,
`packages/networking` lobby wire/server handling and browser client,
`packages/console` lobby state/UI/runtime, host refactoring, tests, docs, and
this feature's contract artifacts. No application code is changed during
phases 4–5.
