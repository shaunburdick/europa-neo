# `@europa/engine`

Europa Neo's core game engine — deterministic, pure, server-authoritative tick simulation (cities, pipes, fog, combat, decay, paratroopers, guns, victory).

This is the `@europa/engine` workspace package. It implements Feature 001 of the Europa Neo monorepo (see [`.specify/features/001-core-game-engine/spec.md`](../../.specify/features/001-core-game-engine/spec.md)).

## Install

From the monorepo root:

```sh
pnpm install
```

The engine package has no runtime dependencies outside of `tsup`, `vitest`, `@biomejs/biome`, and `typescript` (all dev dependencies pinned via pnpm catalog).

## Build

```sh
pnpm --filter @europa/engine build
```

Produces `dist/index.js` (ESM bundle) and `dist/index.d.ts` (TypeScript declarations). The engine's public surface is the union of:

- All types from `src/contracts/engine-types.ts` (re-exported through `src/types.ts`)
- All function declarations from `src/contracts/engine-api.ts` (implemented in `src/*.ts`)
- Constants: `ENGINE_CONSTANTS`, `DEFAULT_TICK_INTERVAL_MS`

See [`dist/index.d.ts`](./dist/index.d.ts) after `pnpm build` for the resolved type surface.

## Test

```sh
pnpm --filter @europa/engine test
```

Runs the full test suite (≈280 tests across unit, quickstart, determinism, multi-player, perf, and contract-drift suites).

## Coverage

```sh
pnpm --filter @europa/engine coverage
```

Enforces the 80% threshold (lines / functions / branches / statements) per the constitution's merge gate (Principle III). The threshold is configured in [`vitest.config.ts`](./vitest.config.ts).

## Quick usage example

The minimal smoke REPL mirrors `quickstart.md` §3 — create a world, stage a pipe order, tick once, inspect the result:

```ts
import {
  applyCommand,
  createWorld,
  ENGINE_CONSTANTS,
  tick,
} from '@europa/engine';

// 1. Build a tiny board with two cities (one per player).
const board = {
  width: 8,
  height: 8,
  cells: Array.from({ length: 64 }, (_, i) => ({
    x: i % 8,
    y: Math.floor(i / 8),
    elevation: 0,
    terrain: 'land' as const,
  })),
  cities: [
    { cell: { x: 1, y: 1 }, owner: 1 }, // P1's city
    { cell: { x: 6, y: 6 }, owner: 2 }, // P2's city
  ],
};

// 2. Create the initial world.
const config = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 1,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};
let world = createWorld(config, board);

// 3. Stage a pipe order on P1's city.
const staged = applyCommand(world, {
  kind: 'setPipe',
  player: 1,
  cell: { x: 1, y: 1 },
  direction: 'E',
});
if (!staged.result.ok) {
  throw new Error('pipe rejected');
}
world = staged.world;

// 4. Tick once. Cities gain `productionRate` (1) troop; pipe moves
//    `flowBase × factor` (1 × 1 = 1) troops east.
const result = tick(world);
console.log('tick:', result.world.tick);
console.log('troops at (2, 1):', result.world.state.troopCounts[1 * 8 + 2]);
```

For the full feature surface (orders, validation, serialization, terminal detection), see the API documentation in [`dist/index.d.ts`](./dist/index.d.ts) and the spec at [`.specify/features/001-core-game-engine/spec.md`](../../.specify/features/001-core-game-engine/spec.md).

## Determinism

The engine is **deterministic by contract** (spec FR-017, SC-001):

- No wall-clock reads inside `tick()` or any resolution module.
- No `Math.random()` — all randomness comes from a per-match `sfc32` PRNG seeded with `MatchConfig.seed`.
- No trig (`Math.sin`, `Math.cos`, etc.) in state updates.
- Integer-only arithmetic (`Math.imul`, `>>>` 0 coercion).
- Fixed iteration order (row-major cell traversal, fixed direction bit order, fixed order-application sort by `PlayerId` ascending then `kind` alphabetical).

Two runs with the same `(MatchConfig, Board, Order[])` input produce **byte-identical** `World` outputs, verified by `tests/determinism.test.ts` (10,000-tick scenario).

`performance.now()` IS used by `tests/perf/tick-perf.bench.ts` to measure benchmark durations — that's a measurement-only path that lives outside the engine source tree (`tests/` is excluded from production builds).

## License

See the repository root for license terms. The original Europa game (Alex Nicolaou, 1990s) is SOS-licensed and NOT copied into this codebase — this is a clean-room reimplementation from documented behavior.
