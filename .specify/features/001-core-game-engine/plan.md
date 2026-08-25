# Implementation Plan: Core Game Engine (Feature 001)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: [`.specify/features/001-core-game-engine/spec.md`](./spec.md)

**Input**: Feature specification from `.specify/features/001-core-game-engine/spec.md` — deterministic tick-based simulation (cities, pipes, fog, combat, decay, paratroopers, guns, victory) for the Europa Neo reimplementation.

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch — AGENTS.md "do not relitigate"; the spec-kit default of `git checkout -b 001-feature-name` was deliberately skipped). All artifacts for this feature live under `.specify/features/001-core-game-engine/`.

---

## Summary

The Core Game Engine is the deterministic, pure simulation primitive that every other feature builds on. It exposes an immutable `World` value type and a small set of pure functions — `createWorld`, `applyCommand`, `tick`, `isTerminal` — that together implement the spec's 19 functional requirements (cities, pipes, flow with slope, attrition combat, decay, capacity, reserves, paratroopers, guns, surrender, terminal detection) on a fixed-rate tick.

The engine is **pure** (no I/O, no clocks, no unseeded randomness), uses **integer-only arithmetic** (no float drift inside tick logic), and ships as a TypeScript library consumed by feature 003 (terrain input), 002 (fog filter), 004 (network transport), 005 (console renderer), and 006 (matchmaking lifecycle). It owns the deterministic PRNG (sfc32) and a single tunable-constants location, so balance and replayability are centralized.

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true`. Targets Node.js ≥ 20 LTS (modern ESM, `Map`, `Set`, `TypedArray` all stable).

**Primary Dependencies** (engine-only direct deps):
- `tsup` (^8) — zero-config library bundler (esbuild + `.d.ts`). Used to produce ESM + types in `dist/`.
- `vitest` (^4.1) — test framework + coverage (v8 provider).
- `@biomejs/biome` (^2) — lint + format (single binary, single config; sub-packages extend root with `extends: "//"`).

No runtime dependencies. The engine is consumed by other workspace packages via `workspace:*` protocol (pnpm 11). See `research.md` for rationale.

**Storage**: N/A — the engine is in-memory only. Replay support comes from `serializeWorld`/`deserializeWorld` (Uint8Array round-trip), not a database. Persistence is feature 006's concern (out of v1 scope per spec Assumptions).

**Testing**: Vitest 4.1 with v8 coverage provider. Coverage threshold 80% (constitution Principle III merge gate). Per-rule unit tests + scripted-scenario integration tests in `tests/quickstart/` + determinism test (`tests/determinism.test.ts`).

**Target Platform**: Node.js ≥ 20 LTS (server-side authoritative). The engine itself has no DOM/window dependencies; if the console ever wants to share types it can re-export them but the engine package is server-side.

**Project Type**: Library (npm package) within a pnpm-workspaces monorepo. Re-exported as `@europa/engine` to downstream packages.

**Performance Goals**: 32×32 board, 2-player match, full tick in under 10 ms on commodity hardware (spec SC-004). Default tick rate 250 ms → 4 Hz. Engine is invoked ~4×/sec/match, not in a tight loop; per-tick budget is generous.

**Constraints**:
- Deterministic (spec FR-017): no wall-clock reads in tick logic, integer-only arithmetic, command application in a well-defined total order (by PlayerId then order kind).
- ≥80% coverage (constitution Principle III).
- No `any` types; no lint suppressions (constitution Principles I, code-quality skill).
- Self-hostable by default — no proprietary services or required cloud (constitution Principle VII).

**Scale/Scope**:
- Single TypeScript package (`packages/engine`) within a 4-package monorepo (`engine`, `server`, `client`, `shared`).
- ~10 modules inside the package (one per resolution rule + a few cross-cutting), ~1000–1500 LOC of engine logic + tests.
- 2–4 player matches per FR-019; v1 ships 2-player end-to-end (AGENTS.md binding decision).

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-evaluated after Phase 1 design.*

### Principle I — Type Safety First

| Gate | Status |
|------|--------|
| TS `strict: true` in `packages/engine/tsconfig.json` | ✅ Planned |
| Zero `any` types in `src/` | ✅ Enforced by lint rule + code review (no suppressions) |
| No `@ts-ignore` / `@ts-nocheck` / `eslint-disable` | ✅ Enforced by Biome's `noExplicitAny` + pre-commit checklist |
| Every public function has doc comment (JSDoc) | ✅ Convention enforced in PR review |

**Verdict**: ✅ passes. No suppressions; strict mode everywhere.

### Principle II — Server-Authoritative Deterministic Simulation

| Gate | Status |
|------|--------|
| No `Date.now()` / `performance.now()` / `Math.random()` in `src/` (excluding `src/rng.ts`) | ✅ Enforced by Biome `noGlobalEval` + custom `no-restricted-globals` rule (in lint config, not source) |
| Integer-only arithmetic in tick logic (`Math.imul`, `Math.floor`, `\| 0`) | ✅ Convention + code review; covered by SC-001 determinism test |
| All tick state changes flow through `tick()` | ✅ Single function owns mutation |
| Commands applied in deterministic order | ✅ Sort by PlayerId ascending, then order `kind` for stability |
| Replay-friendly: `serializeWorld` round-trip is lossless | ✅ Planned; covered by `tests/determinism.test.ts` |

**Verdict**: ✅ passes. Determinism is structural (pure functions + readonly state), not aspirational.

### Principle III — Tested Game Logic (≥80% coverage)

| Gate | Status |
|------|--------|
| Each resolution rule in its own module + its own test file | ✅ Planned (see research.md §10) |
| Coverage gate 80% enforced in CI | ✅ Vitest coverage thresholds in `vitest.config.ts` |
| ≥10,000-tick determinism test exists (SC-001) | ✅ Planned (`tests/determinism.test.ts`) |
| Every spec FR has a corresponding acceptance test | ✅ Mapped in `quickstart.md` §4 |

**Verdict**: ✅ passes. Coverage gate is mechanical, not aspirational.

### Principle IV — Specs as Documentation

| Gate | Status |
|------|--------|
| Spec is authoritative for engine behavior | ✅ Plan references spec FRs by number |
| Engine code comments explain "why"; types/docs explain "what" | ✅ JSDoc on every public function; types serve as live docs |
| Behavior changes ship in same change set as spec updates | ✅ Constitution + AGENTS.md mandate this; CI enforces via PR description |
| Contracts/ folder makes the public surface discoverable | ✅ Five `.ts` files; `index.ts` re-exports them |

**Verdict**: ✅ passes.

### Principle V — Simplicity Over Cleverness

| Gate | Status |
|------|--------|
| Each resolution rule = one file, one function | ✅ `src/resolution/{production,flow,combat,decay,capture,paratroop,gun,terminal}.ts` |
| Pure functions over classes | ✅ No OOP entity-component system |
| Flat typed arrays over per-cell objects in hot paths | ✅ Justified by perf (SC-004); alternatives considered and rejected in research.md |
| Centralized constants (`src/constants.ts`) | ✅ One file per SC-005 |
| No premature abstraction (e.g., no plugin system, no DI container) | ✅ Direct imports |

**Verdict**: ✅ passes. Simplicity is the default.

### Principle VI — Accessibility-Minded UI

Not directly applicable to the engine. The console (feature 005) is the consumer of accessibility requirements; the engine exposes plain data that any UI can render accessibly. ✅ N/A for engine.

### Principle VII — Self-Hostable by Default

| Gate | Status |
|------|--------|
| Engine has zero external service dependencies | ✅ No network calls, no DB, no telemetry |
| Engine is a single npm package installable independently | ✅ pnpm workspace member; pure TypeScript |
| Source available; permissive license (project ships under OSI-approved license per constitution §"Open-source licensing friendliness") | ✅ Engine package has no copyleft deps |

**Verdict**: ✅ passes.

### Additional Constraints (Constitution §"Additional Constraints")

| Constraint | Status |
|------------|--------|
| Permissive dependencies only (MIT/BSD/Apache-2.0/ISC) | ✅ tsup, vitest, biome, sfc32 reference all MIT; sfc32 is in the public domain (CC0 in bryc reference) |
| No vendor lock-in | ✅ Engine has no proprietary API calls |

**Verdict**: ✅ passes.

### Constitution Check — Post-Phase-1 Re-evaluation

All gates remain green after `data-model.md` and `contracts/` were written. The pure-function API shape and readonly `World` value reinforce Principles II and V; the central constants file reinforces III and V; the explicit version constant on the engine API supports IV (breaking changes are explicit, not silent).

**Final verdict**: ✅ Constitution satisfied. No violations to track.

---

## Project Structure

### Documentation (this feature)

```text
.specify/features/001-core-game-engine/
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 output — tooling + design decisions with citations
├── data-model.md        # Phase 1 output — entities, fields, relationships, transitions
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — public TypeScript contracts
│   ├── engine-types.ts        # World, Cell, Order, events, MatchResult
│   ├── engine-api.ts          # createWorld, tick, applyCommand, isTerminal, helpers
│   ├── engine-to-terrain.ts   # engine ↔ 003 boundary
│   ├── engine-to-fog.ts       # engine ↔ 002 boundary
│   ├── engine-to-networking.ts# engine ↔ 004 boundary
│   └── engine-to-matchmaking.ts # engine ↔ 006 boundary
└── tasks.md             # NOT created in this dispatch (Phase 5 — separate)
```

### Source Code (monorepo root)

```text
europa-neo/
├── .specify/                       # spec-kit scaffolding + governance
│   ├── features/                   # six feature specs
│   ├── memory/constitution.md      # ratified principles
│   ├── scripts/bash/               # spec-kit helpers
│   └── templates/                  # plan / spec / tasks templates
├── packages/
│   ├── engine/                     # ← this feature lives here
│   │   ├── package.json            # name: "@europa/engine", type: "module"
│   │   ├── tsconfig.json           # strict, ES2022, noUncheckedIndexedAccess
│   │   ├── vitest.config.ts        # v8 coverage, 80% threshold
│   │   ├── tsup.config.ts          # ESM + dts
│   │   ├── biome.json              # extends: "//" (root)
│   │   ├── src/
│   │   │   ├── index.ts            # public surface re-exports
│   │   │   ├── constants.ts        # ENGINE_CONSTANTS (SC-005)
│   │   │   ├── rng.ts              # sfc32 + xmur3
│   │   │   ├── types.ts            # (re-exports contracts/engine-types.ts)
│   │   │   ├── create.ts           # createWorld(config, board)
│   │   │   ├── validate.ts         # validateCommand(world, cmd)
│   │   │   ├── applyCommand.ts     # applyCommand(world, cmd)
│   │   │   ├── tick.ts             # tick(world)
│   │   │   ├── serialize.ts        # serializeWorld/deserializeWorld/hashWorld
│   │   │   ├── events.ts           # TickEvents + event builders
│   │   │   └── resolution/
│   │   │       ├── production.ts
│   │   │       ├── flow.ts
│   │   │       ├── combat.ts
│   │   │       ├── decay.ts
│   │   │       ├── capture.ts
│   │   │       ├── paratroop.ts
│   │   │       ├── gun.ts
│   │   │       └── terminal.ts
│   │   └── tests/
│   │       ├── unit/               # one test file per resolution rule
│   │       ├── fixtures/           # scripted boards + scenarios
│   │       ├── quickstart/         # runnable validation scenarios (Q-001..Q-010)
│   │       └── determinism.test.ts # SC-001: ≥10k tick byte-identical re-runs
│   ├── server/                     # (feature 006 + 004 + 002 host — out of this plan's scope)
│   ├── client/                     # (feature 005 console — out of this plan's scope)
│   └── shared/                     # (cross-package protocol types — feature 004 owns)
├── biome.json                      # root lint/format config (extends ["//"])
├── pnpm-workspace.yaml             # packages: ["packages/*"]
├── package.json                    # workspace root scripts
└── tsconfig.base.json              # shared TS strict config (each package extends)
```

**Structure Decision**: monorepo with pnpm 11 workspaces. The engine lives in its own package (`@europa/engine`) so it has no dependency on the server/client packages and can be tested in isolation. This is the standard "library + host" pattern for TS monorepos and matches the spec's intent (the engine is a pure library; networking, console, matchmaking are host concerns). See `research.md` §1 for rationale on pnpm and `research.md` §2 for rationale on tsup.

The full monorepo will be scaffolded in a separate setup task (Phase 5/6), not in this plan; this feature's planning establishes the engine's footprint inside that future layout.

---

## Architecture Overview

### Data flow

```
                    ┌─────────────────────────┐
                    │   packages/server       │   (feature 006 matchmaking)
                    │   - holds live matches  │
                    │   - calls tick(world)   │
                    │   - applies Order[]     │
                    │   - detects terminal    │
                    └────────────┬────────────┘
                                 │ tick / applyCommand
                                 ▼
                    ┌─────────────────────────┐
                    │   @europa/engine        │   ← this feature
                    │   - createWorld         │
                    │   - applyCommand        │
                    │   - tick                │
                    │   - isTerminal          │
                    │   - serializeWorld      │
                    │   - ENGINE_CONSTANTS    │
                    └────────────┬────────────┘
                                 │ World, TickEvents
                                 ▼
                    ┌─────────────────────────┐
                    │   packages/server (cont)│
                    │   feature 002 (fog):    │
                    │   - compute VisibleSet  │
                    │   - build PlayerView    │
                    │   feature 004 (network):│
                    │   - serialize PlayerView│
                    │   - broadcast per tick  │
                    └────────────┬────────────┘
                                 │ PlayerView (fog-filtered)
                                 ▼
                          packages/client
                          (feature 005 console)
