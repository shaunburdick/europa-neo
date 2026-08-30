# Implementation Plan: 3–4 Player End-to-End Support (012)

**Branch**: `issue-6-3+4-player-matches` | **Date**: 2026-08-28 | **Spec**: [`specs/012-3-4-player-support/spec.md`](./spec.md) v1.0 (Draft, zero clarifications pending)
**Dependencies**: 001 engine FR-019 · 003 terrain Clarifications v1.2 · 002 fog · 004 networking · 006 matchmaking `playerCount:2|3|4` · 010 lobby · 005 console waiting overlay · 011 single-port host · 007 manual FR-012 · 009 versioning
**Research**: [`research.md`](./research.md) | **Data Model**: [`data-model.md`](./data-model.md) | **Contracts**: [`contracts/`](./contracts/) | **Quickstart**: [`quickstart.md`](./quickstart.md)

**Input**: Feature specification from `specs/012-3-4-player-support/spec.md` v1.0 — make 3- and 4-player matches joinable, startable, playable, spectatable, and self-hostable through the existing lobby → match → console path while preserving determinism, fairness, fog isolation, and 2-player compatibility.

> Produced via the `/speckit.plan` workflow. Branch `issue-6-3+4-player-matches` is the per-issue branch (AGENTS.md: never commit to `main` directly). Plan artifacts live under `specs/012-3-4-player-support/`.

---

## Summary

Feature 012 is **N-parameterization of an already-capable stack**, not a new backend. Engine (001 FR-019) already simulates 2–4 players, terrain (003 v1.2) already generates valid 3p boards, networking (004) is player-count-agnostic, fog (002) is per-seat, and matchmaking (006) already validates `playerCount:2|3|4` and auto-starts when seats fill. What shipped as 2-player-only was the **product surface**: lobby defaults/chrome, console waiting copy, host CLI, E2E harness, and manual.

This plan wires those surfaces:

1. **Single source map** `BOARD_SIZE_DEFAULTS: Record<2|3|4, 32|48|64>` = `{2:32, 3:48, 4:48}` in `@europa/matchmaking` — consumed by lobby create form pre-selection (FR-002) and host implied-size (FR-011). `DEFAULT_MATCH_SETTINGS.boardSize` stays `32` for API compatibility; the map is additive.
2. **Lobby create form** gains FR-002 pre-select/override discipline (re-apply default only when current size is unset or still the previous count's default).
3. **Lobby list chrome** renders `seatsFilled / playerCount` capacity for every public entry (FR-003) — already present as `capacity`/`seatsFilled` on `PublicLobbyEntry`; this feature makes the "/ N" portion deliberate for `N>2`.
4. **Console `WaitingOverlay`** becomes N-aware (FR-005): same `isAwaitingMatchStart` predicate, new copy `formatWaitingMessage(k, N)` with singular/plural.
5. **Host `resolveConfig`/`HostConfig` extends to `playerCount` + `boardSize`** with `--players`/`--board-size` flags + `HOST_PLAYER_COUNT`/`HOST_BOARD_SIZE` env, implied default per FR-001, validated before bind, single `http.Server` invariant preserved (FR-012).
6. **One parameterized harness** proves SC-001/SC-002 (3p and 4p) sharing the `buildStack()` recipe (`port:0` + `__boundPortForTest()` per 011 FR-009); deterministic terrain / fog audits parameterized over `N∈{3,4}` (SC-003/SC-004); manual updated in same change sets (FR-013/FR-014).

No wire, envelope, frame-codec, or version-constant bump. No engine/terrain/fog/networking mechanic change.

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (all packages extend `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`). Targets Node.js ≥ 22 LTS (Biome 2.5+ floor; Docker image is `node:24-slim` per 011 — dev engine `>=22.0.0`).

**Primary Dependencies** (no new runtime deps):
- `typescript@^5.6` (via `catalog:`), `vitest@^4` + `v8` coverage, `@biomejs/biome@^2` (extends root `biome.jsonc` + `biome-config-shaunburdick`), `tsup@8` (library packages), `vite@^6` (console), `ws@^8` (networking `noServer:true`), `tsx` (scripts)
- Workspace packages for types only where needed: `@europa/engine`, `@europa/terrain`, `@europa/fog`, `@europa/networking`, `@europa/matchmaking`, `@europa/version`, `packages/console`

**Storage**: N/A — pure in-memory. Matches, lobby ledger, identity registry, sessions remain ephemeral. Host `pnpm host` reset semantics unchanged (011). Matches already `Map<MatchId, MatchRecord>` + `Map<PlayerSessionId, PlayerSession>` (006); lobby is `Map<ConnectionId, …>` + ledger (010).

**Testing**: Vitest 4 (unit / integration / coverage with 80% gate per constitution III), Playwright (E2E two-browser + N-player full-stack), `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm version:check` / `check-documentation-privacy.mjs`. Coverage is merged node+browser for console (011's pattern). Every FR maps to a test file or harness listed in `tasks.md`.

**Target Platform**: Node.js ≥ 22 for host/server; browsers (Chromium via Playwright for E2E) for console/lobby. Single `http.Server` on `HOST_PORT` (011 FR-001/FR-002) — no second listener ever (FR-012).

**Project Type**: Library extensions within pnpm-workspaces monorepo + SPA console. Three touched surfaces: `packages/matchmaking` (source map), `packages/console` (lobby form + list chrome + waiting overlay + host script), `docs/manual` (truthful docs per 007 FR-012). Engine/terrain/fog/networking are **consumed**, not edited.

**Performance Goals** (map directly to SCs):
- **SC-001/SC-002**: auto-start within 2 s of final join (terrain p99 < 1 s on 48×48 — 003 SC-003 — + engine `createWorld` sub-ms + `registerMatch` µs). Harness asserts `tick≥1` arrives within 2 s.
- **SC-003**: 10 seeded × 3 sizes × 3 counts determinism byte-identical (003 SC-001); 100% pass validation invariants + 200-map balance suite extended to N=3,4 (003 SC-002/SC-004).
- **SC-004**: 500-tick zero-leak fog audit, per-tick < 15 ms budget (004 SC-005 measurement protocol) — ported to `N∈{3,4}`; spectator full-visibility read-only preserved.
- **SC-005/SC-006**: lobby list reflects lifecycle transitions within one tick (250 ms) — already pinned (006 SC-003 / 010 FR-013); chrome adds no extra tick.
- **SC-008**: host `resolveConfig` unit validated before bind (fail-fast actionable message); `port:0` smoke uses `__boundPortForTest()`.

**Constraints** (constitution + spec Out of Scope):
- TypeScript strict, zero `any` without documented justification, zero lint suppressions (`eslint-disable` / `@ts-ignore` / etc. forbidden) — code-quality skill.
- Server-authoritative deterministic tick simulation (constitution II): no wall-clock, no unseeded randomness, no floating-point drift in tick path; tunable numbers live in one constants location per package.
- ≥80% coverage on every metric over touched files and overall (constitution III — SC-005).
- Specs-as-docs (constitution IV): stale spec/manual is a bug; `docs/manual/` rides with behavior changes (FR-013).
- Simplicity over cleverness (constitution V): one defaults map, one harness parameterized over N, no protocol bump.
- WCAG 2.2 AA (constitution VI): lobby chrome + waiting overlay remain keyboard/screen-reader reachable, live-region announcements, reduced-motion honored.
- Self-hostable single-port (constitution VII + 011): one `http.Server`, one `HOST_PORT`, one `EXPOSE`; `HOST_STATIC_PORT`/`--static-port` remain unsupported failures (FR-012).
- No `NETWORK_API_VERSION` / `MATCHMAKING_API_VERSION` / `ENGINE_API_VERSION` bump (spec Out of Scope).

**Scale/Scope**:
- Touched files: `packages/matchmaking/src/{constants,match-types}.ts` + re-export; `packages/console/src/ui/{lobby-create-form,lobby-labels}.tsx?` + `state/awaiting-start.ts` + `ui/waiting-overlay.tsx` + `scripts/{host-config,host}.ts`; `docs/manual/*.md`; `specs/012-*` artifacts; one new workflow or extension of existing per-package CIs (path-gated).
- Unchanged at runtime: `packages/engine` (only test coverage extends), `packages/terrain` (only SC-003 audits), `packages/fog`, `packages/networking`.
- Up to 64 concurrent matches (006 `maxConcurrentMatches`); lobby projection O(N) per `listPublicMatches()` (N ≤ 64); E2E harness spawns 3–4 WebSocket clients over one ephemeral server.

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-checked after Phase 1 design (see last row).*

| Principle | Gate (from `.specify/memory/constitution.md`) | This plan | Status |
|-----------|-----------------------------------------------|-----------|--------|
| **I — Type Safety First** | `strict: true`, no `any` without justification, no suppressions | All new types are branded/closed unions (`BoardSizeDefault`, `PlayerCount=2\|3\|4`, `NPlayerHostConfig` extends `HostConfig`); `formatWaitingMessage(k,N): string` is pure with exhaustive singular/plural branch; `resolveConfig` returns `NPlayerHostConfig \| null` (never throws for expected validation). No `any`, no `eslint-disable`/`@ts-ignore`. | ✅ Pass |
| **II — Server-Authoritative Deterministic Simulation** | Server owns state; fixed ticks; no wall-clock in simulation; deterministic replay | No tick/physics change. Defaults map is declarative (no clock). Host flag parsing happens pre-bind (outside simulation). Terrain determinism audited per SC-003 (byte-identical regen); fog isolation per SC-004 (stateless Chebyshev-4 union). Engine invariants unchanged (FR-007/FR-008). | ✅ Pass |
| **III — Tested Game Logic ≥80%** | Coverage gate on game logic; behavior tests | SC-005: every touched package retains ≥80% on stmts/branches/funcs/lines (merged node+browser where applicable). New logic (defaults map, `formatWaitingMessage`, `formatOccupancy` capacity, `resolveConfig` N-flags) is unit-testable pure functions. E2E parameterized over N exercises victory/forfeit/rematch for >2 players (SC-001/SC-002). No test-typechecking gap fix (AGENTS.md tradeoff preserved — dedicated strict programs cover it). | ✅ Pass |
| **IV — Specs as Documentation** | In-repo specs are source of truth; stale specs are bugs; manual rides with behavior (007 FR-012) | This plan + `research.md` + `data-model.md` + `contracts/` are co-committed. Every change set that touches lobby/console/host defaults updates `docs/manual/` in same commit(s) (FR-013). Version footer lockstep via `pnpm version:check` (009 FR-009). Docs-privacy check stays green (FR-014). | ✅ Pass |
| **V — Simplicity Over Cleverness** | YAGNI; prefer boring, justified complexity | One `BOARD_SIZE_DEFAULTS` map (3 entries) in `@europa/matchmaking` — not a per-package config. One `formatWaitingMessage` helper, not a new overlay component. One harness parameterized `describe.each([3,4])`, not two suites. No new package, no new runtime dep, no new protocol field. Second-port prohibition preserved as invariant. | ✅ Pass |
| **VI — Accessibility-Minded UI** | WCAG 2.2 AA: keyboard, screen-reader, contrast, focus | Lobby chrome: `formatOccupancy` text is inside `PublicLobbyEntry` rows already labelled (`rowActionLabel` + `aria-labelledby`), Join/Spectate affordance per 010 FR-007 preserved. Waiting overlay: `pointer-events:none`, single polite live-region announcement (existing `WaitingOverlay` pattern), `prefers-reduced-motion` honored twice (modifier class + media query), never stacks with reconnect/game-over. Components remain native radios/select/button. | ✅ Pass |
| **VII — Self-Hostable by Default** | Single process, env/files config, no required cloud | Host collapses remain (011): one `http.Server` on `HOST_PORT`, `GET /version` + same-origin WS on same port, env `HOST_PLAYER_COUNT`/`HOST_BOARD_SIZE` + flag fallbacks, no new external service, `docker compose up` single mapping intact (011 NFR-001 path not regressed). | ✅ Pass |
| **Additional: Permissive licenses / no vendor lock-in** | MIT/BSD/Apache-2.0/ISC only; no proprietary API | Zero new deps; existing deps are MIT. No SaaS/provider coupling. | ✅ Pass |

**Post-Phase-1 re-evaluation**: after `data-model.md` + `contracts/` + `quickstart.md` are written, all gates remain green. No new state shape in matchmaking (FR-004) — the defaults map is a constant, not a record; capacity chrome is derived projection; waiting copy is derived string; host config is pre-bind CLI parsing only. No wall-clock enters simulation. No spec amendment required for upstream packages.

**No violations require Complexity Tracking.**

---

## Project Structure

### Documentation (this feature)

```text
specs/012-3-4-player-support/
├── spec.md              # v1.0 source of truth (12 FRs, 7 stories, 9 SCs)
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 — five decisions + alternatives + citations
├── data-model.md        # Phase 1 — delta over 006/010/005/011 (4 entities)
├── quickstart.md        # Phase 1 — runnable validation for SC-001..SC-009
├── contracts/           # Phase 1 — internal contracts + no-bump guarantee
│   ├── README.md        # declares zero versioned wire surface added
│   ├── board-size-defaults.ts  # source-map shape (informational mirror)
│   ├── host-config.ts          # NPlayerHostConfig additive shape (informational)
│   └── waiting-copy.ts         # formatWaitingMessage contract (informational)
└── tasks.md             # Phase 2 (/speckit.tasks output — NOT in this dispatch)
```

### Source Code (repository root — monorepo)

```text
.
├── specs/012-3-4-player-support/   # ← this feature's planning artifacts
├── packages/
│   ├── engine/                    # consumed — no edit (only extended 3p/4p coverage)
│   ├── terrain/                   # consumed — no edit (SC-003 audits only)
│   ├── fog/                       # consumed — no edit (SC-004 audits only)
│   ├── networking/                # consumed — no edit (SC-004/006 budgets intact)
│   ├── matchmaking/               # EXTENDED — source map lives here
│   │   ├── contracts/
│   │   │   └── match-types.ts     # add: BOARD_SIZE_DEFAULTS + BoardSizeDefault type
│   │   ├── src/
│   │   │   ├── constants.ts       # add: BOARD_SIZE_DEFAULTS export
│   │   │   └── index.ts           # re-export map
│   │   └── tests/
│   │       └── unit/board-size-defaults.test.ts  # pins table byte-identical
│   ├── console/                   # EXTENDED — three surfaces
│   │   ├── src/
│   │   │   ├── state/
│   │   │   │   └── awaiting-start.ts      # add: formatWaitingMessage(k,N)
│   │   │   ├── ui/
│   │   │   │   ├── lobby-create-form.tsx  # FR-002 pre-select/override
│   │   │   │   ├── lobby-labels.ts        # FR-003 formatOccupancy capacity already; ensure "/ N" chrome
│   │   │   │   └── waiting-overlay.tsx    # FR-005 N-aware copy via formatWaitingMessage
│   │   │   ├── render/App.tsx             # wire capacity/seats into WaitingOverlay
│   │   │   └── net/ws-match-client.ts     # unchanged (already N-agnostic)
│   │   ├── scripts/
│   │   │   ├── host-config.ts             # add: playerCount + boardSize + parsing
│   │   │   └── host.ts                    # add: --players/--board-size + implied default + N URLs
│   │   └── tests/
│   │       ├── unit/
│   │       │   ├── board-size-defaults.test.ts
│   │       │   ├── waiting-overlay.test.ts (extended)
│   │       │   └── host-config.test.ts    # --players/--board-size matrix
│   │       ├── component/
│   │       │   ├── lobby-create-form.test.tsx
│   │       │   └── waiting-overlay.spec.tsx
│   │       └── e2e/
│   │           └── full-stack-n-players.spec.ts  # parameterized 3p/4p harness
│   └── version/                   # preserved — APP_VERSION lockstep unchanged
├── docs/manual/                   # EXTENDED — FR-013 same-change-set updates
│   ├── the-board.md / numbers.md  # defaults table 2→32, 3→48, 4→48
│   ├── quick-start.md / reading-the-screen.md / lobby.md
│   └── index.md (footer version line)
└── .github/workflows/
    ├── lobby-n-players-ci.yml (or extend existing client/matchmaking CIs)
    └── version-drift.yml (path-gated — already covers docs/manual/**)
```

**Structure Decision**: No new package. The defaults map lives in `@europa/matchmaking` because matchmaking is the server-authoritative owner of `MatchSettings` (`playerCount`/`boardSize` → engine `MatchConfig`), and both lobby UI and host CLI are its consumers — one source prevents drift (spec Clarifications Q1). Console remains the rendering/hosting consumer; engine/terrain/fog/networking are not edited.

---

## Architecture Overview

### Data flow (extends 006 plan's diagram — lobby → match → console path)

```
Browser (lobby)                    Server (single http.Server :8080)           Packages
─────────────                      ─────────────────────────                   ────────
LobbyCreateForm                    createMatch({playerCount, boardSize,         @europa/matchmaking
  radio 2|3|4 ─┐   LobbyService ──►  terrainSettings})                          BOARD_SIZE_DEFAULTS
  board 32|48|64│  identity+handle   │  validates 2|3|4, board [8,128]           (single source)
  pre-select 48├─►  → Matchmaker ──► │  creates MatchRecord (filling, 1/N)       │
  for 3/4 ◄────┘     (facade)        │  lobby ledger ← PublicLobbyEntry          │
                                    │  broadcast revisioned snapshot ──────────►│ lobby-labels.ts
PublicLobby list                    listPublicMatches()                         formatOccupancy(k,N)
  "Players 1 / 3" ◄───────────────── projection k/N + board label + status      capacity chrome
  Join/Spectate                      (waiting / in_progress)                     FR-003
       │ JoinMatch
       ▼                            joinMatch → seats 2/N, 3/N …
Console (App + WaitingOverlay)     … last seat → generateBoard (003 v1.2)      @europa/terrain
  isAwaitingMatchStart               → createMatchSession (001 FR-019)           partnerPlayer,
  = live && tick∈{null,0}           → registerMatch + attachPlayers             even-normalization
  WaitingOverlay                    → running → TickPayload(tick≥1) ──────────► @europa/engine
   formatWaitingMessage(k,N)         per-seat fog-filtered broadcast (002)       @europa/fog
   "Waiting for N-k … (k/N)"                                                     @europa/networking
       │ tick≥1                        orders → ok:true + deterministic tick     (unchanged wire)
       ▼                            victory/forfeit/rematch (006 US4/US5)       terminal/surrender
Host CLI                             pnpm host --players N --board-size S       scripts/host.ts
  --players 3 ─┐  resolveConfig ──►  playerCount×boardSize (implied 48          resolveConfig
  --board-size?├─►  HostConfig+N     if S absent) → prepareMatch → N URLs       NPlayerHostConfig
  env fallback ┘                     single http.Server (FR-012)                 single-port
```

### Match lifecycle state machine delta

No new state. The existing 006 machine `filling → running → finished → collected` is exercised for `N∈{3,4}`. Auto-start on last seat fill (006 FR-007) is the transition `filling → running` already pinned by `joinMatch` atomicity. Forfeit (006 FR-010 + 004 FR-009) continues to inject `OrderSurrender` per seat; match does not end until `<2` players remain for `N>2` (US5 AC-2). Rematch (006 FR-009) re-creates with identical `playerCount`/`boardSize`/`visibility` + fresh seed/ID.

### Key design decisions (rationale summarized; full in `research.md`)

| # | Decision | Choice | Why (brief) |
|---|----------|--------|-------------|
| D1 | Default board size map | `2→32, 3→48, 4→48` in `@europa/matchmaking` as `BOARD_SIZE_DEFAULTS` | Spec Q1 ruling; preserves per-player land density (512 vs 576 cells/player) without forcing 64 on every 4p host; single source prevents lobby/host/manual drift (see research §1). |
| D2 | Board-size UI vs server clamp | UI allows `32\|48\|64` (presentation set); server clamp `[8,128]` remains on direct `createMatch` | Presentation constraint ≠ simulation capacity (spec Assumptions); direct API callers bypass UI — server clamp stays as safety net (research §2). |
| D3 | Lobby form pre-select override preservation | Re-apply target count's default only if current size is unset or still the previous count's default | FR-002 exact wording; prevents silent overwrite of explicit user choice; state is two `useState` + derived `prevPlayerCount` ref (research §3). |
| D4 | Capacity chrome source | Derive from `PublicLobbyEntry {capacity, seatsFilled, boardSize, status}` — no new protocol field | Entry already carries `capacity` (playerCount) + `seatsFilled`; chrome is presentation only (FR-003); no wire bump (research §4). |
| D5 | Waiting overlay derivation | Keep `isAwaitingMatchStart` predicate unchanged; add pure `formatWaitingMessage(k,N)` | FR-005 mandates predicate unchanged; copy becomes N-aware using authoritative capacity/seats already available to App from lobby join context (research §5). |
| D6 | Host flag layering | Additive `--players`/`--board-size` + env `HOST_PLAYER_COUNT`/`HOST_BOARD_SIZE` over `HostConfig` as `NPlayerHostConfig`; implied size = `BOARD_SIZE_DEFAULTS[playerCount]` when absent; validated before bind; fail-fast with allowed-set message | Spec Q3 ruling; additive only — bare `pnpm host` stays 2p→32; `HOST_STATIC_PORT`/`--static-port` remain unsupported failures (FR-012) (research §6). |
| D7 | E2E harness shape | One `tests/e2e/full-stack-n-players.spec.ts` parameterized `describe.each([3,4])` sharing `buildStack()` single-server (`port:0` + `__boundPortForTest()`) recipe | Spec Q4 ruling; reuse proven 2p harness (005 Integration wave + 011 FR-009); deterministic — no wall-clock waits, only poll conditions (research §7). |
| D8 | No version bump | No `NETWORK_API_VERSION` / `MATCHMAKING_API_VERSION` bump | All changes are additive UI/host + consumed-mechanic parameterization; wire `ProtocolEnvelope`/`TickPayload`/`SnapshotPayload` unchanged (Out of Scope). Conformance tests re-run green. |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **Terrain cost on 48×48 vs 32×32** — 2.25× cells; p99 budget is 1 s (003 SC-003) | 003's quoted bound already covers default 48 (SC-003's 200-map suite includes 48); SC-003 audits 48 explicitly; generation still bounded retries (FR-007). No cadence change (250 ms). |
| **Lobby create form state coupling** — pre-select vs manual override race | Pure rule per FR-002: only re-apply default when `boardSize` is unset or equals previous default; unit test matrix pins all 3×3 transitions plus manual-override persistence. |
| **Capacity chrome + lobby projection staleness** | `listPublicMatches()` is synchronous snapshot; lobby facade's `recomputeAndPublish` diff discipline already monotonic (010 R-006); E2E asserts joinable WAITING rows within one tick (010 FR-013). |
| **Host flag matrix combinatorial growth** | Exhaustive `resolveConfig` unit matrix (2×3×2 flag/env × invalids) + `port:0` single-server smoke per N (SC-008); invalid values fail fast naming allowed set (FR-012). |
| **Manual drift (007 FR-012)** | Every change set that touches defaults/chrome/overlay/host wording updates `docs/manual/` in same commit(s); `pnpm version:check` + `check-documentation-privacy.mjs` + `pnpm lint/typecheck` are CI gates (SC-009). |
| **No second listener regression** | `HOST_STATIC_PORT`/`--static-port` remain hard failures; host and fixtures use `__boundPortForTest()` from the single `http.Server`; two-port seam is conformance failure (FR-012). |
| **4p land density future tweak (spec Q1 alternative)** | Lobby already allows 64 for 4p; if product later prefers 64 as default, flip one entry in `BOARD_SIZE_DEFAULTS` (2→32, 3→48, 4→64) — no spec shape change, only docs + pin update. |

**Unresolved product ambiguities**: none. Spec v1.0 carries zero pending-clarification markers; four product decisions (Q1–Q4) are encoded as FR-001/FR-002/FR-011 and SC-001..SC-004. "Blocked by #2" is resolved (003 v1.2 + evidence cited in Clarifications).

---

## Implementation Phase Hand-off

Phase 5 (`tasks.md`) is **not** in this dispatch per the agent's scope (phases 4–5 only, no implementation). The orchestrator / implementer will receive:

- `plan.md` (this file)
- `research.md` (five decisions + density analysis + harness shape)
- `data-model.md` (delta over 006/010/005/011)
- `contracts/` (no-bump guarantee + internal additive shapes)
- `quickstart.md` (runnable SC-001..SC-009 validation)

When implementation begins, order by dependency (mirrors `tasks.md` waves):

1. **Defaults map first** — `packages/matchmaking/src/constants.ts` + `contracts/match-types.ts` + unit pin (every consumer depends on it).
2. **Consumers in parallel** — lobby form pre-select (FR-002), lobby list chrome (FR-003 is label-only, no protocol), waiting copy (FR-005) — each is a pure-function edit with its own unit/component tests.
3. **Host N-flags** — `scripts/host-config.ts` + `scripts/host.ts` (FR-011/FR-012); host smoke needs no lobby.
4. **Harness + audits** — parameterized full-stack E2E (SC-001/SC-002), deterministic terrain/fog audits (SC-003/SC-004) — share `buildStack()` recipe; all waits are poll conditions.
5. **Manual last** — `docs/manual/` updates ride with each behavior change set (FR-013), verified by `version:check` + docs-privacy (SC-009 + FR-014).

Contracts in `contracts/` are **informational** — they document additive internal shapes without versioning the wire. Drift between `@europa/matchmaking`'s real `BOARD_SIZE_DEFAULTS` and the lobby/host consumers is a bug, caught by unit pins and conformance tests.
