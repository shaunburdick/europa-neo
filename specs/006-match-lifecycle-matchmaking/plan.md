# Implementation Plan: Matchmaking lifecycle, TTL, capacity, and determinism — issue #147

**Branch**: `fix/matchmaking-lifecycle` (based on `main` @ `c184d54`)
**Date**: 2026-10-11
**Phase**: 4 (Plan) — **UNAPPROVED DRAFT for Gate 2**; no `tasks.md` written for this fix, no code written.
**Issue**: #147 `fix(matchmaking): correct lifecycle, TTL, capacity, and determinism` (P1, review 2026-09-10, I-16/T-11)
**Specs**: `specs/006-match-lifecycle-matchmaking/spec.md` **v1.8** (Gate 1 **PASS**, rounds 1+2 in `challenge-ledger.md`), `specs/010-public-lobby-match-browser/spec.md` **v1.13**, `specs/006-match-lifecycle-matchmaking/data-model.md` (amended v1.8)
**Supersedes**: `plan-fix-matchmaking-lifecycle.md` (the Gate-1 input draft) — refined into this file and deleted per the dispatch; note the draft was never committed (untracked), so unlike the pre-fix original `plan.md` (recoverable from git history) its text survives only inside this refined plan. Spec 010 gets no plan of its own; its v1.13 clarifications are absorbed here.

**Citation discipline**: every path, signature, and line number below was re-verified against the working tree this session (2026-10-11). Where this plan differs from the input draft's line numbers, the verified number wins and the delta is noted in §5.7.

## 1. Scope and non-goals

- **In scope**: `packages/matchmaking/src/**`, `packages/matchmaking/tests/**`, `packages/matchmaking/contracts/matchmaking-api.ts` (JSDoc only), spec artifacts for 006/010. **Scope expansions (PM rulings 2026-10-11)**: the collection-path unregister leak is folded in as **F-MM-014 / FR-024 / SC-007**, and the orphaned-session leak at terminal collection as **F-MM-015 / FR-025 / SC-008** — neither is one of issue #147's original seven findings; label them as PM-authorized expansions everywhere (issue #147 body re-read this session: ten findings F-MM-003..013, none being 014/015).
- **Forbidden** (task constraint): `packages/engine/`, `packages/console/`, `specs/001-*`. No file under `europa-source/` is read or modified.
- No TypeScript type/shape changes anywhere: error-code unions, request/result shapes, and wire payloads are untouched. Three stale timer clauses in `contracts/matchmaking-api.ts` (`:122`, `:244`, `:259-261`) are amended in the same pass (PM ruling 7, extended 2026-10-11 — see §5 D5 and §11 Q1), and one additive optional dependency field (§4).
- No new runtime dependencies; no new clock sources; no real timers in the code under test.

## 2. Verified defect status (source-audited this session)

| ID | Finding | Location (verified) | State | FR |
| --- | --- | --- | --- | --- |
| F-MM-003 | `disconnect` throws on unknown id | `src/internal/identityRegistry.ts:389-394` → `requireIdentity` `:247-254` | Open | FR-023 |
| F-MM-004 | no rebind on `restoreIdentity` outcome | `src/internal/lobbyService.ts:1084-1093` (keep-branch keeps a swept identity), `:1104` (release path → `registry.disconnect` at `:631` can throw) | Open | FR-023 |
| F-MM-005 | reconnect slice always `seat_taken` | `src/matchmaker.ts:962-972` (success arm returns `seat_taken` at `:968`) | Open | FR-019 |
| F-MM-006 | results sweep kills live rematch offer | `src/matchmaker.ts:795-821` (guards `:798-803`, no `m.rematch` check) | Open | FR-020 |
| F-MM-007 | `close()` never unregisters | `src/matchmaker.ts:1394-1403`; contract `contracts/matchmaking-api.ts:243-251` | Open | FR-021 |
| F-MM-008 | `localeCompare` roster comparator | source FIXED by #159 (`compareUtf16` at `src/internal/lobbyService.ts:536`); `tests/unit/roster.test.ts:634` expectation still locale-dependent | **Source fixed; test to correct** | spec 010 v1.13 |
| F-MM-009 | real `setTimeout` roster debounce | `src/internal/lobbyService.ts:498-506` (cancel `:493`, map `:392`, const `:192`, teardown `:1427-1432`) | Open | spec 010 v1.13 |
| F-MM-011 | unhardened `displayName` | `src/matchmaker.ts:169-175` (trim + UTF-16 `.length`); call sites `:846-856` (create), `:937-947` (join) | Open | FR-018 |
| F-MM-012 | `createMatch` skips sweeps before capacity | `src/matchmaker.ts:873-884` (`runLazySweeps()` at `:877`, check `:878-884`) | **Fixed by #154 — pin only** | FR-022 |
| F-MM-013 | `acceptRematch` bypasses `maxConcurrentMatches` | `src/matchmaker.ts:1204-1297` (record created at `:1271`, no guard) | Open | FR-022 |
| F-MM-014 *(PM-authorized expansion, NOT one of the original seven)* | collections never fire `server.unregisterMatch` → networking channel leak against its `maxConcurrentMatches` (`networking/src/server.ts:1727`; `channels.delete` exists only inside `unregisterMatch` at `:1753`; `channels.clear()` only in `server.close()` at `:1813`) | transitions without unregister: `src/matchmaker.ts:714` (rematch-window sweep, fn `:709-723`), `:761` (empty sweep, fn `:742-769`), `:813` (results-TTL sweep, fn `:795-821`), `:1098` (final-seat `leaveMatch`), `:1279` (`acceptRematch`), `:1336` (`declineRematch`); only `src/forfeit.ts:100,:106` fire it | Open | FR-024 |
| F-MM-015 *(PM-authorized expansion, NOT one of the original seven)* | terminal collections leave seated sessions bound → `stats().activePlayerSessions` (`src/matchmaker.ts:1383`, counts non-null `currentMatchId`) permanently inflates | no release at `src/matchmaker.ts:714` (fn `:709-723`) or `:1336`, nor in the all-forfeited teardown `src/forfeit.ts:91-108` (only session touch is the filling-branch unbind at `:167`); already-compliant: `:758` (empty sweep, loop `:755-760`), `:810` (results sweep, loop `:807-812`), `:1097` (final-seat leave) | Open | FR-025 |

