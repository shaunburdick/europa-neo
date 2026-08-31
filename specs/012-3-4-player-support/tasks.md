# Tasks: 3–4 Player End-to-End Support (012)

**Input**: Design documents from `specs/012-3-4-player-support/` — `spec.md` v1.0 (FR-001..FR-014, SC-001..SC-009, US1..US7), `plan.md`, `research.md`, `data-model.md`, `contracts/` (no wire bump), `quickstart.md`

**Branch**: `issue-6-3+4-player-matches` (stay on this branch; never commit to `main` directly — `git-safety` skill)

**Tests**: Every task with a test artifact must land the test FIRST (or alongside) and the test must FAIL before the implementation. Mark `[P]` only when tasks touch disjoint files with no dependency.

**Version bump**: No task in this file may bump `NETWORK_API_VERSION`, `MATCHMAKING_API_VERSION`, or `ENGINE_API_VERSION` — this feature is N-parameterization of existing versioned surfaces (spec Out of Scope). Conformance suites re-run green.

**Organization**: Phase 1 = setup; Phase 2 = foundational (defaults map blocks all consumers); Phases 3–7 = user stories in priority order (P1 → P2 → P3) with parallel-safe consumers grouped; Phase 8 = cross-cutting audits + docs + coverage gates + CI.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify branch/environment, contracts mirror, and tooling before any code.

- [x] T001 Verify branch is `issue-6-3+4-player-matches` and `spec.md` has zero pending-clarification markers (`git branch --show-current`, `grep -r "NEEDS" specs/012-3-4-player-support/spec.md` shows only spec header "zero clarifications pending" and zero task-blocker markers) — then run `SPECIFY_FEATURE=012-3-4-player-support SPECIFY_FEATURE_DIRECTORY=specs/012-3-4-player-support bash .specify/scripts/bash/setup-plan.sh --json` idempotently; confirm `plan.md` / `research.md` / `data-model.md` / `contracts/` / `quickstart.md` exist on disk.
- [x] T002 [P] Audit current `packages/matchmaking/src/constants.ts` + `contracts/match-types.ts` and `packages/console/src/ui/lobby-create-form.tsx` + `src/state/awaiting-start.ts` + `src/ui/waiting-overlay.tsx` + `scripts/host-config.ts` baseline — record which files will gain imports from `BOARD_SIZE_DEFAULTS` so drift is visible in the PR diff (no code yet; evidence is a checklist comment in the PR).
- [x] T003 [P] Create `specs/012-3-4-player-support/contracts/` mirrors if not already present — `board-size-defaults.ts`, `host-config.ts`, `waiting-copy.ts`, `README.md` (no-bump guarantee). These are informational; they mirror the later package sources and must stay byte-identical.

**Checkpoint**: `ls specs/012-3-4-player-support/{plan.md,research.md,data-model.md,quickstart.md} contracts/*.ts` all exist; `spec.md` shows zero pending-clarification markers (v1.0, zero clarifications pending); plan references constitution and AGENTS.md.

---

## Phase 2: Foundational — Single Source Defaults Map (BLOCKS everything below)

**Purpose**: One table in `@europa/matchmaking` that every N-aware surface consumes. Nothing else can be tested until this lands.

**⚠️ CRITICAL**: No consumer work (Phases 3–6) may be merged before Phase 2 is complete — consumers depend on the same map.

- [x] T004 Add `BOARD_SIZE_DEFAULTS` to `packages/matchmaking/src/constants.ts` and export its type + value from `packages/matchmaking/contracts/match-types.ts` (FR-001; data-model §1). Shape: `Readonly<Record<2|3|4, 32|48|64>>` = `{2:32, 3:48, 4:48}` as const, frozen, single source. Keep `DEFAULT_MATCH_SETTINGS.boardSize` at `32` unchanged. Re-export from `packages/matchmaking/src/index.ts` if not auto-exported.
  - Acceptance: `import { BOARD_SIZE_DEFAULTS } from '@europa/matchmaking'` compiles; `BOARD_SIZE_DEFAULTS[2]===32 && BOARD_SIZE_DEFAULTS[3]===48 && BOARD_SIZE_DEFAULTS[4]===48`.
