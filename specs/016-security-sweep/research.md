# Research — 016 Security Sweep (Phase 0)

Research grounding for `plan.md`. Every code claim below was verified live in the working tree on 2026-10-11 (same evidence basis as the Gate 1 ledger; D8 records the stale issue paths).

## 1. Current-state findings (verified)

### #146 — guest-identity bearer path

- `packages/matchmaking/src/internal/identityRegistry.ts:328` — `restoreIdentity(claim)` restores a grace-window identity from a **bare id** (`claim.guestPlayerId`), no proof object. This is the shipped non-conformance with spec 006 FR-016 that the resume secret fixes.
- `packages/matchmaking/src/internal/lobbyService.ts:998` — `onSeatReconnected` calls `registry.restoreIdentity({ guestPlayerId: guestId })`; :1098 — `establishIdentity` passes the client claim straight through; :1078–1109 — connection binding/overwrite logic (F-8).
- Registry is pure-by-injection: `IdentityRegistryDeps { randomId?, now?, graceMs? }` (line 66–85); `projectIdentity` returns `IdentityState` (line 200) and never carries secrets today — the record shape (`guestPlayerIdentity.ts`) has no secret field.
- No pre-seat bearer exists anywhere: `ws-lobby-client` issues no session token; seat tokens cannot pre-exist a claim (Gate 1 DEFENSED #1/#7). The resume secret is the minimum viable proof object.
- Two canonical contract mirrors declare `GuestIdentityClaim` / `IdentityState`: `packages/networking/src/contracts/network-types.ts:688/706` and `packages/matchmaking/src/contracts/lobby-types.ts:114/143`. The console imports the matchmaking mirror.
- Directed identity delivery: `networking/src/server.ts:848` `handleLobbyIdentity` → `facade.establishIdentity(claim, connectionId)`; the facade's directed `identity` event is itself the confirmation. `setHandle` (server.ts:865) also emits a directed `identity` event — the secret must ride only the establishment emission.
- Client storage: `packages/console/src/net/lobby-storage.ts` persists `{ guestPlayerId, handle }` under `europa:lobby:identity:v1` with a strict shape guard that projects to the canonical shape (extra keys stripped) — so the secret needs an explicit field, not pass-through.
- Client claim mechanics: `ws-lobby-client.ts` — `ensureClaim()` (:562) restores from storage, `adoptServerGuestId()` (:621) adopts the directed event's id, `wireClaim()` (:648) builds the advisory wire claim, `invalidateClaim()` (:600) clears on expiry/restart. All four are the #146 touch points; the secret rides the same paths atomically with the id.
- **`applyIdentity` runs on EVERY directed identity event** (`ws-lobby-client.ts:1066–1109`): adopts the id (`:1082`) and rebuilds + persists `currentClaim` from the event (`:1083–1086`). The rename path's event (`lobbyService.ts:1165`) carries id + handle and (by design) no secret — so the claim rebuild must carry the stored secret forward when the event lacks one, or a routine rename wipes it (plan AD-9/Q1a pin).
- **Establishment emission composition** (`lobbyService.ts:1109–1122`): the directed event is `withOwnerId(projected, activeId)` built from `projectIdentity()` — structurally secret-free — so the secret must be composed in explicitly on every establishment outcome (mint / restore successor / F-8 refresh) via an internal-only registry accessor (plan AD-11).
- **F-8 same-connection refresh** (`lobbyService.ts:1084–1093`): id-only claim on the already-bound active identity keeps the binding and never calls `restoreIdentity`; authority is the connection binding. Pinned today by `tests/unit/lobby.facade.test.ts:264–278` (no spurious grace) and `:245–262` (different-identity overwrite releases to grace); the id-only grace-restore test at `:201–206` flips to mint-fresh under the sweep.
- Privacy tooling exists: `specs/010-public-lobby-match-browser/check-documentation-privacy.mjs` already denies credential names/examples — extend, don't rebuild.

### #152 — console WebSocket robustness

- Sync-throw send paths confirmed: `ws-match-client.ts:292` (`sendEnvelope` throws when `socket === null`; returns seq for ack correlation), `ws-lobby-client.ts:762` (void `sendEnvelope`).
- Module-global mutable state confirmed: `client.ts:111 let nextWireSeq = 0`, `ws-lobby-client.ts:390 let lastCapturedSeatSessionToken` (a bearer credential readable across instances — the isolation bug).
- Inbound dispatch: `ws-match-client.ts` `dispatchInbound` casts payloads after a type switch (:309+); nested `lobbyEvent` validation lives with the lobby client's event handling — structural validation must precede all of it (FR-032).
- **Establish-timeout asymmetry (Gate 2 verified)**: `ws-lobby-client.ts` already arms an epoch-guarded establish timer in `startAttempt` (`:857–863`) via its injected `scheduler.setTimeout`, keyed to `actionTimeoutMs` (`:248`, default 10_000 at `:111`); `ws-match-client.ts` has **no** establish timeout and **no** timer seam at all — bare `setInterval`/`clearInterval` for the heartbeat (`:203`/`:225`). FR-031's real work is the match client; the lobby client needs rekeying/documentation only (plan AD-8).
- `consoleStatusFromConnectionState` lives at `net/connection.ts:48`; establish-timeout and `never`-sink work lands beside it and in the two client factories (both already carry an injectable scheduler seam for timers).
- Rehydration: `net/rehydrate-wire-views.ts` — copy-on-write discipline already the stated intent; FR-035 pins the no-op path to reference-identity returns, testable with zero allocations asserted by identity equality.
- `PENDING_ORDERS_CAP = 64` (`state/reducer.ts:77`) is the documented cap the seq→actionId map must be consistent with (FR-029 wording: "consistent with the reducer's pending-order cap discipline").

### #129 — routing/debug seams

- Core bug live: `packages/console/src/main.tsx` `bootstrapProductionRoute` calls `stripProductionQuery()` (line 101) **before** `resolveLobbyServerUrl(window.location.search, …)` (line 108); the test-match path also strips (line 78). The E2E suite passes only because the init script patches `history.replaceState` to preserve the query.
- `guardReplaceStateUrlArgument` (line 191) is a production monkey-patch whose entire job is to neutralize the same init script's "undefined"-URL bug — production code compensating for test infrastructure.
- `window.__europaLobby` installed unconditionally in production bootstrap (line 124); a second installer in the (dead) `internal/lobby-runtime.tsx:159`.
- Four E2E specs consume the handle: `lobby.spec.ts:213`, `identity-migration.spec.ts:198`, `shareable-links.spec.ts:159`, `spectator-sidebar.spec.ts:169`. The history-patch init script lives in **five specs / six definitions in two semantic variants** (Gate 2 correction): preserve-ws-only (`routing.spec.ts:33`, `lobby.spec.ts:64`, `shareable-links.spec.ts:39`, `spectator-sidebar.spec.ts:55` — replaces the target query with the live `?ws=`) and merge (`routing.spec.ts:57`, `identity-migration.spec.ts:82` — merges `?ws=` with the target's existing params so `returnTo` round-trips survive).
- `internal/live-runtime.tsx:95–97` still reads `?match=`/`?name=`/`?token=` as seam fallbacks — the `?token=` arm is the bearer-in-URL prohibition (spec 013 FR-016).
- `mountLobbyRuntime` (`internal/lobby-runtime.tsx:140`) is a dead **export** (no importer of that name), but the **module is live**: `MatchLegHost` is imported by `routing/route-tree.tsx:33` and three match routes (`match-adaptive-route.tsx:19`, `match-join-route.tsx:30`, `match-spectate-route.tsx:30`). Only the export dies; the module stays. *(Gate 2 correction — the earlier "no importer besides a doc mention" claim was export-level only and wrongly implied the module might be orphaned.)*
- Divergent `returnTo` validators: `ui/profile-url.ts` (canonical, single decode) vs `routing/search-params.ts:32–74` (double-decode divergence) — FR-034 single-sources them.
- Barrel: `index.ts:217` re-exports the `@internal`-tagged `ConsoleRuntime` **interface** as `ConsoleRuntimeContract`; the `ConsoleRuntime` **class** value export at `index.ts:28` is NOT `@internal` and stays. `@internal` helpers also sit in `contracts/console-to-networking.ts:379/392`.
- `CONSOLE_API_VERSION = '0.4.1'` at `contracts/console-types.ts:114`; conformance pin at `tests/integration/contract-conformance.test.ts:352`. No in-repo consumer imports the barrel's removed exports; package is `private: true` — the breaking-surface bump is contractual, not practical (D5).

## 2. Prior art in this repo (precedents we copy)

- **Additive wire fields without version bump**: `detail` (004 v1.3) and `guestPlayerId` (006 v1.6 / 010 Clarifications v1.6). Both are optional, absent-tolerant, and never widened into snapshots. The resume secret follows the identical ruling (D4, PO-confirmed).
- **Directed, owner-only event delivery**: the v1.6 directed `identity` event that already delivers `guestPlayerId` — the secret reuses this channel verbatim (004 FR-026).
- **CSPRNG minting via Web Crypto with injectable test seam**: `packages/matchmaking/src/crypto.ts` (browser-safe `randomUUID`/`getRandomValues`) consumed by `sessionToken.ts:52` and idGen; registry's `randomId` dep shows the injection pattern. The resume secret copies it (`randomSecret` dep, default `randomUUID()`).
- **Bearer-token handling/redaction**: the client's `knownIdentityClaims` redaction choke point and `REDACTION_MARKER` in `lobby-storage.ts`; the secret registers the same way.
- **Single-seat supersession**: spec 004 edge case (second claim with valid seat token closes the old socket) — D2's active-supersession semantics reuse it unchanged.

## 3. External research (why these shapes)

- **Secret format**: UUIDv4 via Web Crypto gives 122 bits of entropy; OWASP's secret-entropy floor for session-like secrets is ≥64 bits, and the repo already ships session/reconnect/seat tokens in exactly this format. A longer custom format (32-byte hex/base64url) would add a second token convention for no threat-model gain — rejected under constitution V. Rotation (D3) bounds replay to one epoch regardless of format.
- **Rotation ordering**: the verify→reactivate→rotate→deliver order is the standard "rotate-then-notify" pattern; its failure mode (notify lost) degrades to "old credential dead, client re-onboards" — never lockout, because the server never requires a secret it did not just deliver. The drop-mid-restore test (plan AD-1) is the regression that pins it.
- **Playwright `addInitScript`**: runs in every frame before any page script on each navigation — the exact pre-load semantics spec 015 v1.1 requires for the sentinel; no timing race with `main.tsx` module evaluation (both are before-first-script, init script first).
- **`history.replaceState` native semantics**: a missing URL argument means "keep current URL" — the init script fix (plan AD-5) restores native semantics instead of relying on production code to compensate.
- **No new dependencies**: nothing in this sweep needs a validation library; structural guards in the clients are hand-rolled in the codebase's existing style, and Web Crypto ships everywhere we target.

## 4. Deferred-item resolutions (Gate 1 ledger → plan)

| Ledger item | Resolution | Plan home |
|---|---|---|
| Secret-rotation ordering / stranding | verify→reactivate→rotate→deliver; worst case = accepted mint-fresh churn; drop-mid-restore test at registry + lobbyService level | AD-1 |
| Sentinel implementability + 4-spec migration | `window.__europaTestOptIn`, settable pre-load via `addInitScript`; all four specs migrate in the same change set with one init-script line each | AD-3 |
| FR-028 void-send wording | promise-returning sends reject; void sends log and never throw; one-sentence precision added to unshipped 005 v1.11 | AD-4 |
| `guardReplaceStateUrlArgument` fate | DELETE; fix the init script to tolerate the two-arg `replaceState` call; AC-018 proves `?ws=` with no patch | AD-5 |

## 5. Open items deliberately left to implementation

- Exact structural-validator shape for inbound frames (FR-032): reuse/extend whatever guard helpers exist in `net/` rather than introducing a schema library — decision at implementation time, constrained by "drop, don't sever" and "no `any`".
- ~~Whether deleting `mountLobbyRuntime` orphans `internal/lobby-runtime.tsx`~~ — **resolved at Gate 2**: the module has four live importers of `MatchLegHost` (`route-tree.tsx:33`, `match-adaptive-route.tsx:19`, `match-join-route.tsx:30`, `match-spectate-route.tsx:30`); only the `mountLobbyRuntime` export is deleted, the module is kept (its `EuropaLobbyHandle` type stays put; the sentinel gate lives in `main.tsx`).