```

The engine sits at the bottom of the dependency DAG: nothing else in the
monorepo depends on the server or client; only they depend on the engine.

### Key design decisions (see `research.md` for full rationale + citations)

| Decision | Choice | Rationale (brief) |
|----------|--------|-------------------|
| Workspace manager | pnpm 11 | Modern default for TS monorepos; `workspace:*` + `catalog:` features |
| Build tool | tsup 8 | Zero-config ESM + `.d.ts`; esbuild speed |
| Test framework | Vitest 4.1 | TS-native, v8 coverage, Jest-compatible API |
| Lint/format | Biome 2 | One binary, one config, monorepo-aware |
| PRNG | sfc32 | 128-bit, passes TestU01, fastest in JS, integer-only ops |
| Numeric type | Integer only | Spec permits; integers remove float-drift determinism risk |
| Engine API shape | Pure functions + readonly `World` | Constitution Principle II; replay-friendly |
| Tick rate | Fixed cadence driven by server Scheduler | Engine is wall-clock-free (FR-017) |
| Constants location | `packages/engine/src/constants.ts` | SC-005 mandate |
| State storage | Flat `Uint8Array`/`Uint32Array` per cell | Per-tick perf (SC-004); friendly to V8 hidden classes |
| Order kinds | 8 typed variants in a discriminated union | FR-018 exhaustive validation |

### Tick pipeline (one `tick(world)` call)

```
applyCommand chain (per PlayerId order, in order)
  ↓