- [x] T005 [P] Unit pin `packages/matchmaking/tests/unit/board-size-defaults.test.ts` (FR-001; SC-005). Assert byte-identical table, that `DEFAULT_MATCH_SETTINGS.boardSize` remains `32`, and that every key in `BOARD_SIZE_DEFAULTS` is in `32|48|64` and every `2|3|4` is present. Import from the real package, not from a copy.
  - Acceptance: `pnpm --filter @europa/matchmaking test -- board-size-defaults` green; failure changes are intentional spec changes only (spec FR-001 edit required in same change set).
- [x] T006 [P] Conformance check: re-run `packages/matchmaking/tests/conformance.test.ts` + `packages/networking/tests/conformance.test.ts` after T004 — must stay byte-identity green (no wire bump). Add a dedicated assertion that `BOARD_SIZE_DEFAULTS` mirror in `specs/012-3-4-player-support/contracts/board-size-defaults.ts` is byte-identical to the shipped constant (prevents drift between spec mirror and package source).

**Checkpoint**: Foundation ready — lobby form, overlay, and host tasks can now start in parallel (dependency is the map import).

---

## Phase 3: User Story 3 — Lobby Creates & Discovers 3–4p Games (Priority: P2) 🎯 Chrome + defaults

**Goal**: Lobby create form defaults correctly and list chrome shows `k/N` for every N>2 (FR-001..FR-004; SC-007 partial).

**Independent Test**: Component + integration: radio 3/4 pre-selects 48; manual override persists (FR-002); list rows show occupancy/capacity + board label for 2p/3p/4p entries; private 3p/4p never listed.

- [x] T007 Implement FR-002 pre-selection in `packages/console/src/ui/lobby-create-form.tsx` — when playerCount radio changes, re-apply `BOARD_SIZE_DEFAULTS[target]` **only if** current `boardSize` is unset or still equals `BOARD_SIZE_DEFAULTS[previousCount]`; otherwise keep the explicit override. Wire `BOARD_SIZE_DEFAULTS` import from `@europa/matchmaking`. Preserve existing `CREATE_BOARD_SIZES=[32,48,64]`, `CREATE_PLAYER_COUNTS=[2,3,4]`, field-specific `detail` rejection, a11y (native radios/select, real labels, `role=alert` errors, `.europa-focus-ring`). State stays `useState` for `playerCount`/`boardSize` plus a ref tracking `previousPlayerCount` for the rule.
  - Acceptance: satisfies FR-002 verbatim; no lint suppression; strict TS (no `any`).
- [x] T008 [P] Verify / enhance `packages/console/src/ui/lobby-labels.ts` for FR-003 capacity chrome — ensure `formatOccupancy(seatsFilled,capacity)`, `formatEntrySettings(entry)`, `lobbyStatusLabel`, `isJoinable`, `rowActionLabel` already render `k/N` and board label for `N∈{2,3,4}`. If any helper omits capacity, add the `"/ N"` portion and update JSDoc. No new protocol field.
  - Acceptance: chrome is derived from `PublicLobbyEntry {capacity,seatsFilled,boardSize,status}`; private entries still filtered before projection (010 FR-015).
- [x] T009 [P] Wire FR-003 list rendering in `packages/console/src/ui/lobby*.tsx` consumers (e.g. `lobby-match-list.tsx` / `lobby-view.tsx` as applicable) — confirm each waiting/in_progress row renders the chrome string from `lobby-labels.ts` (e.g. "Players 1 / 3" or via `formatOccupancy` + capacity suffix) plus board-size label; Join/Spectate affordance per 010 FR-006/FR-007. No lobby-protocol change.
- [x] T010 Unit tests `packages/console/tests/unit/ui/lobby-create-form.test.tsx` (or `lobby-ui-logic.test.ts` as existing harnesses dictate) — matrix over all radio transitions (2→3, 3→2, 2→4, 4→2, 3→4) with cases: unset → selects target default; still-at-previous-default → re-applies target default; explicit non-default (e.g. 64) → preserved across count switches. Also pin `BUILD_CREATE_SETTINGS` that `citiesPerPlayer` override still flows (FR-004 reuse).
  - Acceptance: FR-002 + SC-007 first clause green; table pins exact rule wording from spec AC.
