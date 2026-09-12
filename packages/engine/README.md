# `@europa/engine`

Europa Neo's core game engine — deterministic, pure, server-authoritative tick simulation (cities, pipes, fog, combat, decay, paratroopers, guns, victory).

This is the `@europa/engine` workspace package. It implements Feature 001 of the Europa Neo monorepo (see [`specs/001-core-game-engine/spec.md`](../../specs/001-core-game-engine/spec.md)).

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
import { parsePlayerId } from '@europa/core';
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
    { cell: { x: 1, y: 1 }, owner: 1 }, // slot 1 → playerIds[0]
    { cell: { x: 6, y: 6 }, owner: 2 }, // slot 2 → playerIds[1]
  ],
};

// 2. Create the initial world. Identities are explicit, canonical, and
//    server-issued (issue #74) — the engine never derives them from seat
//    or array position.
const P1 = parsePlayerId('PLAYER000001');
const P2 = parsePlayerId('PLAYER000002');
const config = {
  boardSize: 8,
  playerIds: [P1, P2],
  tickIntervalMs: 250,
  seed: 1,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};
let world = createWorld(config, board);

// 3. Stage a pipe order on P1's city.
const staged = applyCommand(world, {
  kind: 'setPipe',
  player: P1,
  cell: { x: 1, y: 1 },
  direction: 'E',
});
if (!staged.result.ok) {
  throw new Error('pipe rejected');
}
world = staged.world;

// 4. Tick once. Cities gain `productionRate` (1) troop; the flat pipe
//    moves `flowRateForDelta(0, ENGINE_CONSTANTS)` = `flowBase` = 7
//    troops east (FR-007 elevation-gradient model: downhill pipes gain
//    up to `flowSlopeStep × flowSlopeDeltaCap` extra, uphill pipes lose
//    `flowSlopeStep` per unit of climb and stall at Δ ≥ 7).
const result = tick(world);
console.log('tick:', result.world.tick);
console.log('troops at (2, 1):', result.world.state.troopCounts[1 * 8 + 2]);
```

For the full feature surface (orders, validation, serialization, terminal detection), see the API documentation in [`dist/index.d.ts`](./dist/index.d.ts) and the spec at [`specs/001-core-game-engine/spec.md`](../../specs/001-core-game-engine/spec.md).

## Replay Tools (Feature 022)

The engine ships with a deterministic match capture/replay harness for debugging and regression testing. Three CLI scripts are available from the monorepo root:

### Capture a match

```sh
pnpm replay:capture --seed 42 --out fixture.json
```

Records a headless match's seed, settings, and order sequence to a JSON fixture file. Accepts `--player-ids <id1,id2,...>` (2–4 explicit canonical 12-character ids; default `PLAYER000001,PLAYER000002`), `--settings <path>`, and `--orders <path>` for custom identities, terrain settings, and scripted orders. Every recorded order's `playerId` must be one of the configured ids — numeric, malformed, or unknown-player values exit with code 2.

### Replay a captured match

```sh
pnpm replay:run fixture.json
```

Replays the fixture through the engine and compares the final state hash against the stored baseline. Exit codes:

- **0** — PASS: hash matches
- **1** — FAIL: hash differs
- **2** — Input error (missing file, invalid JSON, missing fields)

Output format: `PASS <tickCount> ticks` or `FAIL expected <hash> got <actual>`.

### Update baseline hash

```sh
pnpm replay:update fixture.json
```

Replays the fixture and overwrites the `finalStateHash` field with the engine's current output. Prints old → new hash for audit trail.

### Fixture format (version 1)

```json
{
  "version": 1,
  "seed": 42,
  "settings": { "boardSize": 32, "playerIds": ["PLAYER000001", "PLAYER000002"], "tickIntervalMs": 250, "seed": 42, "visibilityRadius": 6 },
  "terrainSettings": { "waterRatio": 0.1, "roughness": 0.5, "octaves": 4, "citiesPerPlayer": 1, "symmetryStrategy": "point", "minCityWaterDistance": 3, "minCityCityDistance": 5, "maxRegenAttempts": 5, "terrainSmoothing": 4 },
  "playerCount": 2,
  "orders": [],
  "terminalTick": 1,
  "terminalResult": null,
  "finalStateHash": "0aafe88f",
  "engineVersion": "0.2.0"
}
```

### Programmatic usage

```ts
import { validateFixture, replayMatch, checkVersionMismatch } from '@europa/engine';

const fixture = validateFixture(JSON.parse(rawJson));
const warning = checkVersionMismatch(fixture.engineVersion);
if (warning !== null) console.warn(warning);

// Generate board from fixture.seed + fixture.terrainSettings (via @europa/terrain)
// then replay:
const result = replayMatch(fixture, board);
console.log(result.hash === fixture.finalStateHash ? 'PASS' : 'FAIL');
```

## Determinism

The engine is **deterministic by contract** (spec FR-017, SC-001):

- No wall-clock reads inside `tick()` or any resolution module.
- No `Math.random()` — all randomness comes from a per-match `sfc32` PRNG seeded with `MatchConfig.seed`.
- No trig (`Math.sin`, `Math.cos`, etc.) in state updates.
- Integer-only arithmetic (`Math.imul`, `>>>` 0 coercion).
- Fixed iteration order (row-major cell traversal, fixed direction bit order, fixed order-application sort by canonical UTF-16 `PlayerId` code units, then `kind` alphabetical).

Two runs with the same `(MatchConfig, Board, Order[])` input produce **byte-identical** `World` outputs, verified by `tests/determinism.test.ts` (10,000-tick scenario).

`performance.now()` IS used by `tests/perf/tick-perf.bench.ts` to measure benchmark durations — that's a measurement-only path that lives outside the engine source tree (`tests/` is excluded from production builds).

## License

See the repository root for license terms. The original Europa game (Alex Nicolaou, 1990s) is SOS-licensed and NOT copied into this codebase — this is a clean-room reimplementation from documented behavior.
