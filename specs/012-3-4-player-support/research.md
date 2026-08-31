# Research: 3–4 Player End-to-End Support (012)

**Branch**: `issue-6-3+4-player-matches` | **Date**: 2026-08-28 | **Spec**: `specs/012-3-4-player-support/spec.md` v1.0 | **Plan**: `specs/012-3-4-player-support/plan.md`

> Phase 0 output — five product decisions + alternatives, density rationale for 4→48, capacity-source derivation without a new tick field, terrain determinism after FR-001, host flag layering, and the parameterized harness shape. Each finding cites the source consulted (spec, AGENTS.md, constitution, upstream specs/plans) and the alternative rejected.

---

## 1. Default board size map — **2→32, 3→48, 4→48 (single source in `@europa/matchmaking`)**

**Decision**: `BOARD_SIZE_DEFAULTS = { 2: 32, 3: 48, 4: 48 }` as a frozen `Record<PlayerCount, BoardSize>` in `packages/matchmaking/src/constants.ts` (and typed in `contracts/match-types.ts`). Lobby create form and `pnpm host` consume it; `docs/manual/numbers.md` documents it; `DEFAULT_MATCH_SETTINGS.boardSize` stays `32` for backward API compatibility.

**Density rationale (why 4→48, not 64)** — from spec Clarifications Q1:

| Count | Default | Cells | Cells/player | Terrain p99 note |
|-------|---------|-------|--------------|------------------|
| 2 | 32 | 1,024 | 512 | Shipped default, placement tuned for 32 |
| 3 | 48 | 2,304 | 768 | Larger board preserves playability with 3 bands |
| 4 | 48 | 2,304 | 576 | ~12% more per-player area than 2p→32 — "spacious but not sparse" |
| 4 (alt) | 64 | 4,096 | 1,024 | 2× per-player area over 2p→32; doubles generation cost at the 1 s budget |

Spec explicitly rejected:
- **(a) Fixed 32 for every count** — 3–4p cramped; contradicts the original's larger-board availability for larger player counts.
- **(b) 3→48, 4→64** — doubles per-player area over 2p 32 and raises terrain generation cost at the 1 s p99 budget (003 SC-003), while leaving 48 as the common tokenless-default for both 3p and 4p simplifies docs and host ` HOST_PLAYER_COUNT`-only invocations. `64` remains available via override; flipping the default later is one table entry (no spec shape change).

Per-player land is not the only constraint: point-symmetric placement + water basins (003 FR-004/FR-005) have a practical floor near 32 for matchmaking-generated maps (16×16 exhausts regeneration attempts — proven in full-stack.spec.ts `BOARD_SIZE` note). 48 keeps all three counts safely above that floor while staying inside the 1 s generation budget.

**Single source rationale**: matchmaking owns `MatchSettings {playerCount, boardSize, terrainSettings} → MatchConfig` authority; lobby UI and host CLI are its consumers. One table prevents drift (spec FR-001: "The defaults live as a single source map in `@europa/matchmaking`").

**API compatibility**: `DEFAULT_MATCH_SETTINGS.boardSize = 32` remains the engine-facing default. The new map is additive; direct `createMatch` callers who omit `boardSize` still get 32. Only the lobby/host *pre-selection* uses the N-aware default — the server's broader `[8,128]` clamp on `createMatch` stays as the safety net for non-UI callers.

---

## 2. Capacity-chrome source derivation — **no new protocol field; no new tick field**

**Decision**: Every public lobby entry already carries `capacity` (= `playerCount`), `seatsFilled`, `boardSize`, and `status` (`waiting` | `in_progress`) on `PublicLobbyEntry` (010 contract; re-exported from `@europa/matchmaking` via lobby types). User-visible chrome `k / N` + board label + lifecycle/JOIN affordance is **derived presentation** in `packages/console/src/ui/lobby-labels.ts` (`formatOccupancy`, `formatEntrySettings`, `lobbyStatusLabel`, `isJoinable`). No new wire field, no tick-payload addition, no `PublicLobbyEntry` shape change.

**Why no tick-payload capacity field**:
- The console's authoritative capacity comes from the **lobby join context** (the `PublicLobbyEntry` the user clicked) and from **lobby/status broadcasts** (the App's `LobbyService` subscription). The console's `ConsoleState` already consumes lobby state alongside match state; `App.tsx` already derives `awaitingStart` from `status===live && tick===0`. Adding capacity to `TickPayload` would duplicate lobby ownership and force every tick to re-carry lobby metadata (constitution V — speculative generality).
- The tick hot path stays N-agnostic (spec FR-010): `TickDelta`/`Snapshot`/`hello`/`order`/`heartbeat` remain unchanged. Fog-filtered broadcast already carries per-seat `VisibleSet` isolation; capacity is not a fog concern.
- For spectators and reconnectors, lobby state remains the source — tick payloads remain views only.

