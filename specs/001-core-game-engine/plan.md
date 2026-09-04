# Implementation Plan: Total-Force Combat Resolution (issue #51)

**Branch**: `issue-51-improved-combat` | **Date**: 2026-09-04 | **Specs**: [`001`](./spec.md) Clarifications v1.4
**Dependencies**: 001 engine FR-008 (rewritten)
**Research**: [`research.md`](./research.md) | **Data Model**: [`data-model.md`](./data-model.md) | **Contracts**: [`contracts/`](./contracts/) | **Tasks**: [`tasks.md`](./tasks.md)

**Input**: Spec amendment for issue #51 — FR-008 rewritten from inflow-only attrition to total-force attrition. The previous model compared only fresh inflow (troops that arrived via pipes during the current tick), ignoring the existing garrison. This made cells at capacity invulnerable to pipe-based combat — a critical gameplay defect.

> Produced via the `/speckit.plan` workflow. This plan supersedes the original feature-001 plan (preserved in git history).

---

## Summary

This is a **focused, single-package gameplay fix** — only `@europa/engine` is modified. The change introduces two new data structures (`committedFlowTally` and `preFlowState`) to the tick pipeline so that combat can compare total forces (garrison + committed flow) instead of just fresh inflow.

The deliverables:

1. **Spec contract** (`CombatEvent`): two additive fields (`attackerTotal`, `defenderTotal`) in both mirrors (spec + engine local copy). This is an **additive, non-breaking** change — `ENGINE_API_VERSION` does not bump.
2. **Flow phase** (`resolveFlow`): accept an additional `committedFlowTally` parameter (same layout as `inflowTally`); record raw pipe flow before headroom clamping.
3. **Tick orchestrator** (`tick`): capture `preFlowState.troopOwners` before calling `resolveFlow`; pass `committedFlowTally` and `preFlowState` to `resolveCombat`.
4. **Combat resolver** (`resolveCombat`): accept `preFlowState` and `committedFlowTally`; use them to identify the garrison owner and compute total forces for each side.
5. **Tests**: new unit tests for garrison-vs-inflow, committed-flow, and the worked examples from the spec; updated existing tests with new `attackerTotal`/`defenderTotal` assertions; determinism test remains byte-identical.

No wire, envelope, frame-codec, or version-constant bump. No console, fog, networking, or matchmaking changes — the new `CombatEvent` fields are additive and consumed only by event consumers that currently ignore unknown fields (or can safely ignore them).

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (all packages extend `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`). Node.js ≥ 22 LTS. Biome 2 (four-space/120-column, root `biome.jsonc` layered config).

**Primary Dependencies** (no new runtime deps):
- `typescript@^5.6`, `vitest@^4` + `v8` coverage, `@biomejs/biome@^2`, `tsup@8`
- Workspace packages: `@europa/engine` only

**Storage**: N/A — pure in-memory; no persistence changes.

**Testing**: Vitest 4 (unit / integration / coverage with 80% gate per constitution III). Coverage is measured over the engine package. Every FR maps to a test file listed in `tasks.md`.

**Target Platform**: Node.js ≥ 22 for engine.

**Performance Goals** (map directly to SCs):
- **SC-004**: full tick of a 32×32 board < 10 ms — `committedFlowTally` is an additional `Uint32Array` allocation (same size as `inflowTally`); the combat resolver does one additional pass per contested cell to compute totals. The overhead is O(contested cells) with constant-factor work per cell — negligible.
- **SC-001**: byte-identical determinism preserved — the new tallies are deterministic (same iteration order, same integer math); the combat resolver's total-force computation is pure integer arithmetic.

**Constraints** (constitution + spec Out of Scope):
- TypeScript strict, zero `any` without documented justification, zero lint suppressions — code-quality skill.
- Server-authoritative deterministic simulation (constitution II): no wall-clock, no unseeded randomness, no floating-point drift. The new logic uses only integer arithmetic.
- ≥80% coverage on every metric over touched files and overall (constitution III).
- Specs-as-docs (constitution IV): spec updated in same change set; stale spec is a bug.
- Simplicity over cleverness (constitution V): the change is localized to three files (combat.ts, flow.ts, tick.ts) with two new typed arrays and straightforward bookkeeping.
- Self-hostable (constitution VII): no new services.

