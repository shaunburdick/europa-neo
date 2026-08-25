# Research: Core Game Engine (Feature 001)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `specs/001-core-game-engine/spec.md`
**Plan**: `specs/001-core-game-engine/plan.md`

> Decisions captured for the engine package: tooling, determinism strategy,
> numerics, API shape, and build/test infra. Each decision cites the version
> and source consulted via `context7` (current docs) or `websearch` (current
> practice).

---

## 1. Monorepo workspace manager — **pnpm 11 with `workspace:*` protocol**

**Decision**: `pnpm@11.x` workspaces, single root `pnpm-workspace.yaml`,
per-package `package.json`, shared `typescript`/`vitest` versions pinned
via the workspace `catalog:` feature.

**Rationale**:
- `pnpm` uses a content-addressable store (symlinks, not copies) — installs
  are faster and disk-cheaper than `npm`/`yarn` for monorepos with several
  packages.
- pnpm enforces strict, non-hoisted dependency resolution by default. That
  catches accidental cross-package imports of `dependencies` (vs.
  `devDependencies` / peer `workspace:*`), which matters for a deterministic
  engine: anything the engine reads from must be declared at the package
  that uses it.
- pnpm 11 introduced the `catalog:` / `catalogs:` protocol for sharing
  dependency versions across a workspace without duplicating them in each
  package.json. ([pnpm workspace manifest reader](https://github.com/pnpm/pnpm/blob/main/pnpm11/workspace/workspace-manifest-reader/src/index.ts))
- `workspace:*` protocol is the canonical way to depend on a sibling
  package. pnpm 11 parses `workspace:`, `workspace:^`, `workspace:~`, and
  aliased `workspace:foo@*`. ([pnpm spec parser](https://github.com/pnpm/pnpm/blob/main/pnpm11/workspace/spec-parser/src/index.ts))

**Alternatives considered**:
- `npm@10` workspaces — works, but no `catalog:` shared versions, slower
  installs, weaker isolation. Rejected: no tangible upside vs. pnpm.
- `yarn@4` (berry) — PnP mode breaks many tools; node-modules linker mode
  is fine but offers nothing pnpm doesn't. Rejected: smaller ecosystem
  presence in 2026.

**Citation**: pnpm workspace manifest & spec parser source files (Aug 2026).

---

## 2. Build tool for `packages/engine` — **tsup 8.x (esbuild + dts)**

**Decision**: `tsup@^8` for the engine package. Outputs ESM + `.d.ts`. No
runtime dependencies.

**Rationale**:
- The engine is consumed by other packages via `workspace:*`. We need:
  - `.d.ts` for type-safe consumption by 002/003/004/005/006.
  - ESM for modern Node + browser bundlers.
  - Fast rebuilds during iteration.
- tsup is zero-config: `tsup src/index.ts --format esm --dts` is enough to
  emit both JS and declaration files. Internally it uses esbuild for
  transforms and `api-extractor`/rollup-plugins for `.d.ts` bundling.
  ([tsup README](https://github.com/egoist/tsup/blob/main/docs/README.md))
- Default extension selection handles the `package.json` `type: "module"`
  corner case correctly. ([tsup utils](https://github.com/egoist/tsup/blob/main/src/utils.ts))

**Alternatives considered**:
- Raw `tsc --build` — works, but slower and produces only one format
  without extra config. We don't need bundling for the engine (it's a
  library, not a runtime app).
- `swc` + manual `tsc --emitDeclarationOnly` — faster than tsc but loses
  the simple single-command ergonomics of tsup.
- `tsup` was preferred over `vite library mode` because vite is a
  *bundler-for-applications* and brings web assumptions; tsup is purpose-
  built for libraries.

**Decision constraint**: the server package (`packages/server`) and client
package (`packages/client`) will likely use `tsup` for the same reason.
The browser console (feature 005) will use its own frontend bundler
(Vite/esbuild) — but that decision belongs to the console's plan, not
this one.

**Citation**: tsup README + utils source.

---

## 3. Test framework — **Vitest 4.1**

**Decision**: `vitest@^4.1` for every package. Coverage provider: `v8`.

**Rationale**:
- Vitest is Vite-native, supports TS + ESM out of the box (no Babel/Jest
  config), and is Jest-compatible so the engine tests can use `describe`/
  `it`/`expect` syntax the team likely already knows.
- Vitest 4.1 is the latest maintained minor of major v4 — confirmed in
  the official support matrix. ([Vitest docs source](https://github.com/vitest-dev/vitest/blob/main/docs/.vitepress/theme/SupportedVersions.vue))
- v8 coverage provider is the default in Vitest 4 and is faster than
  Istanbul with no transform-stage overhead. ([coverage-v8 README](https://github.com/vitest-dev/vitest/blob/main/packages/coverage-v8/README.md))
- ≥80% coverage is a **constitution merge gate** (Principle III). v8's
  AST-aware remapping (introduced in 3.2 and being made default in the
  next major) gives reliable per-line metrics on TS. ([Vitest 3.2 blog](https://github.com/vitest-dev/vitest/blob/main/docs/blog/vitest-3-2.md))

**Alternatives considered**: Node's built-in `node:test` is fine for
trivial cases but lacks the rich matcher library, watch mode, and coverage
tooling. `jest` works but requires Babel/ts-jest config and is heavier
than Vitest for TS/ESM projects.

**Citation**: Vitest docs source + 3.2 release blog.

---

## 4. Linting & formatting — **Biome 2.x** (single binary, single config)

**Decision**: `@biomejs/biome@^2` for the whole monorepo, configured once
at the repo root. Subpackages extend the root via `extends: ["//"]`.

**Rationale**:
- Biome is a single Rust binary that does both linting and formatting,
  with no plugins, no Prettier dependency, no ESLint config inheritance
  headaches. One tool to install, one tool to upgrade.
- Biome 2 ships with first-class monorepo support: a child
  `biome.json` can `extends: "//"` to inherit the root config and stop
  upward traversal. ([Biome extends enum](https://github.com/biomejs/biome/blob/main/crates/biome_configuration/src/extends.rs))
- The configuration schema is split into `formatter`, `linter`, `assist`,
  `files`, and `vcs` sections — enough to enforce no-`any`, no-console,
  import organization, and formatting in one place.
  ([Biome Configuration struct](https://github.com/biomejs/biome/blob/main/crates/biome_configuration/src/lib.rs))

**Alternatives considered**:
- `eslint` + `typescript-eslint` + `prettier` — three tools, three config
  formats, three upgrade cycles. More rules, but the rule set we actually
  need (no `any`, no `console`, format) is covered by Biome with zero
  configuration drama.
- `deno lint` — not applicable; we run on Node, not Deno.

**Caveat**: Biome does not yet have a TS strict-mode-aware `no-explicit-any`
rule with the same granularity as `@typescript-eslint/no-explicit-any`.
We'll use `noExplicitAny` + a project-level rule plus CI verification
of `tsc --noEmit` to backstop it.

**Citation**: Biome `Configuration` + `Extends` source files.

---

## 5. Pseudorandom number generator — **sfc32 (128-bit)**

**Decision**: `sfc32` as the project-wide deterministic PRNG. Exposed via
`packages/engine/src/rng.ts`. Seeded by an integer seed (uint32) via the
standard `xmur3(string) → 4×uint32 → sfc32` pattern when a string seed is
needed.

**Rationale**:
- **sfc32** (Small Fast Counter, 128-bit state) is part of the PractRand
  PRNG test suite and passes both Crush and BigCrush (TestU01), with no
  known statistical weaknesses. ([bryc/code PRNGs reference](https://github.com/bryc/code/blob/master/jshash/PRNGs.md))
- It's the fastest 128-bit JS PRNG (~7.45M ops/sec in the benchmark table),
  with a 2¹²⁸-period state space — overkill for Europa but cheap insurance.
- It uses only 32-bit integer ops, which are exact in JavaScript (no
  silent promotion to `Number`). This matters for determinism: integer
  math never drifts across V8/SpiderMonkey/JavaScriptCore.
- Engine code itself does not call the PRNG — the simulation is a pure
  state machine. But the engine owns the PRNG instance because:
  1. Feature 003 (terrain) consumes it for map generation and must pass
     the same seed the match was started with.
  2. Future replays (out of v1 scope but in the architecture) need the
     same PRNG instance the original match used.

**Alternatives considered**:
- **Mulberry32** (32-bit state) — simpler, faster, used by Chrome dev
  team's CSS texture demo. Period is ~2³² which is technically enough for
  a single match but smaller than we need for safety. Per the bryc
  reference, `sfc32` is the recommended all-around JS PRNG. We adopt the
  recommendation.
- **xoshiro128\*\*** — fast 128-bit, but its lowest bits are known to be
  weak; we'd need to mask/shift whenever we use it for integer ranges,
  adding complexity.
- **Math.random()** — disqualified. Unseeded; not specified in ECMA-262.

**Citation**: [bryc/code jshash/PRNGs.md](https://github.com/bryc/code/blob/master/jshash/PRNGs.md)
(PRNG benchmark table), [StackOverflow: Seeding the random number generator
in JavaScript](https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript).

---

## 6. Numeric representation — **integer-only**

**Decision**: All troop counts, production rates, capacities, slope
factors, reserves percentages, and combat deltas are **integers** in TS
(`number` constrained to `Math.floor` results, never float math). All
arithmetic in tick logic uses `| 0` / `Math.imul` / `Math.floor` — no
floating-point in state updates.

**Rationale**:
- Spec FR-017 explicitly mandates "integer (or fixed-point) arithmetic
  only". The spec also lists troops as "integer ≥ 0".
- Troops are indivisible units (you cannot have 0.7 of a nanobot). All
  downstream math is integer-safe.
- Slope factors are integer ratios. Example: downhill = `2x` of base flow,
  uphill = `floor(x/2)`. We model this as integer multiplication on a base
  integer flow count. No fractional troops ever exist.
- JavaScript `Number` is IEEE-754 double — perfectly capable of exact
  integer arithmetic up to 2⁵³. We never approach that in a 32×32 board.
  The risk is *implicit* float promotion, not capacity. We guard by using
  `Math.imul`, `Math.floor`, and `| 0` consistently.
- Determinism (FR-017) is the real driver. IEEE-754 results are
  deterministic *given identical platform*, but float-equality comparisons
  and accumulation drift are the kind of subtle bug we want to eliminate
  by never introducing floats.

**When we'd revisit**: if a future mechanic required fractional rates
(e.g., research that grants +0.05/tick), we'd add a small fixed-point
helper (`Fixed<Q>` parameterized by 2^k denominator). For v1, we don't.

**Citation**: spec FR-017; JS `Math.imul` semantics (ECMA-262 §21.3.2.5).

---

## 7. Engine ↔ consumer interface shape — **pure functions + immutable snapshots**

**Decision**: The engine exports a small set of pure functions and a
single readonly value type (`World`). All transitions return new
`World` instances — the input is never mutated.

```ts
// Pure creation
createWorld(config: MatchConfig, terrain: Board): World

// Pure command application — validates + stages for next tick
applyCommand(
  world: Readonly<World>,
  cmd: Order,
): { world: Readonly<World>; result: CommandResult }

// Pure tick — advances one simulation step
tick(world: Readonly<World>): {
  world: Readonly<World>;
  events: TickEvents;
  terminal?: MatchResult;
}

// Pure terminal check (cheap to call outside tick)
isTerminal(world: Readonly<World>): MatchResult | undefined

// Serialization (for replays / cross-process transport)
serializeWorld(world: Readonly<World>): Uint8Array
deserializeWorld(bytes: Uint8Array): Readonly<World>
hashWorld(world: Readonly<World>): string
```

**Rationale**:
- **Pure functions** = constitution Principle II (determinism). The
  compiler can prove no hidden state; tests can run anywhere.
- **Immutable snapshots per tick** = downstream consumers can diff
  cheaply (reference equality for unchanged cells). Feature 004's tick
  delta encoding becomes "compare prev & next cell refs, emit changed".
- **Explicit `events` channel** = feature 002 (fog) and feature 005
  (console) get a deterministic, replayable list of what happened this
  tick (battles, captures, eliminations) without scanning the whole
  world diff.
- **No EventEmitter / no observables** — those tempt consumers to
  subscribe to mutation, which couples them to ordering. Functions are
  enough for the v1 consumers.

**Alternatives considered**:
- Event-emitter / observable style — rejected: introduces ordering
  concerns and makes deterministic testing harder.
- Mutable `World` class with methods — rejected: violates pure-function
  contract; harder to test in isolation; can't share between worker
  threads without structured-clone overhead.
- OOP entity-component system — overkill for v1; rejected per
  constitution Principle V (simplicity over cleverness).

**Citation**: Spec FR-017/FR-018; constitution Principles II and V.

---

## 8. Tick-rate strategy

**Decision**: The engine does **not** own the wall clock. A separate
`Scheduler` (lives in `packages/server`, feature 006) calls
`engine.tick(world)` at fixed cadence. The engine measures tick intervals
in *integer tick numbers*, not milliseconds.

**Rationale**:
- Keeps the engine pure (no `Date.now()`, no `setTimeout`). Matches
  spec FR-017 ("no wall-clock reads inside tick logic").
- The server's `Scheduler` enforces a fixed interval (e.g., 250 ms/tick
  → 4 Hz, matching the original's pace). Configurable via
  `MatchConfig.tickIntervalMs`. Tick *numbers* are monotonically
  increasing from 1.
- Consumers (networking) timestamp tick payloads with the tick number,
  not a wall-clock value — replays are portable across runs.

**Default tick rate**: 4 ticks/second (250 ms). Stored in `engine.constants.ts`
as `DEFAULT_TICK_INTERVAL_MS = 250`. Tunable per match; tests use 0 ms
(calls `tick()` as fast as possible).

**Citation**: spec FR-003, FR-017, SC-004.

---

## 9. Tunable constants location

**Decision**: Single file `packages/engine/src/constants.ts` (re-exported
as `ENGINE_CONSTANTS`). Every numeric rule from the spec — production
rate, saturation capacity, attrition factor, slope multipliers, paratroop
cost ratio, gun cost/damage, decay rate, reserves step — lives here and
nowhere else.

**Rationale**: spec SC-005 ("every numeric rule is defined in one
tunable-constants location"). Centralizing also means a single
override surface for balance testing (e.g., a "scenarios" file that
imports constants and rewrites them for a test board).

**Citation**: spec SC-005.

---

## 10. Module structure within `packages/engine`

```
packages/engine/
├── src/
│   ├── index.ts            // public surface re-exports
│   ├── types.ts            // World, Cell, City, Pipe, Troops, Order, etc.
│   ├── constants.ts        // ENGINE_CONSTANTS (single source of tunable numbers)
│   ├── rng.ts              // sfc32 + xmur3 helpers (deterministic PRNG)
│   ├── create.ts           // createWorld(config, terrain)
│   ├── validate.ts         // validateCommand(world, cmd) → ValidationResult
│   ├── applyCommand.ts     // applyCommand(world, cmd) → {world, result}
│   ├── tick.ts             // tick(world) → {world, events, terminal?}
│   ├── resolution/         // pure functions for each phase
│   │   ├── production.ts
│   │   ├── flow.ts
│   │   ├── combat.ts
│   │   ├── decay.ts
│   │   ├── capture.ts
│   │   ├── paratroop.ts
│   │   ├── gun.ts
│   │   └── terminal.ts
│   ├── serialize.ts        // serializeWorld/deserializeWorld/hashWorld
│   └── events.ts           // TickEvents / CombatEvent / CaptureEvent / ...
├── tests/
│   ├── unit/
│   │   ├── production.test.ts
│   │   ├── flow.test.ts
│   │   ├── combat.test.ts
│   │   ├── decay.test.ts
│   │   ├── paratroop.test.ts
│   │   ├── gun.test.ts
│   │   └── terminal.test.ts
│   ├── fixtures/
│   │   ├── board.ts        // scripted boards (small symmetric, asymmetric)
│   │   └── scenarios.ts    // higher-level "games" (decay-only, mutual feed, etc.)
│   └── determinism.test.ts // SC-001: byte-identical re-runs over ≥10k ticks
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── tsup.config.ts
```

**Rationale**: each resolution rule is its own file with its own test.
This is the "rule of one function per file" that constitution Principle V
(simplicity) endorses, and it makes ≥80% coverage per file trivial.

**Citation**: constitution Principle V; spec FR-001 through FR-019.

---

## 11. What we are *not* doing (deferred)

To keep v1 minimal and to avoid over-engineering the engine (Simplicity
Principle), the following are explicitly **not** in scope for feature 001:

- Persistence / save games (no `localStorage`, no DB writes) — feature 006.
- Network transport — feature 004.
- Fog-of-war filtering — feature 002. (Engine emits full world;
  visibility is a consumer concern.)
- Terrain *generation* — feature 003. (Engine *consumes* a `Board`
  produced elsewhere; we only define the `Board` type.)
- Account / session management — feature 006.
- Matchmaking / lobby / private-vs-public — feature 006.
- Replays in v1 — the *data* format supports it (deterministic + seeded
  PRNG) but no UI / replay viewer ships in v1.

These boundaries are reflected in the contracts (engine exports the
types and the functions; everything else builds on top).

---

## 12. Resolved unknowns

| Open question (from prompt) | Resolution |
|-----------------------------|------------|
| Monorepo workspace manager | pnpm 11 |
| Build tool for `packages/engine` | tsup 8 |
| Test framework | Vitest 4.1 (v8 coverage) |
| Linting / formatting | Biome 2 |
| PRNG choice | sfc32 (with xmur3 for string seeds) |
| Numeric representation | Integer-only; no floats in tick logic |
| Engine API shape | Pure functions + readonly `World` snapshots |
| Tick-rate strategy | Engine is wall-clock-free; Scheduler (server) drives it |
| Constants location | `packages/engine/src/constants.ts` |

No `NEEDS CLARIFICATION` markers remain.