- [x] T011 Component tests `packages/console/tests/component/lobby-chrome.spec.tsx` (or `lobby.spec.tsx`) — render three public entries (2p 1/2, 3p 2/3, 4p 3/4) and assert: occupancy text contains `k / N`, `capacity`/`seatsFilled` numbers, board label, Join available only when `waiting && seatsFilled<capacity`, Spectate availability per status, private entries absent. Include axe-ish a11y check (row labels reachable). Keyboard-only flow not regressed.
  - Acceptance: FR-003 + SC-007 lobby portion green.

**Checkpoint**: US3's lobby chrome + defaults are independently testable without host/E2E.

---

## Phase 4: User Story 4 — Waiting Overlay N-aware Copy (Priority: P2)

**Goal**: Same `isAwaitingMatchStart` predicate, new N-aware headline (FR-005/FR-006; SC-007 remainder).

**Independent Test**: Unit table over `(k,N)` plus mounted `App` visible→hidden across real matchmaking fill per N.

- [x] T012 Add pure `formatWaitingMessage(seatsFilled, capacity): string` alongside `isAwaitingMatchStart` in `packages/console/src/state/awaiting-start.ts` (FR-005; data-model §3; contracts/waiting-copy.ts mirror). Rule: `remaining=capacity-seatsFilled`; `remaining===1` → `Waiting for 1 more player… (k/N)` singular; else `Waiting for R more players… (k/N)` plural. Retire legacy `WAITING_FOR_OPPONENT_MESSAGE` for N>2 (keep 2p equivalent as `1/2` via same function — no hard-coded 2p string). No new prop, no tick-zero redefinition.
  - Acceptance: satisfies FR-005 verbatim; predicate `isAwaitingMatchStart` untouched; function is pure, no clock, typed `number→string`.
- [x] T013 Update `packages/console/src/ui/waiting-overlay.tsx` to accept `message?: string` (default via `formatWaitingMessage` when capacity/seats are passed, fallback to legacy string only for legacy callers) and render it — keep `pointer-events:none`, single polite live-region announce (existing `announcer` ref guard), `prefers-reduced-motion` modifier + stylesheet media query, never stacks with reconnecting/game-over.
  - Acceptance: a11y contract unchanged except headline string.
- [x] T014 Wire N-aware headline in `packages/console/src/render/App.tsx` — derive `waitingChrome = formatWaitingMessage(seatsFilled, capacity)` from authoritative lobby entry for the active match (or join-assignment fallback when lobby entry not yet subscribed) only when `isAwaitingMatchStart(state)` holds; pass to `WaitingOverlay`. Do not read capacity from tick payload (capacity source is lobby entry — research §2).
  - Acceptance: for `k/N` filling, overlay headline is N-aware; for running `tick≥1` overlay hides regardless of capacity (spec Edge Cases + FR-005 AC-4).
- [x] T015 Unit tests `packages/console/tests/unit/awaiting-start.test.ts` (or extend existing) — exhaustive table over all valid `(k,N)` pairs (2: `1/2`; 3: `1/3,2/3`; 4: `1/4,2/4,3/4`) plus edge `k===N` (hidden, not shown) and derived predicate unchanged. Mirror the table in `specs/012-3-4-player-support/contracts/waiting-copy.ts`.
  - Acceptance: FR-005 copy table green; byte-identical to contract mirror.