**Scale/Scope**:
- Touched files: `packages/engine/src/{resolution/combat.ts, resolution/flow.ts, tick.ts, contracts/engine-types.ts, types.ts}` + 3 test files (unit/combat.test.ts, quickstart/combat.test.ts, unit/events.test.ts)
- Spec contracts: `specs/001-core-game-engine/contracts/engine-types.ts`
- Unchanged: fog, networking, console, matchmaking, terrain, design, version

---

## Constitution Check

| Principle | Gate | This plan | Status |
|-----------|------|-----------|--------|
| **I — Type Safety First** | `strict: true`, no `any`, no suppressions | New types are `Readonly<WorldState>` for `preFlowState`, `Uint32Array` for `committedFlowTally`, additive `number` fields on `CombatEvent`. No `any`, no `eslint-disable`/`@ts-ignore`. | ✅ Pass |
| **II — Server-Authoritative Deterministic Simulation** | Fixed ticks; no wall-clock in simulation; deterministic replay | All new logic is pure integer arithmetic in typed arrays. `committedFlowTally` is populated in the same deterministic iteration order as `inflowTally`. `preFlowState` is a snapshot taken before flow. No RNG, no wall-clock. | ✅ Pass |
| **III — Tested Game Logic ≥80%** | Coverage gate on game logic; behavior tests | New logic (committed flow tally, pre-flow state capture, total-force combat) is unit-testable pure code. New tests cover all AC-1..AC-8 from the spec. | ✅ Pass |
| **IV — Specs as Documentation** | In-repo specs are source of truth; stale specs are bugs | Spec 001 amended in same change set (v1.4). Plan + research + data-model + tasks committed together. | ✅ Pass |
| **V — Simplicity Over Cleverness** | YAGNI; prefer boring, justified complexity | One new typed array (`committedFlowTally`), one snapshot (`preFlowState.troopOwners`), two additive fields on `CombatEvent`. No new packages, no new dependencies, no abstractions. | ✅ Pass |
| **VI — Accessibility-Minded UI** | WCAG 2.2 AA | No UI changes in this feature. | ✅ Pass |
| **VII — Self-Hostable by Default** | Single process, no cloud | No new services. | ✅ Pass |

---

## Architecture Overview

### Tick pipeline change (the core mechanic)

The tick pipeline order is unchanged: production → paratroop → gun → **flow** → **combat** → capture → decay → terminal. The changes are in the flow and combat phases:

```
tick(world)
  │
  ├─ Phase 4: resolveFlow(state, board, constants, inflowTally, committedFlowTally)
  │   │          inflowTally: tracks ACTUAL inflow (headroom-clamped) — used by decay exemption
  │   │          committedFlowTally: tracks RAW pipe flow (before headroom clamping) — used by combat
  │   │
  │   └─ transfer(): for each pipe:
  │        moved = flowRateForDelta(elevDelta, constants)
  │        headroom = cap - current
  │        add = min(moved, headroom)
  │        inflowTally[dst][srcOwner] += add          ← actual inflow (for decay)
  │        committedFlowTally[dst][srcOwner] += moved  ← raw committed flow (for combat)
  │
  └─ Phase 5: resolveCombat(state, board, constants, tick, inflowTally, committedFlowTally, preFlowState)
       │
       │  preFlowState = snapshot of troopOwners BEFORE resolveFlow ran
       │
       └─ For each contested cell:
            garrisonOwner = preFlowState.troopOwners[idx]  (0 if cell was empty)
            garrisonCount = preFlowState.troopCounts[idx]  (0 if cell was empty)

            if garrisonOwner !== 0:
              defender = garrisonOwner
              defenderTotal = garrisonCount + committedFlowTally[defender]
            else:
              fallback to dominant-owner model (unchanged)

            attacker = the other player(s) in committedFlowTally
            attackerTotal = committedFlowTally[attacker]

            1:1 attrition between attackerTotal and defenderTotal
```

### Why `committedFlowTally` is essential

The `inflowTally` records actual inflow (headroom-clamped). When a cell is at full capacity (headroom = 0), `inflowTally` is 0 for everyone — combat would not fire. The `committedFlowTally` records what the pipes WOULD have delivered without capacity constraints, enabling combat to fire even when the cell is full.

### Why `preFlowState` is essential

`resolveFlow` overwrites `troopOwners[idx]` when new troops arrive. After flow, the cell owner may be the attacker (the last writer), not the original garrison owner. `resolveCombat` needs the pre-flow owner to correctly identify defender vs attacker.