1. Validate all staged orders; record errors in TickEvents.errors
2. Production phase:    city cells add troops up to capacity
3. Paratroop resolution (cost source, land at target, clear target pipes)
4. Gun resolution       (cost source, damage target occupants at tick-time)
5. Flow phase:          each pipe transfers troops, modified by slope
6. Combat resolution:   cells with multiple owners fight (attrition)
7. Capture phase:       majority-owner troops absorb cell; cities transfer
8. Decay phase:         -1/tick to cells with no friendly inflow
9. Eliminate phase:     players with 0 troops AND 0 cities → status=eliminated
10. Terminal check:     if <2 alive → MatchResult emitted
11. Capture TickEvents; return next World
```

Phases are pure functions called sequentially from `tick.ts`. Each is
unit-tested in isolation. Order of phases is fixed (constitution Principle
II — no iteration-order dependence).

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **Performance SC-004** (32×32, <10 ms/tick) | Flat arrays + integer math; measured by a Vitest benchmark in tasks.md. If we miss, profile with `node --prof` and consider further micro-optimizations (inlining neighbor lookups, etc.) — but **only after measurement**, not speculatively. |
| **Biome's TS rules are still maturing** | Backstop with `tsc --noEmit` in CI; Biome handles formatting + basic lint, tsc handles type-level strictness. |
| **Floating-point in slope math** | All slope factors are integer ratios (`downhillFactor`, `baseFlow`, `uphillFactor`). Implementation: `transferred = baseFlow * downhillFactor` then `Math.min(transferred, availableAboveReserves)`. No division in the hot path; no float drift. |
| **3/4-player tests lighter than 2-player** | Per AGENTS.md binding decision + spec assumption. The engine API supports them; only the 2-player integration test path is fully exercised in v1. |
| **Replay/serialization version drift** | `ENGINE_API_VERSION` constant; `serializeWorld` writes a version header; `deserializeWorld` rejects mismatches. |

### Unresolved product ambiguities

The prompt asked me to surface any I cannot resolve without a product decision. None remain:

- All test framework / repo layout decisions were specified in the prompt (Vitest, monorepo).
- All FR numeric rules without a documented default have been placed in `ENGINE_CONSTANTS` with sensible starting values documented in research.md §9. These are *implementation-time* choices, not product decisions; the implementer can adjust during Phase 6.
- The spec's `MatchConfig.visibilityRadius` is engine-owned so feature 002's radius is consistent. (Already documented as such.)

---

## Implementation Phase Hand-off

Phase 5 (tasks) is **not** in this dispatch. The PM will receive:
- `plan.md` (this file)
- `research.md`
- `data-model.md`
- `contracts/` (5 files)
- `quickstart.md`

And dispatch Phase 5 to create `tasks.md`, then Phase 6 to implement.

When implementation begins, the implementer should:
1. Bootstrap the monorepo skeleton (`pnpm-workspace.yaml`, root `package.json`, `biome.json`, `tsconfig.base.json`) — a *separate* setup task, not part of the engine's task list.
2. Scaffold `packages/engine` per the structure above.
3. Work through the resolution rules in dependency order: types → constants → rng → createWorld → validate → applyCommand → resolution/* → tick → serialize.
4. Land `quickstart/` tests as the acceptance suite (Q-001 .. Q-010 in `quickstart.md`).
5. Run the constitution gates (lint, typecheck, coverage ≥80%, determinism test).

The contracts in `contracts/` are the stable interface; they are
referenced verbatim by features 002/003/004/005/006. Drift between those
plans and this one is a bug.