F-MM-008 and F-MM-012 shipped after the review date (#159 2026-09-12, #154 merged 2026-09-11); both stay in scope as **pinned** requirements. #159 fixed the source but **not** `roster.test.ts:634`'s `localeCompare` expectation — corrected in this change set.

## 3. Constitution & determinism check

- **Principle II (deterministic server)**: no wall-clock reads introduced; every new time decision goes through the injected `now` (`MatchmakerDeps.now` at `contracts/matchmaking-api.ts:108-109`, default `deps.now ?? Date.now` at `src/matchmaker.ts:371`; `LobbyServiceDeps.now` at `src/internal/lobbyService.ts:311`, default at `:339`). The only global-timer call sites in package source are `lobbyService.ts:493/498/505/518/1429` (grep-verified this session — the debounce); they move behind an injected scheduler (§4). After this change: zero direct `setTimeout`/`clearTimeout`/`localeCompare` in `packages/matchmaking/src/**` except the default scheduler binding; `packages/core/tests/identity-migration-guard.test.ts:284-293` (`no-locale-compare-authoritative`) already enforces the `localeCompare` rule for runtime source.
- **All tunables in one location**: no new magic numbers. The 500 ms anti-flap window stays where feature 010 owns it (`ANTI_FLAP_GRACE_MS`, `lobbyService.ts:192`); everything matchmaker-side reads `MATCHMAKING_CONSTANTS` (`src/constants.ts:28-36`).
- **Principle III (coverage ≥80%)**: every FR-018..FR-025 branch gets a behavior-level test (§7); `packages/matchmaking/vitest.config.ts` enforces 80% lines/functions/branches/statements — merge gate.
- **Principle V (simplicity)**: no new abstractions beyond three de-duplications of existing inline logic — one text-defect classifier (shared with handle validation), one capacity guard (extracted from `createMatch`), one collection helper + one store-helper (the six sites and two loops already repeat this logic).

## 4. Seams

```ts
// 1) Existing clock — reused, no signature change.
//    MatchmakerDeps.now        (contracts/matchmaking-api.ts:108-109; default src/matchmaker.ts:371)
//    LobbyServiceDeps.now      (src/internal/lobbyService.ts:311;      default :339)

// 2) NEW, additive, optional — roster anti-flap scheduling (spec 010 v1.13, F-MM-009).
//    src/internal/lobbyService.ts, LobbyServiceDeps interface at :299-324.
export type CancelScheduled = () => void;
export type LobbyScheduler = (callback: () => void, delayMs: number) => CancelScheduled;

export interface LobbyServiceDeps {
    // ...unchanged fields...
    /**
     * Scheduler seam for the roster anti-flap window (500 ms).
     * Default: wraps the host event-loop timer (setTimeout/clearTimeout)
     * exactly as `now` defaults to Date.now. Tests inject a deterministic
     * scheduler or use fake timers.
     */
    readonly schedule?: LobbyScheduler;
}
// Default binding inside createLobbyService (near :339):
// const schedule = deps.schedule ?? ((cb, ms) => { const h = setTimeout(cb, ms); return () => clearTimeout(h); });
```

Why a scheduler seam and not the issue's suggested "injected-clock lazy flushing": 023-FR-021 requires the roster to update **within 1 second of a presence change** (spec 010); an activity-driven flush cannot bound idle-lobby latency and would silently weaken the FR. The seam removes the global-timer call site (the actual defect) with zero timing-behavior change. Recorded in spec 010 Clarifications v1.13; **PM-confirmed 2026-10-11 — lazy flushing stays rejected.**

```ts
// 3) D9 (F-MM-014 + F-MM-015) needs NO new injection: the collection helpers
//    reuse the already-injected `store`, `server` (MatchmakerDeps.server)
//    and `logger`. Two pure helpers land in src/matchLifecycle.ts
//    (store-helper precedent: propagateHandleRename at :420-448, which
//    already takes a `MatchmakerStore` — type imported at :53; forfeit.ts
//    already imports from this module at :36-37).
```

## 5. Work items (defect → concrete edit)

### D1 — F-MM-003: `IdentityRegistry.disconnect` idempotent (FR-023)

`src/internal/identityRegistry.ts`

- Interface JSDoc `:162-168`: `@throws` becomes "When the registry is closed" only; document unknown id = no-op (mirror `release`'s idempotent wording at `:170-178`).
- Impl `:389-394`: replace `requireIdentity(id)` with `const record = identities.get(id); if (record === undefined) return;` then stamp `status = 'grace'`, `disconnectedAtMs = now()`. Restart-anchor-on-alive-record semantics unchanged.
- `release` (`:396-…`), `isInGrace` (`:383-387`), `projectIdentity` already tolerant — unchanged.

### D2 — F-MM-004: rebind on the `restoreIdentity` outcome (FR-023)

`src/internal/lobbyService.ts`

- `establishIdentity` keep-branch `:1084-1093`: keep the same-connection identity only when it still exists in the registry — add `registry.projectIdentity(previous) !== undefined` to the `:1084-1089` condition. Otherwise fall through to the existing restore path (`:1094-1108`): `restoreIdentity(claim)` → `releaseConnection(connectionId)` for the stale previous (no-op-safe after D1; the call is at `:1104`, `registry.disconnect` inside `releaseConnection` is at `:631`) → `bindConnection(connectionId, identityRestore.identity.id)`.
- `onSeatReconnected` `:990-1001`: today `:997` only restores when `registry.isInGrace(guestId)` — a swept (fully released) identity leaves a ghost connection binding that later throws in `registry.setHandle` (`identityRegistry.ts:352-355` via `requireIdentity`). Add the complement branch: `guestId !== undefined && !registry.isInGrace(guestId) && registry.projectIdentity(guestId) === undefined` → explicitly release the binding (`connections.delete(connectionId); subscriptions.delete(connectionId);`) instead of leaving the ghost. When it IS in grace, keep the existing `restoreIdentity` call (`:998`).
- `releaseConnection` `:612-632` and `onSeatDisconnected` `:975-984` need no code change once D1 lands (their `registry.disconnect` calls become total).

### D3 — F-MM-005: functional `joinMatch` reconnect slice (FR-019)

`src/matchmaker.ts` — replace `:959-972` (keeps its position after the `store.getMatch` miss at `:954-957`, before the free-seat scan at `:977`):

1. `seat === undefined` → `{ ok: false, error: makeError('match_not_found') }` (unchanged, no existence leak).
2. `seat.forfeitedAtMs !== null || match.status === 'finished' || match.status === 'collected'` → `makeError('session_expired')` (the documented contract arm at `matchmaking-api.ts:152-155` that is currently unreachable).
3. Otherwise (`filling`/`running`, unforfeited) → **success**: `{ ok: true, data: { matchId, joinPath, joinUrl: joinLinks(match), seatAssignment: seatAssignmentFor(seat) } }` — `seatAssignmentFor` at `src/matchmaker.ts:502-510` works unchanged for any seat (`SeatRecord.playerId` is non-null since issue #74, `src/internal/seatRecord.ts:70-74`). No session mint (`createPlayerSession` stays on the new-join path at `:995-1005`), no seat insertion, request `displayName` not applied to the seat (validated at `:937-947` for uniform input hygiene, then ignored).
- Ordering note (Gate-1 row 7 follow-up, non-blocking): displayName validation runs BEFORE the reconnect slice today; D3 preserves that order deliberately (invalid input is rejected on every path).
- `seat_taken` is no longer produced anywhere in `src/`; it stays in `MatchmakerErrorCode` (`contracts/match-types.ts`) and in the lobby mapping (`lobbyService.ts:881-888`, mapped to `match_full`; pinned by `tests/unit/lobby.facade.test.ts:692-703`). **PM-confirmed 2026-10-11**: no future producer is expected in matchmaking.
- Contract JSDoc: `contracts/matchmaking-api.ts:152-155` gains the success-arm sentence.

### D4 — F-MM-006: results sweep never destroys a live rematch window (FR-020)

`src/matchmaker.ts` `sweepFinishedResultsTtl` `:795-821`:

- After the guards (`:798-803`), add: `if (m.rematch !== null && !isWindowClosed(m.rematch, atMs)) continue;` (`isWindowClosed` from `src/rematch.ts:149-151`, `nowMs > windowExpiresAtMs`).
- No config clamping (PM ruling recorded in spec 006 v1.8). Sweep order in `runLazySweeps` `:823-835` already runs `sweepExpiredRematches` first, so a lapsed offer is still collected on the same pass.
- Update the function JSDoc `:771-794` (its current text asserts unconditional collection "regardless of whether a rematch offer is attached").

### D5 — F-MM-007: `close()` honors its contract (FR-021) — DECISION: honor, amend stale clauses

`src/matchmaker.ts` `close()` `:1394-1403` (current body deletes matches/sessions and never unregisters):

```ts
close(): Promise<void> {
    if (closed) return Promise.resolve();   // idempotent fast path (keeps unregister single-shot)
    closed = true;
    for (const m of store.listMatches()) {
        try {
            server.unregisterMatch(m.matchId);            // best effort; networking no-ops unknown ids
        } catch (err) {
            logger.warn('matchmaker: unregisterMatch failed during close', { matchId: m.matchId, error: formatError(err) });
        }
        store.deleteMatch(m.matchId);
    }
    for (const s of store.listSessions()) store.deleteSession(s.playerSessionId); // :1399-1401, unchanged
    return Promise.resolve();
}
```

- `formatError` is already imported (`src/matchmaker.ts:62`, from `@europa/logging`).
- Fire for **every record still in the store**: networking's `unregisterMatch` returns early on unknown ids (`networking/src/server.ts:1745-1749`), so `filling`/already-unregistered records are harmless no-ops and leaked registrations (TTL-collected finished matches whose `channels` entry is otherwise never cleared) are caught at shutdown.
- Callers verified: `packages/console/scripts/host.ts:693-695` runs `server.close()` first (all no-ops there) then `lobbyFacade().close()` (cascades into `matchmaker.close()` at `lobbyService.ts:1440`) and `matchmaker.close()` again — idempotency makes the second call free. Any host ordering that closes the matchmaker first now gets real 1001 teardown instead of dangling channels.
- Contract JSDoc in the same change set — all three stale timer clauses in `contracts/matchmaking-api.ts` (grep-verified this session; PM ruling 7, extended 2026-10-11): the `Matchmaker` interface lifecycle note `:122` ("graceful shutdown (cancels timers, drops state)" → "drops state; fires `unregisterMatch` per residual record, best effort"); the `close()` JSDoc `:243-251` — delete "Cancels the empty-match sweep timer" (`:244` — no timers exist), state `unregisterMatch` fires per record best-effort, state mutating methods throw after close while `stats()` stays readable (code at `src/matchmaker.ts:1344-1349` already pins the exception); the factory JSDoc `:259-261` — delete "timers start lazily on the first createMatch or joinMatch".
- Do NOT emit `* → collected` status events from `close()` (current behavior; facade unsubscribes first — out of issue scope).
- Note: a record collected at runtime may fire `unregisterMatch` twice (collection + close) — idempotent on the real server; tests must use contains-style assertions (§6).

### D6 — F-MM-012/F-MM-013: uniform capacity guard (FR-022)

`src/matchmaker.ts`

- Extract the sweep-then-count block from `createMatch` `:873-884` into a closure `enforceCapacity(): { ok: true } | { ok: false; error: MatchmakerError }` inside `createMatchmaker` (sweeps via `runLazySweeps()` `:830-835`, counts `status !== 'collected'`, returns `rate_limited` when `>= maxConcurrentMatches`). `createMatch` behavior stays identical after the refactor (regression: `tests/unit/p0-release-blockers.test.ts:86-122`, capacity assertions `:113-118`, stays green).
- `acceptRematch` `:1204-1297`: call `enforceCapacity()` **after** the window-closed check (`:1237-1239`) and **before** `castAcceptVote` (`:1241`); on refusal return the `rate_limited` result unchanged — no vote recorded, no new record, no counters. Refusal is observable: a subsequent `requestRematch` still returns the offer (not `rematch_already_voted`).
- Why this placement is safe: with D4 landed, the lazy sweeps cannot collect the match being resolved (its offer window is open — passed `isWindowClosed` one line above), so the guard never eats its own match.
- `requestRematch` (`:1162-1202`) / `declineRematch` (`:1299-1342`) are deliberately NOT guarded (they create nothing; declining at capacity must keep working because it frees the slot).

### D7 — F-MM-011: hardened `displayName` (FR-018)

- New pure module `src/internal/textDefects.ts` (feature 006 layer, no clock/randomness):

  ```ts
  export type TextDefectReason = 'empty' | 'too_long' | 'control_character' | 'bidi_control' | 'lone_surrogate';
  /** Trim → code-point count → class scan, in that precedence. `null` = valid. */
  export function classifyTextDefect(raw: string, minCodePoints: number, maxCodePoints: number): TextDefectReason | null;
  ```
- Move the three patterns (`CONTROL_CHARACTER_PATTERN` `\p{Cc}` at `handleValidation.ts:88`, `BIDI_CONTROL_PATTERN` at `:101`, `SURROGATE_CODE_POINT_PATTERN` at `:114`) into this module; refactor `validateHandle` (`handleValidation.ts:167-219`; precedence documented at `:149-158`) to call the classifier and keep its exact `LobbyError` messages/details (`HANDLE_MIN_CHARS = 1` at `:74`, `HANDLE_MAX_CHARS = 24` at `:77`) — existing v1.4/v1.5 handle tests (`tests/unit/lobby.handleValidation.test.ts`) must stay green with zero edits.
- `src/matchmaker.ts` `validateDisplayName` `:169-175`: keep name/shape, delegate to the classifier with `minDisplayNameLength`/`maxDisplayNameLength` (code-point counting replaces UTF-16 `.length`), return `string | TextDefectReason`. **Amended at implementation (2026-10-12, review-confirmed)**: shipped as `{ trimmed: string } | { reason: TextDefectReason }` — every reason literal is itself a valid display name (e.g. `'empty'`), so a bare string union cannot be narrowed soundly at the call sites; the discriminated object is the minimal sound shape and the call-site behavior is unchanged.
- Call sites `:846-856` (create) and `:937-947` (join): on defect return `makeError('invalid_request', 'displayName must be a valid name within the configured length', { field: 'displayName', reason })` — mirrors the `SettingsRejection` detail pattern (`:183-192`, `:865-869`). The lobby facade forwards `detail` on its default arm (`lobbyService.ts:892-893`; see §11 Q2 for the pre-existing code mapping).

### D8 — F-MM-008/F-MM-009: roster determinism + injected timer (spec 010 v1.13)

`src/internal/lobbyService.ts`

- Comparator: no source change (`compareUtf16` at `:536` is the pinned comparator) — guard test only.
- Timer: replace the `setTimeout` block at `:498-506` with the injected `schedule` seam (cancel the pending handle at `:491-494` becomes `pendingCancel?.()`); map type at `:392` becomes `Map<GuestPlayerId, CancelScheduled>` (rename to `rosterDebounceCancels`); `removeRosterEntry` `:515-524` and `close()` `:1427-1432` call the stored cancel functions instead of `clearTimeout`.
- No behavior change: 500 ms window (`:192`), reset-on-reflap, pending-map coalescing all identical.

### D9 — F-MM-014 + F-MM-015: every terminal collection releases the networking channel AND the bound sessions (FR-024 + FR-025) *(both PM-authorized expansions)*

**Why one work item**: same seam (already-injected `store`/`server`/`logger` — no new injection), same six call sites, same edit pass; two items would duplicate the site list and invite divergent collection helpers.

Two shared helpers in `src/matchLifecycle.ts` (store-helper precedent `propagateHandleRename` at `:420-448`; `forfeit.ts` already imports from this module at `:36-37`):

```ts
/** FR-025: identity-guarded ACTUAL removal of every seated participant session
 *  still bound to this match. Skips sessions that moved on (rematch accept
 *  rebinds first at matchLifecycle.ts:370-374). */
export function releaseMatchSessions(store: MatchmakerStore, match: MatchRecord): void {
    for (const seat of match.seats.values()) {
        const session = store.getSession(seat.playerSessionId);
        if (session !== undefined && session.currentMatchId === match.matchId) {
            store.deleteSession(seat.playerSessionId);
        }
    }
}

/** FR-024: best-effort unregister — a throwing call is logged and never
 *  aborts the collection. Mirrors the loop-then-transition discipline of
 *  the existing sweeps; `formatError` from @europa/logging. */
export function safeUnregisterMatch(server: Server, logger: Logger, matchId: MatchId): void {
    try { server.unregisterMatch(matchId); }
    catch (err) { logger.warn('matchmaking: unregisterMatch failed', { matchId, error: formatError(err) }); }
}
```

Anchors (all verified this session):

- **Unregister sites to gain the call** (replace each `transitionToCollected(...)` + `totalCollected += 1` pair with a new `collectMatch(m, atMs)` in `src/matchmaker.ts`): `:714-715` (rematch-window sweep), `:761-762` (empty sweep), `:813-814` (results sweep), `:1098-1099` (final-seat leave — passes its `atMs` from `:1070`), `:1279-1280` (accept resolution), `:1336-1337` (decline — passes `now()`).
- **Compliant precedent**: `src/forfeit.ts:100,:106` (both already fire; both currently UNWRAPPED — see the best-effort note below); transitions at `:101,:107`.
- **Networking side**: `networking/src/server.ts:1718` (`registerMatch`), `:1727` (capacity throw `channels.size >= config.maxConcurrentMatches`), `:1745-1749` (unregister early-return no-op on unknown id), `:1753` (the ONLY `channels.delete`), `:1813` (`channels.clear()` only in `server.close()`).
- **Session-release sites to gain the call**: none at `:714` (fn `:709-723`) or `:1336`; `forfeit.ts:91-108` (all-forfeited teardown; only session touch today is the filling-branch unbind `:167`).
- **Already-compliant release loops absorbed into the shared helper**: `src/matchmaker.ts:755-760` (empty sweep, delete `:758`) and `:804-812` (results sweep, delete `:810`) — same guard, same order (release BEFORE transition).
- **Kept as-is**: `leaveMatch`'s explicit `store.deleteSession` at `:1097` (that session was already unbound by `forfeit.ts:167` — the guard would skip it, so the explicit delete stays); `joinMatch` rollback delete at `:1021` (not a collection); `close()` delete at `:1400` (FR-021, separate path).
- **Accept-path exemption verified**: participant sessions are rebound into the new match at `matchLifecycle.ts:370-374` BEFORE the original is collected at `matchmaker.ts:1279`, so the identity guard skips all of them by construction.
- **Observable**: `stats().activePlayerSessions` at `src/matchmaker.ts:1383` (counts non-null `currentMatchId`).

Collection helper in `src/matchmaker.ts` (next to the sweeps; no new injection):

```ts
/** Collect a match: release the networking registration (FR-024) and the bound
 *  sessions (FR-025), then transition + count. Site log lines stay at the sites. */
function collectMatch(m: MatchRecord, atMs: number): void {
    safeUnregisterMatch(server, logger, m.matchId);  // FR-024; networking no-ops never-registered ids
    releaseMatchSessions(store, m);                  // FR-025; identity-guarded
    transitionToCollected(m, atMs, bus.emit);
    totalCollected += 1;
}
```

- **Keep each site's log line** and `swept += 1` bookkeeping; only the transition+counter pair moves into `collectMatch`.
- `src/forfeit.ts` `handleAllPlayersForfeited` `:91-108` gains `releaseMatchSessions(ctx.store, match)` immediately after each `ctx.server.unregisterMatch(...)` (`:100`, `:106`) and before `transitionToCollected` (`:101`, `:107`), and wraps both unregister calls in `safeUnregisterMatch` so FR-024's "logged, must not abort" wording is true on this path too. Do NOT route it through `collectMatch` — that would double-count `totalCollected`, whose `torn_down` owners are `matchmaker.ts:471-473` (bridge) and `:1135-1137` (voluntary leave). FR-025's "every terminal collection" wording makes this path in-scope even though the PM's original question named only lapse/decline — without it the FR would be false on day one.
- Session release is IDENTITY-GUARDED actual deletion, not unbinding — house convention documented at `:751-754` and `:804-806`. Non-terminal filling forfeits (`forfeit.ts:164-170`) merely unbind without collecting — outside FR-025 (the match is not collected; unbound sessions don't count toward `activePlayerSessions`).
- FR-024 firing is UNCONDITIONAL — including the `filling` collections at `:761`/`:1098` (never registered; harmless no-op on the real server, recorded by `FakeServer`). A record collected at runtime may fire again at `close()` (FR-021) — contains-style assertions everywhere except the existing exact-array pin (`tests/unit/matchmaker.leave.test.ts:289`, forfeit path, asserted BEFORE `close()` at `:294`).
- **Fixture task (Gate-1 row 1 closure — required for SC-007)**: redefine `tests/fixtures/fakeServer.ts:95` — today `activeMatches = registerMatchCalls.length − unregisterMatchCalls.length` goes to −1 when an unregister fires for a never-registered id. Redefine as a **live-registration set** mirroring the real server's unknown-id no-op (`networking/src/server.ts:1745-1749`): `registerMatch` (`:116-118`) adds the id to a private `Set<MatchId>`; `unregisterMatch` (`:121-123`) still appends to the raw `unregisterMatchCalls` log AND removes the id from the set if present; `stats().activeMatches` returns `set.size` (can never go negative). Do NOT add throw-on-duplicate-registration or capacity throws to the fake (out of scope — would change unrelated test behavior; the real server throws at `:1719-1721`/`:1727-1729`).
- data-model §4 is corrected in the same change set so its side-effect column matches this code (done in Phases 1–3; §7/§14 `playerId` staleness corrections added in this change set — §5.7).

## 5.7 Corrections vs the Gate-1 input draft (verified this session)

| Draft claim | Verified reality | Action |
| --- | --- | --- |
| `matchmaker.join.test.ts:144-157` / `:159-181` | tests actually span `:144-159` (unknown token) and `:161-182` (known token → `seat_taken`) | use verified bounds |
| `p0-release-blockers.test.ts:86-127` | describe spans `:86-122`; capacity assertions `:113-118` | use verified bounds |
| `lobby.facade.test.ts:692-701` | test spans `:692-703` (`:701-702` assert the mapping) | use verified bounds |
| `identity-migration-guard.test.ts:287-291` | rule spans `:284-293` | use verified bounds |
| `handleValidation.ts:149-214` (Gate-1 ledger citation) | precedence doc `:149-158`, function `:167-219`, patterns `:88/:101/:114` | cite precisely |
| empty-sweep delete loop `:755-760` ✓; results-sweep "loop `:804-812`" | comment `:804-806`, loop `:807-812`, delete `:810` | cite precisely |
| forfeit teardown unregister is FR-024-compliant | calls at `:100/:106` are **unwrapped** — a throwing server would abort the teardown, violating FR-024's best-effort clause | wrap via `safeUnregisterMatch` (this plan adds it) |
| — | `contracts/matchmaking-api.ts` has THREE stale timer clauses (grep-verified): `:122` ("cancels timers", interface lifecycle note), `:244` (`close()`), `:259-261` (factory "timers start lazily") | all three amended in the same pass — PM ruling 7 extended to `:122` (2026-10-11); explicit step in §5 D5 |
| — | data-model §7 `playerId` row and §14 `SeatAssignment.playerId` comment say "assigned at running"; issue #74 fixed it at seat-claim time (`seatRecord.ts:70-74`, `playerId: PlayerId` non-null) | corrected in `data-model.md` this change set |

## 6. Gate-1 finding closures implementation must honor

1. **SC-007 loophole (row 1, BLOCKER → CLOSED)**: the per-path "unregister fired" assertion covers ALL seven collect paths including the empty-TTL sweep and final-seat leave (whose `filling` records never called `registerMatch`); the registered-match accounting assertion is scoped to matches that reached registration, and `FakeServer`'s accounting becomes a live-registration set (§5 D9). Skipping the unregister call on the empty sweep to "satisfy arithmetic" must FAIL the per-path assertion. FR-024's unconditional-firing text stays byte-identical.
2. **SC-008 attribution (row 2, IMPORTANT → CLOSED)**: the soak's `:136`/`:145` zero-session pins are driven by the all-accept path plus the **empty-match-TTL sweep** (`tests/soak.test.ts:131-137`, `:105-119`), never the results-TTL sweep; the run never ages a `finished` match past `resultsTtlMs`. Tests and docs must use this attribution.
3. **`FakeServer` semantics**: `unregisterMatchCalls` remains the raw fired-call log (per-path assertions); `stats().activeMatches` becomes the live-set size (registered-match accounting only). The arithmetic is NEVER asserted on never-registered paths.

## 7. Test plan (AC → tests)

### Invert pins (behavior change is the point; cite issue #147 in test titles)

- `tests/unit/lobby.identityRegistry.test.ts:330-333` ("throws when disconnecting an unknown identity") → assert no-op (unknown id disconnect neither throws nor mutates); `:424-433` ("restart loses all state", `:432` throw pin) → unknown-id disconnect no-op; **keep** `:396-416` (closed registry still throws for every op incl. `disconnect` at `:407`). Do not delete these tests — re-pin them to the new idempotent contract and say so in the titles.
- `tests/unit/matchmaker.join.test.ts:161-182` ("a known token reports seat_taken") → success: returns the SAME `sessionToken`/`seatIndex`/`playerId`, no second session minted (`stats().activePlayerSessions` unchanged). Keep `:144-159` (unknown token → `match_not_found`).
- `tests/unit/roster.test.ts:634` expectation → compute with `compareUtf16` (or literal order); add a non-ASCII handle set (e.g. `['Åsa', 'ada', 'zoe', '🚀Rocket']`) asserted against a literal pinned order — passes under any locale (issue AC: "determinism tests with non-ASCII handles").

### New tests (issue AC mapping; one named test per new branch)

1. **"Sweep then `connectionClosed`"** (FR-023): inject a registry into `createLobbyService`; establish identity + handle; advance the injected clock past `graceMs`; `registry.releaseExpired()`; `service.connectionClosed(conn)` → does not throw; roster/presence clean; handle freed.
2. **"expired then reconnect"** (FR-023): after the same sweep, `establishIdentity({ guestPlayerId: staleId }, conn)` on the still-bound connection → returns a FRESH identity (not the ghost), directed `identity` event delivered, and a following `setHandle` succeeds (today: throws `unknown guest player id`). Companion case for the `onSeatReconnected` branch: ghost binding released, no throw in `setHandle`.
3. **Reconnect slice** (FR-019; SC-006's own standing coverage is quickstart suites `Q-M02` (private-URL join) and `Q-M03` (unknown-ID 10/10), unchanged): live seat success (filling AND running) — asserting the returned assignment carries the SAME `sessionToken`/`seatIndex`/`playerId` AND that the request's `displayName` is NOT applied to the seat (FR-019 states this; the seat's `displayName` snapshot is unchanged) — / forfeited → `session_expired` / finished match → `session_expired` / collected match → `session_expired` / unknown token → `match_not_found` (fixture pattern from `matchmaker.join.test.ts`).
4. **Divergent TTL** (FR-020): `resultsTtlMs: 1_000`, `rematchWindowMs: 60_000`; finish + `requestRematch`; clock → +2 s: `stats()`/`listPublicMatches()` still report `finished` with the offer intact; clock → window end: collected by the rematch sweep.
5. **`close()` contract** (FR-021): create + auto-start a match; `await close()` → `FakeServer.unregisterMatchCalls` contains the match id; second `close()` adds none; `stats()` readable; mutating method throws.
6. **Capacity on rematch** (FR-022): `maxConcurrentMatches: 1`, finish the only match, open offer, `acceptRematch` (all votes) → `rate_limited`, offer still open (`requestRematch` returns the same id), `declineRematch` still succeeds; then a fresh `createMatch` succeeds after collection. Fixture pattern from `tests/unit/rematch.accept.test.ts`.
7. **displayName hardening** (FR-018): each defect class → `invalid_request` + `detail.reason`, precedence order, code-point length (32 emoji valid, 33 invalid), valid non-ASCII names accepted on create AND join.
8. **Anti-flap seam** (spec 010 v1.13): injected scheduler records `(delayMs = 500)` and its cancel is invoked on `removeRosterEntry`/`close`; existing fake-timer roster tests unchanged (default path).
9. **Pins kept**: `p0-release-blockers.test.ts` (F-MM-012), `singleCodePath.test.ts`, handle v1.4/v1.5 suites, core's `localeCompare` guard; re-run `matchmaker.leave.test.ts:278-295` unchanged (forfeit path, single fire, asserted before `close()`); `soak.test.ts:126` (mid-flight 2), `:136,:145` (0 via all-accept + empty-sweep); `matchmaker.autostart-3p.test.ts:119` (=3 while running); `matchmaker.edges.test.ts:121-131` (close idempotent + stats zeroed — now also exercises close()'s unregister for a filling record).
10. **"Sweep-then-channel-release"** (F-MM-014 / FR-024 / SC-007): for EACH of the seven collection paths — rematch-window lapse, results-TTL sweep, empty-TTL sweep, final-seat `leaveMatch`, `declineRematch`, all-accepted `acceptRematch`, all-forfeited forfeit — assert the match id appears in `FakeServer.unregisterMatchCalls` at collection time (before any `close()`), INCLUDING the empty-TTL sweep and final-seat leave. For matches that reached registration, additionally assert `FakeServer.stats().activeMatches` returns to its pre-registration value (live-set accounting, §6.3). Include the divergent-TTL pair from test 4: window open → no collect/no unregister; window lapsed → collect + unregister.
11. **"No orphaned sessions after terminal collection"** (F-MM-015 / FR-025 / SC-008): fixture baseline `stats().activePlayerSessions` (0 in a fresh 2-player harness — pattern `tests/unit/matchmaker.edges.test.ts:129`), then per terminal path assert it returns to baseline immediately after collection: (a) finish → `requestRematch` → clock past window → `stats()` triggers the lapse sweep → `0` and no `PlayerSession` carries `currentMatchId === collectedId`; (b) finish → offer → `declineRematch` → `0` (also: subsequent `requestRematch` yields `rematch_not_offered`, not a throw); (c) all-forfeited teardown → `0`; (d) control: all-accept → `activePlayerSessions` equals the LIVE rematch match's participants (2, matching `soak.test.ts:126`), never orphaned mid-flight.

12. **"close() survives a throwing `unregisterMatch`"** (FR-021 catch branch, D5): drive a `FakeServer` subclass whose `unregisterMatch` throws, create + auto-start a match, `await close()` → resolves; `stats()` readable and zeroed (state cleared despite the throw); a second `close()` adds no calls; and the failure is LOGGED (assertion mechanism below).
13. **"collection survives a throwing `unregisterMatch`"** (FR-024 catch branch, D9 `safeUnregisterMatch`): same throwing subclass + recording logger; trigger a collection at runtime (e.g. empty-match TTL sweep via `stats()` after clock advance) → the match still transitions to `collected` (FR-024 end state), bound sessions still released (`activePlayerSessions` back to baseline, FR-025 runs after the catch), and the failure is LOGGED. Companion coverage for the forfeit-teardown wrap: same helper, asserted once via `handleAllPlayersForfeited`'s path.

   **Logger-assertion mechanism** (Gate-2 HOLD-1): precedent EXISTS in this package — `tests/unit/matchmaker.edges.test.ts:22-32` defines a recording logger (`Logger & { lines: string[] }`) injected via `MatchmakerDeps.logger`, asserted with `lines.some((l) => l.startsWith('info:…'))` at `:209-211`. The existing helper no-ops `warn` (`:29`); tests 12/13 extend it locally to also record `warn:${msg}` and assert `lines.some((l) => l.startsWith('warn:matchmaker: unregisterMatch failed') || l.startsWith('warn:matchmaking: unregisterMatch failed'))`. Deliberately NOT `vi.fn`/`vi.spyOn` — grep confirms no spy usage anywhere in `packages/matchmaking/tests`; the recording-logger pattern is the house convention and the cheapest honest mechanism.

Coverage: every new behavior branch from D1–D9 — including both best-effort CATCH branches (FR-021's `close()` loop, test 12; FR-024's `safeUnregisterMatch` at collection time, test 13) — is exercised by tests 1–13; the ≥80% gate in `packages/matchmaking/vitest.config.ts` applies unchanged. No test asserts wall-clock timing; determinism is via injected `now`/`schedule`/fake timers only.

## 8. Documentation changes (same change set — AGENTS.md rule 4)

- Done in Phases 1–3: spec 006 → v1.8 (FR-018..FR-025, SC-007/SC-008, Clarifications, traceability table, edge cases); spec 010 → v1.13; `data-model.md` §4/§5/§7/§9/§11/§15/§19 amended (+§7/§14 `playerId` staleness fix this session); `contracts/README.md` rewritten (+three-clause stale-timer inventory, PM ruling 7 extended).
- Same change set as the code: `contracts/matchmaking-api.ts` — all three stale timer clauses (`:122` interface lifecycle note, `:244` `close()`, `:259-261` factory; PM ruling 7 extended), plus the `joinMatch` `:152-155` success-arm sentence; `src/matchmaker.ts` sweep JSDoc correction (the `collectMatch` helper ships WITHOUT a doc comment — owner comment discipline, per tasks.md comment-discipline section; this supersedes the draft's "collectMatch helper doc" wording); `identityRegistry.disconnect` JSDoc (`:162-168`).
- **Manual check (spec 007 FR-012 gate, done this session)**: `docs/manual/src/pages/quick-start.mdx:16` and `lobby.mdx:20` document the LOBBY HANDLE rules (1–24 chars, control/bidi/malformed-Unicode rejection) — handle behavior is unchanged by D7 (same classes, same messages), and the matchmaking `displayName` boundary (1..32) has no manual text. **No manual edit required**; re-grep at implementation time to confirm nothing landed meanwhile.

## 9. Verification

```bash
pnpm verify                 # full CI-equivalent gate (pre-push hook runs verify:changed)
# focused loop:
pnpm --filter @europa/matchmaking test
pnpm --filter @europa/matchmaking typecheck && pnpm --filter @europa/matchmaking lint
grep -rn "localeCompare\|setTimeout" packages/matchmaking/src   # expect: only the default scheduler binding
```

## 10. ADR-worthy flags (per Gate-1 challenger)

- **FR-024 unconditional `unregisterMatch` (incl. never-registered records) + FR-025 identity-guarded session release at terminal collection, with the accept-path rebind exemption** — two independently testable leak classes; one-way-door-ish for the collection surface. **Durability note (Gate-2 row 11)**: test 10's "all seven collection paths" list is necessarily CLOSED — an eighth removal path added later would evade it by hand — so the ADR should record the enforcement mechanism, not just the list: route ALL six matchmaker-side collection sites through `collectMatch` (the forfeit teardown keeps its own counter-owned call), making "a new collection path compiles only through the release helper" the structural guard that keeps the invariant true.
- **`close()` honors its contract rather than amending it away** (binding decision) — worth an ADR note because it makes matchmaker shutdown order-independent w.r.t. networking.
- **Scheduler seam over lazy flushing** (binding decision, PM-confirmed) — recorded in spec 010 v1.13; an ADR is optional there.

## 11. PM questions (Q1 RULED 2026-10-11; Q2–Q3 answered/open as marked)

1. **Q1 — RULED (PM ruling 7, extended 2026-10-11)**: all THREE stale timer clauses in `contracts/matchmaking-api.ts` — `:122` ("cancels timers" in the `Matchmaker` lifecycle note), `:244` ("Cancels the empty-match sweep timer" in `close()`), `:259-261` ("timers start lazily" in the factory JSDoc) — are amended in the same pass; grep-verified this session that these are the only `timer` mentions in the file. This is no longer an open question; the `:122` amendment is an explicit step in §5 D5.
2. **Q2 (observation, no action proposed)**: the lobby facade's `mapUpstreamError` (`lobbyService.ts:873-895`) maps matchmaker `invalid_request` (incl. FR-018 displayName rejections and pre-existing settings rejections) to lobby `internal_error` with `upstreamCode: 'invalid_request'` + preserved `detail`. FR-018 governs the matchmaker boundary and is satisfied; the lobby-level code mapping is pre-existing behavior outside this issue. Flagging so the PM can decide whether a follow-up issue is wanted; NOT in scope here.
3. **Q3 (fixture scope, recommend proceed)**: the `FakeServer` live-set redefinition (§5 D9) changes `stats().activeMatches` only for tests that fire unregister for never-registered ids. Verified this session: **no existing test reads the fake server's `stats().activeMatches`** (every `activeMatches` assertion in `packages/matchmaking/tests` targets matchmaker stats), and existing `unregisterMatchCalls` assertions stay green under D9: contains-style fires (`forfeit.allDisconnected.test.ts:57,:89`; `Q-M04-disconnect-forfeit.test.ts:87`), pre-collection `toHaveLength(0)` negatives (`forfeit.allDisconnected.test.ts:35,:81` — they assert NO fire before collection, unaffected by adding fires AT collection), and the one exact-array pin at `matchmaker.leave.test.ts:289` (forfeit path, registered match, asserted before `close()` — unaffected). Proceeding unless the PM objects.