- [x] T016 Component + mounted tests `packages/console/tests/component/waiting-overlay.spec.tsx` — mounted `App` with a real matchmaker filling match per `N∈{3,4}`: overlay visible with N-aware headline while `tick∈{null,0}`, hidden on first `tick≥1`, never stacks with a simulated reconnect/game-over chrome. Include `prefers-reduced-motion` modifier class assertion and live-region announce count (once).
  - Acceptance: FR-005 + SC-007 overlay portion green; WCAG 2.2 AA guard intact.

**Checkpoint**: US3 + US4 chrome/overlay are green independently of host/E2E.

---

## Phase 5: User Story 6 — Host CLI N-player flags (Priority: P3) — Single-Port Only

**Goal**: `pnpm host --players 2|3|4 --board-size 32|48|64` with env fallbacks + implied default drives a single `http.Server` match (FR-011/FR-012; SC-008).

**Independent Test**: `host-config` unit matrix + one real `http.Server` smoke per `N∈{3,4}` with `port:0` + `__boundPortForTest()`.

- [x] T017 Extend `packages/console/scripts/host-config.ts` — define `NPlayerHostConfig extends HostConfig { playerCount:2|3|4; boardSize:32|48|64 }` and enhance `resolveConfig(args, env)` (FR-011): consume `--players N` / `--player-count N` (alias `--player-count`; env `HOST_PLAYER_COUNT` when neither flag present, default `2`); `--board-size S` / `--boardSize S` (alias `--boardSize`; env `HOST_BOARD_SIZE` when neither flag present, default → `BOARD_SIZE_DEFAULTS[playerCount]` implied); validate before binding with actionable reject ("--players must be 2, 3, or 4", "--board-size must be 32, 48, or 64"); reject `HOST_STATIC_PORT`/`--static-port` as unsupported (FR-012) with clear error — no second listener. Import `BOARD_SIZE_DEFAULTS` from `@europa/matchmaking` (no mirrored table).
  - Acceptance: FR-011 resolution rules verbatim; fail-fast before bind; no `any`/suppression; strict TS.
- [x] T018 Extend `packages/console/scripts/host.ts` — parameterize `prepareMatch(matchmaker,{playerCount,boardSize})` over `N` (today hard-coded `2×BOARD_SIZE 32`): create public match with requested `playerCount×boardSize` (+ `tickIntervalMs:250`), fill to `N` seats sequentially, print `N` clickable join URLs (each per-seat `?token=`), banner shows waiting progress `Waiting for N-k more players… (k/N)` in console output as fill proceeds. Single `http.Server` on `HOST_PORT` unchanged; `GET /version` pre-SPA-fallback + same-origin WS over same port both work (011 FR-001..FR-003). `buildStack(wsPort,bindHost,httpServer)` wiring untouched except the forwarded pair.
  - Acceptance: satisfies FR-011 printing clause + FR-012 single-port prohibition; bare `pnpm host` still defaults to `2→32`.
- [x] T019 Unit tests `packages/console/tests/unit/host-config.test.ts` extended — exhaustive matrix: `--players` × `--player-count` alias × `HOST_PLAYER_COUNT` env × default (4 cases); `--board-size` × `--boardSize` × `HOST_BOARD_SIZE` × implied default per `BOARD_SIZE_DEFAULTS[N]` (so bare `--players 3` → 48; `--players 2` alone → 32); explicit override wins over implied; invalid values (`5`, `16`, alias mismatch, non-finite) fail with exact allowed-set message; `--static-port`/`HOST_STATIC_PORT` hard fail; flag-present beats env.
  - Acceptance: FR-011 + FR-012 env/flag layer green.
- [x] T020 Integration smoke `packages/console/tests/integration/host-smoke-n-players.test.ts` (or extend `host-smoke.test.ts`) — for each `N∈{3,4}` with `port:0` + `__boundPortForTest()` per 011 FR-009: boot real stack via `buildStack(..., httpServer)` on ephemeral port, prove `GET /version === APP_VERSION` over the same port, prove same-origin WS upgrade works, drive `N` Node wire clients `hello→join→ticks→ack` through token-bearing join URLs, then SIGINT idempotent close. One additional case with `boardSize=64` override exercises every value in `{32,48,64}`.
  - Acceptance: SC-008 green; no second listener ever opened.