**Derivation point in App**: `App.tsx` already resolves `store` → `ConsoleState {status, latestView}` + lobby `entries` + `activeMatchId`. The `awaitingStart` branch (FR-005) formats copy via `formatWaitingMessage(seatsFilled, capacity)` where `capacity` and `seatsFilled` are read from the lobby entry for the active match (or from the join assignment stored at join time as fallback). This matches spec FR-005: "derived from the authoritative match capacity and seats-filled count available to the console (from the lobby join context or the first lobby/status broadcast consumed by the App)".

**Alternative considered**: add `capacity` to `TickPayload`/`SnapshotPayload`. Rejected — duplicates authority, widens hot path, violates single-source (lobby entry is canonical) and "no protocol bump" constraint (Out of Scope).

---

## 3. Terrain determinism after FR-001 — **consumed, not redefined; SC-003 audits 48**

**Decision**: Terrain generation (003) is **not edited**. Clarifications v1.2 (even-normalization + `partnerPlayer` + both-water-metrics placement) is normative and already tested (landed terrain 242 + matchmaking 171 test lines on `issue-2-3-player-match`). FR-001's 48 default exercises those invariants; it does not re-derive them.

**Determinism note**: repeating a 3p generation after the fix may yield a **different deterministic map than an unnormalized pre-fix seed** for the same logical input (e.g., `citiesPerPlayer:1` now normalizes to `2` before placement, and placement now accepts only cells whose *both* water metrics are non-pool — Chebyshev ≥ min AND Manhattan > min). The new map is still byte-identical across machines for the same seed + effective settings. Spec explicitly calls this out (Edge Cases: "still valid and byte-identical across machines for the same seed") — no committed golden board hash exists across the old/new boundary (terrain/engine/console determinism fixtures are scripted or self-referential).

**SC-003 audit shape**: 10 sampled seeds × 3 player counts (2,3,4) × 3 board sizes (32,48,64) covering odd + even `citiesPerPlayer` for 3p; same-seed regen byte-identical; 100% pass validation invariants (point symmetry via `partnerPlayer`, connectivity over land, water-bounds 5–15% default) + 200-map balance suite extended to `N∈{3,4}`. Failure terminates loudly. This mirrors 003 SC-001/SC-002/SC-004 protocols — only the parameter grid widens.

---

## 4. Host flag layering over `HostConfig` — **additive `NPlayerHostConfig`, env fallbacks, implied default**

**Decision**: Extend `packages/console/scripts/host-config.ts` from:
```ts
interface HostConfig { bindHost, publicHost, port, wsPort }
```
to additive:
```ts
interface NPlayerHostConfig extends HostConfig {
  playerCount: 2|3|4;
  boardSize: 32|48|64;
}
```
Parsed in `resolveConfig(args, env)` layered as:
1. `--players N` (alias `--player-count`) wins when present; else `HOST_PLAYER_COUNT` env when neither flag present; else default `2` (backward compat with v1 and every existing doc link).
2. `--board-size S` (alias `--boardSize`) wins when present; else `HOST_BOARD_SIZE` env; else implied `BOARD_SIZE_DEFAULTS[playerCount]` (so bare `--players 3` → 48, not silently 32 — FR-011).
3. Both validated **before binding**; invalid (`5`, `16`, `--static-port`, alias mismatch) fails fast with actionable message naming the offending flag and naming the allowed set (011 NFR-004 style). `HOST_STATIC_PORT` / `--static-port` remain unsupported failures (FR-012) — passing them is conformance failure.
4. The resolved pair drives the single public match created+filled in `--create` mode (011 FR-003). Printing: `playerCount` credential-free semantic `/match/<id>/join` URLs; `GET /version` + same-origin WS over the single `http.Server` unchanged (011 FR-001..FR-003).

**Layering rationale**:
- Flags/env/defaults follow the same `resolveConfig` pattern that already handles `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` — extend, don't invent a second parser.
- Implied default (flag-absent → map lookup) preserves the invariant that the host never silently creates a 32-board for a 3p request when the product-approved default is 48 (FR-011 AC-4). Existing `pnpm host --create` with no `--players` stays `2p→32` because `playerCount` defaults to `2` before the implied lookup.
- Validation before bind avoids partial boot then teardown.

