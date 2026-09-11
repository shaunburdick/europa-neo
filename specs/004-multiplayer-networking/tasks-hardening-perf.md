# Tasks: Admission Hardening (#151) + Hot-Path Performance (#135)

**Input**: Design documents from `specs/004-multiplayer-networking/plan-hardening-perf.md`, `research-hardening-perf.md`, `data-model-hardening-perf.md`
**Prerequisites**: Specs amended at `e97c8e5` (spec 004 v1.6, spec 001 v1.10, spec 003 v1.5, spec 006 v1.3)
**Branch**: `networking-fixes`

**Tests**: REQUIRED. Constitution Principle III mandates ≥80% coverage. Each wave ends with a verification checkpoint. Tests are interleaved with implementation.

---

## Format: `[ID] [P?] [Wave] Description`

- **[P]**: Can run in parallel (different files/packages, no dependencies on incomplete tasks)
- **[Wave]**: Which wave this task belongs to (W1 = Security, W2 = Engine Perf, W3 = Terrain Perf, W4 = Networking Perf)

---

## Wave 1: Security Hardening (#151)

**Purpose**: Error unification, connection caps, origin validation, identity caps, anti-oracle, all-frame rate limiting.

- [ ] T001 [W1] Update `ErrorCode` union in `packages/networking/src/contracts/network-types.ts`: remove `match_not_found`, `match_full`, `seat_taken`; rename `rate_limited` → `client_rate_limited`; add `client_payload_too_large`; bump `NETWORK_API_VERSION` from `'0.1.0'` to `'0.2.0'`

- [ ] T002 [W1] Update `ErrorCode` mirror in `specs/004-multiplayer-networking/contracts/network-types.ts` (byte-identical to T001 output)

- [ ] T003 [W1] Add `ProtocolErrorCode` base type export to `packages/networking/src/contracts/network-types.ts` — the shared base type that both `ErrorCode` and `LobbyErrorCode` extend (FR-017). Re-export from `packages/networking/src/errors.ts` as `NetworkErrorCode`

- [ ] T004 [W1] Add new `ServerConfig` fields to `packages/networking/src/contracts/network-api.ts`: `maxGlobalConnections`, `maxPerIpConnections`, `allowedOrigins`, `maxHandleLength`, `maxIdentityLength` with defaults in `NETWORK_DEFAULT_CONFIG`

- [ ] T005 [W1] Add new constants to `packages/networking/src/constants.ts`: `defaultMaxGlobalConnections`, `defaultMaxPerIpConnections`, `defaultMaxHandleLength`, `defaultMaxIdentityLength`

- [ ] T006 [W1] Implement connection caps in `packages/networking/src/server.ts`: add `perIpCounts: Map<string, number>` to server closure; in `upgrade` handler, check `connections.size < config.maxGlobalConnections` and `perIpCounts.get(ip) < config.maxPerIpConnections` before calling `handleUpgrade`; decrement counts on socket close; respond HTTP 429 + `Retry-After: 1` on cap exceeded

- [ ] T007 [W1] Implement origin validation in `packages/networking/src/server.ts`: in `upgrade` handler, after connection caps, check `request.headers.origin` against `config.allowedOrigins`; respond HTTP 403 when origin is missing/not in set and allowlist is non-empty

- [ ] T008 [W1] Implement identity/handle length validation in `packages/networking/src/validate.ts` (or `server.ts` joinMatch handler): reject `displayName.length > config.maxHandleLength` and identity strings exceeding `config.maxIdentityLength` at handshake with `client_payload_too_large` error; no silent truncation (FR-015)

- [ ] T009 [W1] Implement match-existence error collapse in `packages/networking/src/server.ts` joinMatch handler: replace distinct `match_not_found`/`match_full`/`seat_taken` error responses with single `match_not_joinable`; do not echo raw client-supplied match ID in error payload (FR-016)

- [ ] T010 [W1] Extend rate limiting to ALL frame kinds in `packages/networking/src/connection.ts` (or `server.ts` handleEnvelope): every inbound frame (hello, ping, lobby*, order) consumes one token from the existing `rateBucket`; drop with `client_rate_limited` error when bucket empty (FR-010 rewrite)

- [ ] T011 [W1] Update all test assertions across `packages/networking/tests/` that expect `match_not_found`, `match_full`, `seat_taken`, or `rate_limited` — change to `match_not_joinable` or `client_rate_limited` as appropriate

- [ ] T012 [W1] Write new tests: connection cap enforcement (global + per-IP, HTTP 429 response), origin validation (allowlist empty/non-empty, missing origin), identity/handle length rejection, anti-oracle (all admission failures return `match_not_joinable`), all-frame rate limiting (hello/ping flood triggers throttle), error code conformance (both mirrors byte-identical, union exhaustiveness)

**Wave 1 Checkpoint**: `pnpm typecheck && pnpm lint && pnpm format:check` + `pnpm --filter @europa/networking test` (existing tests pass with updated assertions + new security tests) + conformance suite green

---

## Wave 2: Engine Performance (#135)

**Purpose**: Pre-allocate scratch buffers, eliminate per-tick heap allocations in `tick()`.

- [ ] T013 [W2] Define `TickScratchBuffers` interface in `packages/engine/src/types.ts` (per data-model §3)

- [ ] T014 [W2] Allocate `TickScratchBuffers` in `packages/engine/src/create.ts` — after board construction, allocate all typed arrays sized to `n = width × height` and `n × PLAYERS`; attach to `EngineSession` return value