### Determinism guarantees

- `committedFlowTally` is populated in the same row-major, N→E→S→W iteration order as `inflowTally` — deterministic.
- `preFlowState` is a snapshot (shallow copy of typed arrays) taken at a deterministic point in the pipeline — before `resolveFlow`.
- The total-force computation is pure integer arithmetic — no floats, no RNG.
- CombatEvent's `attackerTotal` and `defenderTotal` are deterministic given the same inputs.
- Byte-identical determinism (SC-001) is preserved: same seed → same board → same pipe layout → same flow → same combat → same events.

### Key design decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| D1 | Committed flow tally vs pre-flow state for defender totals | Use `committedFlowTally` for BOTH attacker and defender committed flow; use `preFlowState` only for garrison identification | Simpler: one tally covers all committed flow; the garrison is just the pre-flow owner. |
| D2 | Parameter passing vs return-value threading | `resolveCombat` accepts `preFlowState` and `committedFlowTally` as additional parameters | Functional style; no side effects; the orchestrator captures the snapshot at the right point. |
| D3 | `committedFlowTally` as separate array vs combined with `inflowTally` | Separate `Uint32Array` (same layout) | Clean separation of concerns: `inflowTally` = actual (for decay), `committedFlowTally` = raw (for combat). The arrays serve different consumers with different semantics. |
| D4 | `ENGINE_API_VERSION` bump | **No bump** — additive fields on `CombatEvent` | The new fields are additive; no downstream package constructs `CombatEvent` directly. The semantic-diff conformance test on `engine-types.ts` catches drift between the spec contract and the local copy. |
| D5 | 3-way+ combat model | **Unchanged** — dominant-owner model stays | The improvement targets the 2-way case (the overwhelmingly common case). 3-way+ combat is rare and the dominant-owner model is adequate. |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **R-1 — Determinism of committedFlowTally**: the tally must be populated in deterministic order | Same row-major, N→E→S→W iteration as `inflowTally` — deterministic by construction. Verified by the existing determinism test (10k-tick byte-identical). |
| **R-2 — preFlowState snapshot timing**: must be taken after Phase 3 (gun) but before Phase 4 (flow) | The tick orchestrator already has a clear phase ordering; the snapshot is one line between Phase 3 and Phase 4. |
| **R-3 — Network serialization of new CombatEvent fields**: `attackerTotal`/`defenderTotal` are additive | The networking wire protocol serializes `TickEvents` via the engine's types. Since the fields are additive and the serialization is `JSON.stringify`-based (or equivalent), unknown fields are harmless. The console currently does not render these fields — they are informational. No wire-level change needed. |
| **R-4 — Fog filter**: `filterTickEvents` filters `CombatEvent` by cell visibility | The fog filter checks `cell` coordinates — it does not read `attackerTotal`/`defenderTotal`. No change needed. |
| **R-5 — Existing test assertions**: some tests assert exact `CombatEvent` shapes | Tests constructing `CombatEvent` literals directly (e.g., `events.test.ts`) will need the new fields added to their fixtures. Tests asserting specific combat outcomes (e.g., `combat.test.ts`) will need updated assertions to verify the new totals. |
| **R-6 — Golden fixture**: `golden-1000-tick.json` may need regeneration | The golden fixture is deterministic — if the combat model changes, the fixture's events will change. It may need regeneration. Check during implementation. |

---

## Implementation Phase Hand-off

Phase 5 (`tasks.md`) is in this change set. The implementer will receive:

- `plan.md` (this file)
- `research.md` (codebase research findings)
- `data-model.md` (data model changes)
- `contracts/` (updated canonical engine contracts)
- `tasks.md` (ordered, dependency-aware task list)

When implementation begins, order by dependency:

1. **Contract mirrors** — update `CombatEvent` in both spec and engine-local `engine-types.ts` (blocks everything downstream).
2. **Committed flow tally** — add `committedFlowTally` parameter to `resolveFlow` and `transfer()`.
3. **Pre-flow state** — capture snapshot in `tick.ts` before `resolveFlow`.
4. **Combat resolver** — rewrite 2-way case to use total forces; update 3-way case for consistency.
5. **Events fixture** — update `events.test.ts` `COMBAT` fixture with new fields.
6. **Unit tests** — new garrison-vs-inflow tests, updated existing assertions, determinism verification.
7. **Final gate** — typecheck/lint/format/tests + coverage + determinism.