**Single-port invariant**: host still owns one `http.Server` on `HOST_PORT` serving `dist/` + `/version` + SPA fallback + WS upgrades (011). No second listener; no `HOST_STATIC_PORT` reintroduction (FR-012). Fixtures use `port:0` + `__boundPortForTest()` per 011 FR-009 — no two-port seam reintroduced.

---

## 5. Parameterized full-stack harness — **one file `describe.each([3,4])`, single-server, no wall-clock waits**

**Decision**: `packages/console/tests/e2e/full-stack-n-players.spec.ts` (or equivalent) is a single harness parameterized over `N ∈ {3,4}` sharing the `buildStack(wsPort=0, bindHost='127.0.0.1', httpServer)` recipe proven by `tests/e2e/full-stack.spec.ts` and `tests/integration/lobby-transport.test.ts`:

```ts
describe.each([3, 4])('full-stack N=%i', (playerCount) => {
  it('creates, fills, auto-starts, per-seat fog, orders, victory…', async () => {
    const httpServer = createHttpServer();
    const { server, matchmaker, lobby } = buildStack(0, '127.0.0.1', httpServer);
    await listenOnEphemeral(httpServer); // __boundPortForTest() → port
    // three/four distinct guest identities claim seats atomically
    // assert last seat → tick≥1 within 2s, per-seat views, ok:true acks, etc.
  });
});
```

- **Three/four distinct guest identities** claim seats atomically; at most one gets the last seat, losers get `match_full` — same assertion as 2p harness.
- **Per-seat fog**: each seat's first `TickPayload` view contains its own city, horizons differ, no full-board leak except spectators — fog isolation pinned by 500-tick audit (SC-004).
- **Deterministic waits**: all waits are poll conditions (`expect.poll`), fixed tick cadence 250 ms; no `setTimeout`-based flakes.
- **Seed coverage**: at least one 3p seed exercises odd `citiesPerPlayer` to hit even-normalization determinism (spec Q4).
- **2p non-regression**: existing `tests/e2e/full-stack.spec.ts` + `tests/e2e/*.spec.ts` + `tests/integration/lobby-transport.test.ts` + deterministic golden fixtures remain green (SC-006).

**Why not two suites**: constitution V (simplicity) — one harness parameterized over N is cheaper to maintain, proves the "N>2 residue" removal in one place, and shares the single-server binding seam (`httpServer` + `wss.handleUpgrade`) that is otherwise easy to regress (011 risk).

---

## 6. Resolved unknowns (from spec Q1–Q4 + cross-spec)

| Open question (spec Clarifications) | Resolution | Location |
|-----------------------------------|------------|----------|
| Q1 board size per count | 2→32, 3→48, 4→48 overrideable 32\|48\|64; single source map in `@europa/matchmaking` | FR-001/FR-002/FR-011; this doc §1 |
| Q2 chrome + waiting overlay | Lobby list shows k/N + board label; overlay N-aware singular/plural, derived without new tick field | FR-003/FR-005; this doc §2 |
| Q3 host flags | `--players` + `--board-size` (+ env fallbacks) additive on `HostConfig`; implied default; single port only | FR-011/FR-012; this doc §4 |
| Q4 testing bar | Full-stack E2E for both 3 and 4 parameterized; deterministic/fog audits over 3,4; coverage ≥80%; 2p green | SC-001..SC-009; this doc §5 |
| Capacity source | Derive from `PublicLobbyEntry` (lobby entry), not tick payload | §2 above |
| Wire version bump | None — envelope/frame/fog/tick unchanged | Plan D8; Out of Scope |
| Terrain redefinition | None — 003 v1.2 is normative; SC-003 audits exercise it | §3 above |
| No-speculative generality | No 5+ players, no board sizes beyond 64 in UI, no new terrain algorithm | Spec Assumptions / Out of Scope |

No pending-clarification markers remain. Spec v1.0 + product decisions 2026-08-28 close all ambiguities.

---

## 7. Library / stack needs — **NONE (Node built-ins + workspace types only)**

Same as feature 006/010: no new runtime dep. `BOARD_SIZE_DEFAULTS` is a const; `formatWaitingMessage` is a pure string helper; `resolveConfig` is existing host parsing extended. Dev deps inherit from feature 001's locked stack (`vitest`, `@biomejs/biome`, `typescript`) — no new dev dep.