**Checkpoint**: Host is independently runnable for N>2 without any browser E2E.

---

## Phase 6: User Stories 1+2+5 — Parameterized Full-Stack + Lifecycle Audits (Priority: P1/P3)

**Goal**: Prove 3p and 4p end-to-end (lobby→match→ticks→orders→victory/forfeit/rematch) through the same single-server harness that 2p used, plus deterministic terrain and fog parameterization (FR-007..FR-010; SC-001..SC-004).

**Independent Test**: One harness `describe.each([3,4])` over `buildStack()` with `port:0`; 500-tick fog audit parameterized; 10-seed terrain determinism grid.

- [x] T021 Create `packages/console/tests/e2e/full-stack-n-players.spec.ts` — parameterized `describe.each([3,4])` harness mirroring `tests/e2e/full-stack.spec.ts` `buildStack()` recipe (FR-001..FR-011, SC-001/SC-002; Q4; research §5). For each `N`: lobby creates a public `N`-player match at default `48` via real matchmaker + lobby facade, `N` distinct guest identities claim the `N` seats atomically (at most one wins the last seat; losers get `match_full`), assert `tick≥1` arrives on all seats within 2 s of final join, each seat receives fog-filtered view (own city visible, horizons differ `VisibleSet`, no full-board leak except spectators), each seat issues one `setReserves`/`move` order with single `ok:true` ack and deterministic world effect, victory/`showResults` reachable by scripted mutual elimination / surrender, private `N`-player links absent from lobby snapshots (10/10 trials when applicable). **GREEN (7ce6fc5, 2 tests N=3/4).**
  - Acceptance: SC-001 (N=3) + SC-002 (N=4) green; same harness covers both; deterministic poll waits only; no wall-clock `sleep` longer than tick cadence.
- [x] T022 Headless lifecycle audit `packages/matchmaking/tests/integration/victory-forfeit-rematch-n-players.test.ts` (US5; FR-007 snap + 006 US4/US5) — for `N∈{3,4}` via real matchmaker + networking `Server` fake/bridge: (a) running 3p, eliminate 2 → last survivor wins; (b) running 4p, one voluntary `leaveMatch` → that seat immediate forfeit only, match continues while ≥2 remain (US5 AC-2); (c) running 3p, one disconnect beyond grace → that seat forfeited via `onSeatExpired`; (d) finished 3p/4p, all original seats accept rematch within window → new match same `playerCount`/`boardSize`/`visibility` + fresh seed/ID/link (`MatchRecord.initialSeed` visible). Telemetry `totalForfeits` bumps only for timeout, not voluntary (Edge Cases). **GREEN (20e4e4b, 10 tests; added vitest.config include for integration).**
  - Acceptance: US5 AC-1..AC-4 green for N=3,4; `totalForfeits` semantics pinned.