- [ ] T015 [W2] Refactor `packages/engine/src/tick.ts` to accept and use `TickScratchBuffers`: replace all `new Uint32Array(...)` / `new Uint8Array(...)` allocations with buffer references; zero-fill via `fill(0)` before each phase; pass buffers through to `resolveFlow`, `resolveCombat`, `resolveDecay`

- [ ] T016 [W2] Refactor `packages/engine/src/resolution/flow.ts`: accept pre-allocated `newCounts`/`newOwners` buffers as parameters (instead of allocating internally); reuse `TransferParams` pool from scratch buffers

- [ ] T017 [W2] Refactor `packages/engine/src/resolution/combat.ts`: accept pre-allocated `newCounts`/`newOwners` buffers and `committedPlayersPool`; reset pool entries in-place before each cell's combat resolution

- [ ] T018 [W2] Write SC-006 allocation regression test: V8 heap snapshot of 1000 consecutive ticks on a populated 32×32 board must show zero allocations in `tick()` body; write determinism regression test: byte-identical output before/after refactor (SC-001)

**Wave 2 Checkpoint**: `pnpm --filter @europa/engine test` (all existing tests pass + SC-006 allocation test) + determinism hash comparison

---

## Wave 3: Terrain Performance (#135)

**Purpose**: Replace O(n²) BFS with O(n) head-cursor BFS.

- [ ] T019 [W3] Refactor `bfsLandReachable` in `packages/terrain/src/validate.ts`: replace `queue.shift()` with `queue[head++]` pattern (line ~104)

- [ ] T020 [W3] Refactor `bfsFlowViableReachable` in `packages/terrain/src/validate.ts`: replace `queue.shift()` with `queue[head++]` pattern (line ~172)

- [ ] T021 [W3] Refactor `waterPoolStats` in `packages/terrain/src/validate.ts`: replace `queue.shift()` with `queue[head++]` pattern (line ~231)

- [ ] T022 [W3] Write SC-005 BFS performance regression test: full 32×32 board traversal (both INV-12 and INV-16 BFS paths) completes in under 1 ms; verify output byte-identical to pre-refactor (determinism)

**Wave 3 Checkpoint**: `pnpm --filter @europa/terrain test` (all existing tests pass + SC-005 BFS perf test)

---

## Wave 4: Networking Performance (#135)

**Purpose**: Broadcast view reuse, resync view cache, structural comparison.

- [ ] T023 [W4] Implement `viewsEqual` structural comparison in `packages/networking/src/broadcast.ts`: field-by-field equality check on `PlayerView` (player, config, events length, visibleCells length + per-cell owner/count/elevation/terrain/reservesPct/pipes); short-circuit on first difference; no allocation (FR-020)

- [ ] T024 [W4] Implement broadcast view cache in `packages/networking/src/broadcast.ts`: add `broadcastViewCache: Map<string, PlayerView>` to `MatchChannel`; in `buildTickBroadcast`, compute fog view once per unique `(playerId, spectator)` pair and cache; look up cached view for each connection (FR-018)

- [ ] T025 [W4] Implement resync view reuse in `packages/networking/src/resync.ts` (or `server.ts` resync path): when a reconnecting client requests a snapshot, check `broadcastViewCache` first; reuse if present (computed this tick), otherwise compute once and cache (FR-019)

- [ ] T026 [W4] Update `packages/networking/src/broadcast.ts` fingerprint: replace `stableStringify` with `viewsEqual` for delta detection; remove `fingerprint` and `stableStringify` functions

- [ ] T027 [W4] Write broadcast performance test: SC-005 broadcast phase (fog computation + delta encoding + serialization for all connections) completes in under 5 ms per tick on a 32×32 2-player board with 4 connections (2 players + 2 spectators)

**Wave 4 Checkpoint**: `pnpm --filter @europa/networking test` (all existing tests pass + broadcast perf test) + full `pnpm verify`

---

## Final Verification

After all waves complete:

- [ ] T028 Run `pnpm verify` — full repo verification (typecheck, lint, format, all package tests, browser tests, E2E, selfhost, design guards, conformance)
- [ ] T029 Update `specs/004-multiplayer-networking/spec.md` Implementation Notes with any shipped deviations
- [ ] T030 Update `specs/004-multiplayer-networking/quickstart.md` validation results appendix with new test mappings
- [ ] T31 Commit all changes with conventional commit message: `feat(networking): admission hardening + hot-path performance (#151, #135)`

---

## Task Dependency Graph

```
T001 → T002 (contract mirrors must match)
T001 → T003 (ErrorCode base type depends on union shape)
T004 → T006, T007, T008 (ServerConfig fields used by handlers)
T005 → T006, T007, T008 (constants used by handlers)
T006 → T007 (connection caps before origin check in upgrade handler)
T009 → T011 (error collapse before test updates)
T010 → T011 (rate limit change before test updates)
T013 → T014 (type definition before allocation)
T014 → T015 (allocation before tick refactor)
T015 → T016, T017 (tick passes buffers to resolution modules)
T019 → T020 → T021 (sequential BFS refactors in same file)
T023 → T024 (structural comparison before view cache)
T024 → T025 (view cache before resync reuse)
T026 → T027 (fingerprint replacement before perf test)
```

**Parallel-safe groups**:
- T001 || T004 || T005 (different files, no dependencies)
- T002 || T003 || T013 || T019 (different packages)
- T012 || T018 || T022 || T027 (test tasks, different packages)