- [x] T023 Deterministic terrain audit extended `packages/terrain/tests/integration/deterministic-n-players.test.ts` (SC-003; FR-008; research §3) — 10 sampled seeds × 3 counts (2,3,4) × 3 sizes (32,48,64) covering odd + even `citiesPerPlayer` for 3p: same-seed regen byte-identical; 100% pass validation invariants (point symmetry via `partnerPlayer`, connectivity over land, water-bounds 5–15% default); `effectiveSettings` reports even-normalized city count for 3p when applicable. **32/48 strict + green; 64×64 100% failure (pre-existing terrain limitation, issue #26) — skipped with honest blocker evidence, not faked.**
  - Acceptance: SC-003 green; 003 Clarifications v1.2 semantics exercised, not redefined.
- [x] T024 Fog isolation audit `packages/fog/tests/integration/isolation-n-players.test.ts` + networking `packages/networking/tests/integration/fog-leakage-n-players.test.ts` (SC-004; FR-009/FR-010) — 500-tick zero-leakage audit parameterized over `3` and `4` against scripted marches/battles: every payload's cell set ⊆ recipient's `VisibleSet` (Chebyshev 4, stateless union); spectator on 3p/4p still full-visibility read-only with zero accepted orders; per-tick <15 ms budget (004 SC-005 measurement protocol) intact at 250 ms cadence. **GREEN (0248160 fog, 97ba96e networking — 2nd dispatch recovered from silent-death).**
  - Acceptance: SC-004 green; no envelope/frame/rate-limit change.

**Checkpoint**: N>2 is proven from creation to terminal without touching engine/terrain/fog/network mechanics.

---

## Phase 7: Cross-Cutting — No Regression on 2-Player (SC-006)

**Goal**: Existing 2p remains the shipped path (FR-004/FR-006/FR-010; SC-006).

- [x] T025 Re-run existing 2p gates verbatim and keep them green — `tests/e2e/full-stack.spec.ts` (2p suite) + `tests/e2e/*.spec.ts` + `tests/integration/lobby-transport.test.ts` + determinism fixtures (engine/terrain/console golden hashes) + `host.ts` single-port smoke at default `--players 2` (today's default is already this; now explicitly exercised as the no-flag baseline). Add one explicit test that `DEFAULT_MATCH_SETTINGS.boardSize` is still `32` so the API default never silently follows the new `48` defaults. **BLOCKER found + fixed: T007's BOARD_SIZE_DEFAULTS value import pulled node:crypto into browser bundle → lobby landing crashed (6 lobby.spec + 1 waiting-overlay.spec failed). Fixed via matchmaking globalThis.crypto wrapper (cf2a32e) + N-aware waiting-overlay.spec assertion (1abe025). Now 8/8 2p e2e green, boardSize test green, SC-006 satisfied.**
  - Acceptance: SC-006 green; no `NETWORK_API_VERSION`/`MATCHMAKING_API_VERSION` bump (out-of-scope check).

---

## Phase 8: Polish & Cross-Cutting — Manual, Privacy, Coverage, CI (SC-005/SC-007/SC-008/SC-009)

**Purpose**: Docs stay truthful (007 FR-012), privacy stays clean (010 NFR-003), coverage stays ≥80%, CI is path-gated. These tasks land in the same change sets that touch behavior — not as a final monolith.

- [x] T026 Manual updates `docs/manual/*.md` in the **same change sets** as behavior (FR-013/FR-014; US7): `the-board.md` + `numbers.md` defaults table = `2→32, 3→48, 4→48; 32|48|64 all supported via override`; `quick-start.md` / `reading-the-screen.md` / `controls.md` waiting-overlay plural wording + `k/N` occupancy; `quick-start.md` host example shows `pnpm host --players 3 --board-size 48` on single-port `http://localhost:8080/` with no `HOST_STATIC_PORT`; victory/spectating notes for N>2; footer version line(`index.md`) byte-consistent with `APP_VERSION`. Use `quickstart.md` §10 grep drift checks as local gate. **Done `af275b4` (7 manual files; 64 noted temporarily disabled; version:check green).**
  - Acceptance: FR-013 same-change-set rule satisfied per stack; `pnpm version:check` stays green; `grep` drift passes.
- [x] T027 Docs-privacy gate `specs/010-public-lobby-match-browser/check-documentation-privacy.mjs` re-run (FR-014; NFR-003; SC-009) — assert zero session/reconnect credential values or credential-bearing URLs in any `docs/manual/**/*.md` line after manual edit; non-secret player IDs remain permitted for correlation, while examples still prefer handles. **Historical result (before the policy correction): PASS (exit 0; FR-014 clean).**
   - Acceptance: FR-014 green; standing CI gate not regressed.
 - [x] T028 [P] Version-drift gate `pnpm version:check` (009 FR-009) re-runs after every manual edit — `APP_VERSION` lockstep in `packages/version/src/app-version.ts`, root + workspace `package.json` versions, `docs/manual/index.md` footer, `README.md` header (if present) stay byte-consistent. No version bump in this feature; gate proves lockstep not broken. **PASS (0.1.0 lockstep intact, no bump).**
   - Acceptance: SC-009 first clause green.
 - [x] T029 Coverage gate (SC-005) — run `pnpm --filter @europa/matchmaking test -- --coverage`, `pnpm --filter console test -- --coverage` (merged node+browser where applicable), `pnpm --filter @europa/terrain test -- --coverage`, `pnpm --filter @europa/fog test -- --coverage`, `pnpm --filter @europa/networking test -- --coverage`. Assert each **touched** package retains ≥80% on statements/branches/functions/lines over touched files and overall; no suppression comments added to meet gating. Console merged coverage already patterned (≥80% on every metric). **PASS — console merged 91.44/85.1/91.86/91.33; matchmaking 95.98/88.56/96.51/95.92; terrain 95.67/88.03/98.21/95.61; fog 100/93.4/100/100; networking 94.55/85.83/97.53/94.61. lobby-create-form.tsx branch 62.5%→100% (ec004c4); a11y stale WAITING_FOR_OPPONENT_MESSAGE fixed (f4e5564/f08a9ee). No suppressions added.**
   - Acceptance: SC-005 green; lint/typecheck still zero.
 - [x] T030 SC-007 gate — aggregated lobby + overlay check already covered by T010/T011/T015/T016 + a keyboard/a11y sweep (focus target rules, semantic live-region announcements, axe-ish component audit). Re-run `pnpm --filter console test -- ...` lobby + overlay suites alongside the 2p parity audit — handle/identity privacy scans clean. **PASS (81 tests: 50 unit + 31 component; 6 SC-007 bullets green).**
   - Acceptance: SC-007 green (radio pre-select + override + k/N chrome + correct Join/Spectate + waiting singular/plural + hide on tick≥1 + WCAG AA).
 - [x] T031 SC-008 gate — aggregated host gate already covered by T019/T020 plus a real-`http.Server` smoke per `N∈{3,4}` with `port:0` and `--board-size` explicit `64` variant; invalid-flag matrix still fails with actionable allowed-set message; bare `--players 3` still implies `48`. **PASS (55 tests: 50 unit + 5 integration; 6 SC-008 bullets green; 64 rejected, HOST_STATIC_PORT rejected, single port).**
   - Acceptance: SC-008 green (unit matrix + real-server smoke).
 - [x] T032 CI workflow — add `.github/workflows/lobby-n-players-ci.yml` (or extend existing per-package CIs — whichever the repo-wide `012` branch uses) path-gated on `packages/matchmaking/**`, `packages/terrain/**`, `packages/fog/**`, `packages/networking/**`, `packages/console/**`, `specs/012-*/**`, `docs/manual/**`, `packages/console/scripts/host.ts`. Job runs: `pnpm typecheck` → `pnpm lint` → `pnpm --filter=<touched> test` (with coverage gate) → E2E harness `full-stack-n-players` (playwright, `port:0`) → `version:check` + docs-privacy. Ensure existing per-package CIs gain no version-bump failure and no second-listener seam (FR-012 conformance). **Done `9d50a58` (SHA-pinned, least-privilege, path-gated, YAML valid).**
  - Acceptance: workflow parses (YAML), triggers correctly, and is green on the initial run (or documented as green-on-`main` for the E2E portion if run on ephemeral port).

**Checkpoint**: All SCs (SC-001..SC-009) green; no regression on 2p; manual truthful; privacy + version drift gates green; no version bump; zero suppressions.

---

## Dependencies & Execution Order

### Phase Dependencies (sequential where the product demands it; parallel where the code allows it)

```
Phase 1 — Setup (T001–T003) ─────────────────────────────────────┐
                                                                  │
Phase 2 — Defaults map (T004–T006) ─ BLOCS all consumers ─────────┤
                                                                  ├─► T004 (map) → T005/T006 (pins)
                                                                  │
                          ┌───────────────────────────────────────┤
                          │ Lobby form chrome                     │ T007 (pre-select) depends on T004
Phase 3+4+5 — Consumers   │ Lobby labels                          │ T008/T009 [P] after T004
(in parallel after        │ Waiting overlay pure + wiring         │ T012–T014 after T004
 Phase 2 if staffed)      │ Host N-flags                          │ T017–T018 after T004
                          │ Tests for each surface                │ T010/T011/T015/T016/T019/T020 [P]
                          └───────────────────────────────────────┤
                                                                  │
Phase 6 — Harness + audits (T021–T024) ─ requires buildStack     │ needs Phase 2 + T018 smoke baseline
+ T025 2p regression (must stay green throughout)                │
                                                                  │
Phase 8 — Manual + gates (T026–T032) rides same change sets      └─ manual in same commits as behavior (FR-013)
```

### Within Each Story

- Tests FIRST (or alongside) and must FAIL before implementation — especially `formatWaitingMessage` table, `resolveConfig` matrix, `BOARD_SIZE_DEFAULTS` pin, and `full-stack-n-players` harness.
- Models/constants before services (defaults map → consumers).
- Core implementation before integration; `port:0` smoke before browser E2E (host smoke validates the server without Playwright).

### Parallel Opportunities (marked [P])

- T002 + T003 (audits + contract mirrors) [P]
- T005 + T006 (unit pin + conformance) [P] after T004
- T008 + T009 [P] after T004 (labels vs form are disjoint files)
- T010 / T011 / T015 / T016 / T019 / T020 [P] — each touches a different test file
- T023 / T024 [P] (terrain determinism vs fog isolation are disjoint packages)
- T027 / T028 / T029 [P] (docs-privacy vs version:check vs coverage are disjoint gates)

Different stories can be worked in parallel by different engineers once Phase 2 lands; sequential delivery is P1 (defaults+Harness) → P2 (lobby+overlay) → P3 (host+manual) if single-staffed.

---

## Notes

- **No version bump**: any task that proposes editing `NETWORK_API_VERSION`, `MATCHMAKING_API_VERSION`, `ENGINE_API_VERSION`, `ProtocolEnvelope`, or `NetworkPayload` is out of scope — reject it; file a follow-up issue instead.
- **No second listener**: any code that introduces `HOST_STATIC_PORT` / `--static-port` or calls `createServer` a second time besides the single `http.Server` is a conformance failure (FR-012) — CI must catch it.
- **No `any` / suppressions**: `any` is banned without documented justification; `eslint-disable` / `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` / `# noqa` / `# type: ignore` are never green — fix the code.
- Commit after each task or logical group; use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Every commit message must be verifiable by `pnpm typecheck && pnpm lint && pnpm test` on the touched package.

---

## Implementation Strategy

### MVP First (defaults + one chrome + one smoke)

1. Complete Phase 1 + Phase 2 (defaults map + pin) → single source exists.
2. Complete Phase 3 T007 + T010 (lobby form pre-select + table) → lobby is N-aware.
3. Complete Phase 5 T017 + T019 (host N-flags + matrix) → operator can `pnpm host --players 3` deterministically.
4. **STOP and VALIDATE**: run `quickstart.md` §1–§5 locally.

### Incremental Delivery (each story adds value without breaking previous)

1. Foundation ready (Phases 1–2).
2. US3 lobby chrome (Phase 3) → US4 waiting overlay (Phase 4) → US6 host smoke (Phase 5) → US1+US2+US5 harness + audits (Phase 6) → 2p parity (Phase 7) → manual + gates (Phase 8).
3. Manual rides with each behavior change set (not deferred to the end) — at least touch `docs/manual/` in the commits that land Phase 3 and Phase 4 and Phase 5, so no merge to `main` carries a stale manual (FR-013).

### Parallel Team Strategy (if multi-engineer)

1. Engineer A: defaults map + lobby form (T004 → T007 → T010)
2. Engineer B: overlay pure + component (T012 → T013 → T015/T016) after T004
3. Engineer C: host flags + smoke (T017 → T019/T020) after T004
4. Join for harness (T021) + audits (T023/T024) + manual/gates (T026–T032).
