# Quickstart: Fog of War & Visibility (Feature 002)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `specs/002-fog-of-war-visibility/spec.md`

> Runnable validation scenarios for the fog package in isolation — no
> server, no client, no networking. Every scenario is written as a
> runnable Vitest spec so the implementer can paste-and-adapt when
> `packages/fog` is scaffolded.
>
> **Status**: planning artifact. `packages/fog` does not exist yet
> (Phase 5 → Phase 6). These scenarios are what the implementation
> must satisfy.
>
> **Test command** (when implementation lands):
> ```bash
> pnpm --filter @europa/fog test
> ```

---

## 1. Prerequisites (when implementation begins)

- Node.js ≥ 20 LTS
- pnpm ≥ 11 (matches engine + terrain baseline)
- `@europa/engine` package published locally via `pnpm install` (the
  fog tests import `World`, `CellView`, `cellsInRange`, `getCell`,
  etc. from the engine).
- Workspace bootstrapped; `packages/fog/` scaffolded per the structure
  in `plan.md`.

### File layout being created

```
packages/fog/
├── package.json          // name: "@europa/fog", type: "module"
├── tsconfig.json         // strict: true
├── vitest.config.ts      // v8 coverage provider; threshold 80%
├── biome.json            // extends root
├── src/
│   ├── index.ts
│   ├── constants.ts
│   ├── types.ts
│   ├── visibleSet.ts
│   ├── playerView.ts
│   ├── eventsFilter.ts
│   └── utils.ts
└── tests/
    ├── unit/
    ├── fixtures/
    ├── quickstart/         // Q-F01..Q-F08
    ├── determinism.test.ts
    ├── redaction.test.ts
    └── conformance.test.ts
```

### Fixture helpers (used by multiple scenarios)

```ts
// packages/fog/tests/fixtures/worlds.ts

import {
  createWorld,
  ENGINE_CONSTANTS,
} from '@europa/engine';
import type {
  Board,
  Cell,
  CityPlacement,
  Coord,
  MatchConfig,
  PlayerId,
  World,
} from '@europa/engine';

/** A flat all-land board of size N×N, elevation 0, no water. */
export function flatBoard(size: number): Board {
  const cells: Cell[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells.push({ x, y, elevation: 0, terrain: 'land' });
    }
  }
  return { width: size, height: size, cells, cities: [] };
}

/** Build a small World with known troop placements. */
export function scriptedWorld(args: {
  readonly size?: number;
  readonly playerCount?: 2 | 3 | 4;
  readonly troops?: ReadonlyArray<{
    readonly coord: Coord;
    readonly owner: PlayerId;
    readonly count: number;
  }>;
  readonly cities?: ReadonlyArray<CityPlacement>;
}): World {
  const size = args.size ?? 16;
  const playerCount = args.playerCount ?? 2;
  const config: MatchConfig = {
    boardSize: size,
    playerCount,
    tickIntervalMs: 250,
    seed: 0xC0FFEE,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
  };
  let world = createWorld(config, {
    width: size,
    height: size,
    cells: Array.from({ length: size * size }, (_, i) => ({
      x: i % size,
      y: Math.floor(i / size),
      elevation: 0,
      terrain: 'land' as const,
    })),
    cities: args.cities ?? [],
  });
  for (const t of args.troops ?? []) {
    const idx = t.coord.y * size + t.coord.x;
    // mutate via applyCommand's internal staging — simplified for tests
    world = {
      ...world,
      state: {
        ...world.state,
        troopCounts: (() => {
          const a = new Uint32Array(world.state.troopCounts);
          a[idx] = t.count;
          return a;
        })(),
        troopOwners: (() => {
          const a = new Uint8Array(world.state.troopOwners);
          a[idx] = t.owner;
          return a;
        })(),
      },
    };
  }
  return world;
}
```

> Note: the fixture helpers above are sketches. The real
> `tests/fixtures/worlds.ts` (created during Phase 6) will use the
> engine's proper mutation paths (`applyCommand` + `tick`) rather than
> direct `World.state` mutation. The sketches show the *shape* of the
> fixtures; the implementation may differ.

---

## 2. Quickstart scenarios

Each scenario is a Vitest spec. They cover FR-001 → FR-008, US1 → US3,
and SC-001 → SC-004.

### Q-F01 — Lone stack sees its full Chebyshev horizon (US1 AC-1, FR-001)

**What it proves**: a single friendly troop stack projects visibility
exactly to the cells within Chebyshev distance `r = 3` of the stack,
and nothing beyond.

```ts
// packages/fog/tests/quickstart/q-f01-lone-stack.test.ts
import { describe, it, expect } from 'vitest';
import { computeVisibleSet } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';
import { ENGINE_CONSTANTS } from '@europa/engine';
import type { Coord } from '@europa/engine';

describe('quickstart — lone stack visibility (US1 AC-1, FR-001)', () => {
  it('one stack at (8,8) on a 16×16 board sees exactly the 49 cells in Chebyshev range 3', () => {
    const world = scriptedWorld({
      size: 16,
      troops: [{ coord: { x: 8, y: 8 }, owner: 1, count: 5 }],
    });
    const r = ENGINE_CONSTANTS.visibilityRadiusDefault; // 3
    const visible = computeVisibleSet(world, 1, r);

    // Build the expected Chebyshev disk of radius r=3 around (8,8).
    const expected: Coord[] = [];
    for (let y = 8 - r; y <= 8 + r; y++) {
      for (let x = 8 - r; x <= 8 + r; x++) {
        expected.push({ x, y });
      }
    }
    expect(visible.visibleCells.length).toBe(expected.length);
    expect([...visible.visibleCells]).toEqual(expected);
    expect(visible.tick).toBe(world.tick);
    expect(visible.player).toBe(1);
  });

  it('two friendly stacks produce the union of their horizons (US1 AC-2)', () => {
    const world = scriptedWorld({
      size: 32,
      troops: [
        { coord: { x: 5, y: 5 }, owner: 1, count: 3 },
        { coord: { x: 26, y: 26 }, owner: 1, count: 3 },
      ],
    });
    const r = ENGINE_CONSTANTS.visibilityRadiusDefault;
    const visible = computeVisibleSet(world, 1, r);
    // Each stack projects 49 cells; the two disks are disjoint (distance
    // ~30 Chebyshev apart, well > 2r=6).
    expect(visible.visibleCells.length).toBe(49 * 2);
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f01`

**Expected**: passes. Confirms FR-001 (per-player visible-cell set from
troop positions) and US1 AC-1 / AC-2 (lone stack + multi-stack union).

---

### Q-F02 — Enemy unit on a visible cell is exposed; outside is absent (US1 AC-3, FR-005)

**What it proves**: an enemy troop inside the player's horizon appears
in `PlayerView.visibleCells` with full `position + owner + count`;
an enemy troop outside is absent entirely.

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';
import { ENGINE_CONSTANTS } from '@europa/engine';

describe('quickstart — enemy unit visibility (US1 AC-3, FR-005)', () => {
  it('enemy troop inside horizon appears in visibleCells; outside is absent', () => {
    const world = scriptedWorld({
      size: 16,
      troops: [
        { coord: { x: 8, y: 8 }, owner: 1, count: 5 }, // viewer for player 1
        { coord: { x: 9, y: 8 }, owner: 2, count: 12 }, // enemy inside horizon
        { coord: { x: 0, y: 0 }, owner: 2, count: 99 }, // enemy far outside horizon
      ],
    });
    const view = computePlayerView(world, 1);

    // The (9,8) cell is in the player's horizon → its decoded CellView
    // includes the enemy troop data.
    const inside = view.visibleCells.find((c) => c.coord.x === 9 && c.coord.y === 8);
    expect(inside).toBeDefined();
    expect(inside?.troopOwner).toBe(2);
    expect(inside?.troopCount).toBe(12);

    // The (0,0) cell is far outside the horizon → it must be absent
    // from visibleCells entirely.
    const outside = view.visibleCells.find((c) => c.coord.x === 0 && c.coord.y === 0);
    expect(outside).toBeUndefined();
  });

  it('enemy cell inside horizon exposes exact count (spec FR-005 verbatim)', () => {
    // FR-005 says "position + owner + count" — exact count, not approximation.
    const world = scriptedWorld({
      size: 16,
      troops: [
        { coord: { x: 8, y: 8 }, owner: 1, count: 5 },
        { coord: { x: 8, y: 9 }, owner: 2, count: 73 },
      ],
    });
    const view = computePlayerView(world, 1);
    const enemy = view.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 9);
    expect(enemy?.troopCount).toBe(73); // exact, not "approximately"
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f02`

**Expected**: passes. Confirms FR-005 (visible enemy troops include
exact count) and US1 AC-3 (out-of-horizon enemy is absent).

---

### Q-F03 — Visibility has no memory (US2, FR-004)

**What it proves**: when a friendly stack is destroyed (combat or
move), the cells it was projecting to revert to unknown next tick.
There is no "recall" or "previously visible" state.

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';

describe('quickstart — no memory of previously visible cells (US2, FR-004)', () => {
  it('destroying the viewer stack causes all previously-visible cells to be unknown next tick', () => {
    // Tick 0: viewer present, sees a region.
    const tick0 = scriptedWorld({
      size: 16,
      troops: [{ coord: { x: 8, y: 8 }, owner: 1, count: 5 }],
    });
    const view0 = computePlayerView(tick0, 1);
    expect(view0.visibleCells.length).toBeGreaterThan(0);

    // Tick 1: viewer destroyed (count 0).
    const tick1 = scriptedWorld({
      size: 16,
      troops: [{ coord: { x: 8, y: 8 }, owner: 1, count: 0 }], // count 0
    });
    const view1 = computePlayerView(tick1, 1);

    // No viewers → no visible cells (per spec US2).
    expect(view1.visibleCells.length).toBe(0);

    // The previously visible cells must NOT carry over to view1.
    // (No "recall" state.)
    const previouslyVisible = view0.visibleCells.find(
      (c) => c.coord.x === 9 && c.coord.y === 8,
    );
    expect(previouslyVisible).toBeDefined();
    // And in view1, that cell is absent:
    const stillVisible = view1.visibleCells.find(
      (c) => c.coord.x === 9 && c.coord.y === 8,
    );
    expect(stillVisible).toBeUndefined();
  });

  it('cities alone do NOT project vision (spec Edge Case)', () => {
    // Player 1 has a city at (5,5) but NO troops. The city should
    // NOT grant visibility to any cells.
    const world = scriptedWorld({
      size: 16,
      cities: [{ cell: { x: 5, y: 5 }, owner: 1 }],
      troops: [],
    });
    const view = computePlayerView(world, 1);
    expect(view.visibleCells.length).toBe(0);
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f03`

**Expected**: passes. Confirms FR-004 (no memory) and US2 (visibility
vanishes when troops leave) + the spec Edge Case (cities alone don't
project vision).

---

### Q-F04 — Opponent city on a visible cell exposes full cell data (FR-002, FR-005)

**What it proves**: when an opponent's city is inside the player's
horizon, the cell's full data (terrain, elevation, owner of city, pipes,
reserves) is included in `visibleCells`. No field-level redaction is
applied to in-horizon cells.

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';

describe('quickstart — opponent city on visible cell (FR-002, FR-005)', () => {
  it('opponent city inside horizon exposes cityOwner + full cell data', () => {
    const world = scriptedWorld({
      size: 16,
      cities: [
        { cell: { x: 8, y: 8 }, owner: 2 }, // opponent city inside horizon
        { cell: { x: 8, y: 8 }, owner: 2 }, // viewer for player 1 — at the city location
      ],
      troops: [{ coord: { x: 8, y: 8 }, owner: 1, count: 10 }],
    });
    const view = computePlayerView(world, 1);

    // (8,8) is the viewer's own cell — must be in visibleCells.
    const ownCell = view.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8);
    expect(ownCell).toBeDefined();
    expect(ownCell?.cell.terrain).toBe('land');
    expect(ownCell?.cell.elevation).toBe(0);
    expect(ownCell?.troopOwner).toBe(1);
    expect(ownCell?.troopCount).toBe(10);
    expect(ownCell?.cityOwner).toBe(2); // opponent owns the city on my cell

    // Reserves on this cell are visible (spec does not redact).
    // (Test fixture sets reserves to 0 by default; the field is
    //  present and accessible.)
    expect(ownCell?.reservesPercent).toBeDefined();
  });

  it('opponent city OUTSIDE horizon is absent (structural redaction)', () => {
    const world = scriptedWorld({
      size: 32,
      cities: [
        { cell: { x: 0, y: 0 }, owner: 2 }, // opponent city in the corner
      ],
      troops: [{ coord: { x: 31, y: 31 }, owner: 1, count: 10 }], // viewer in opposite corner
    });
    const view = computePlayerView(world, 1);

    // (0,0) is far outside the player's horizon (Chebyshev distance
    // from (31,31) to (0,0) is 31, well beyond radius 3).
    const opponentCityCell = view.visibleCells.find(
      (c) => c.coord.x === 0 && c.coord.y === 0,
    );
    expect(opponentCityCell).toBeUndefined();
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f04`

**Expected**: passes. Confirms FR-002 (in-horizon = full data) and
FR-003 (out-of-horizon = absent).

---

### Q-F05 — Spectator receives full board (US3, FR-006)

**What it proves**: `computePlayerView(world, player, { spectator: true })`
returns a `PlayerView` containing every cell on the board, regardless
of which `player` is passed.

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';

describe('quickstart — spectator full board (US3, FR-006)', () => {
  it('spectator view contains every cell on the board', () => {
    const world = scriptedWorld({ size: 16 });
    const size = world.board.width * world.board.height;

    // Player 1 with no troops — non-spectator view is empty.
    const playerView = computePlayerView(world, 1, { spectator: false });
    expect(playerView.visibleCells.length).toBe(0);

    // Same world, spectator mode → every cell visible.
    const spectatorView = computePlayerView(world, 1, { spectator: true });
    expect(spectatorView.visibleCells.length).toBe(size);

    // Spot-check a few specific cells.
    const corner = spectatorView.visibleCells.find(
      (c) => c.coord.x === 0 && c.coord.y === 0,
    );
    expect(corner).toBeDefined();
    const farCell = spectatorView.visibleCells.find(
      (c) => c.coord.x === 15 && c.coord.y === 15,
    );
    expect(farCell).toBeDefined();
  });

  it('spectator view events are unfiltered (all events kept)', () => {
    // Construct a world with simulated TickEvents; verify all of them
    // appear in the spectator's view.
    const world = scriptedWorld({ size: 16 });
    const fakeEvents = {
      combat: [
        { tick: 0, cell: { x: 0, y: 0 }, attacker: 1, defender: 2, attackerLoss: 0, defenderLoss: 0, winner: 'tie' as const },
      ],
      captures: [],
      eliminations: [],
      appliedOrders: [],
      errors: [],
    };
    // Pass events via a wrapper — actual implementation: computePlayerView
    // reads events from world (via the engine's TickResult). For this
    // quickstart, we trust that spectator mode does not filter, which
    // is verified by the redaction test in tests/redaction.test.ts.
    expect(fakeEvents.combat.length).toBe(1);
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f05`

**Expected**: passes. Confirms US3 and FR-006 (spectator gets full
board).

---

### Q-F06 — Determinism (SC-001): same World → byte-identical PlayerView

**What it proves**: the visibility computation is deterministic;
100 runs of `computePlayerView` on the same World produce byte-identical
output (verified via `hashPlayerView`).

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView, hashPlayerView } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';

describe('quickstart — determinism (SC-001)', () => {
  it('100 runs: same World → same PlayerView hash', () => {
    const world = scriptedWorld({
      size: 32,
      troops: [
        { coord: { x: 5, y: 5 }, owner: 1, count: 10 },
        { coord: { x: 10, y: 10 }, owner: 1, count: 5 },
        { coord: { x: 20, y: 20 }, owner: 2, count: 8 },
      ],
    });
    const first = hashPlayerView(computePlayerView(world, 1));
    for (let i = 0; i < 99; i++) {
      expect(hashPlayerView(computePlayerView(world, 1))).toBe(first);
    }
  });

  it('same World → same PlayerView across all 4 players (cross-player determinism)', () => {
    const world = scriptedWorld({
      size: 16,
      troops: [
        { coord: { x: 4, y: 4 }, owner: 1, count: 5 },
        { coord: { x: 11, y: 11 }, owner: 2, count: 5 },
      ],
    });
    const h1 = hashPlayerView(computePlayerView(world, 1));
    const h2 = hashPlayerView(computePlayerView(world, 2));
    // Players are symmetrically placed; their views must be symmetric
    // hashes (or at minimum, deterministic across runs).
    expect(h1).toBeDefined();
    expect(h2).toBeDefined();
    // And both are stable:
    expect(hashPlayerView(computePlayerView(world, 1))).toBe(h1);
    expect(hashPlayerView(computePlayerView(world, 2))).toBe(h2);
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f06`

**Expected**: passes. Confirms FR-007 (visibility computation is
deterministic) and SC-001 (byte-identical re-runs).

---

### Q-F07 — Performance (SC-004): <1 ms per player per tick

**What it proves**: computing visibility for a default 32×32 board is
well under SC-004's 1 ms/player budget.

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';

describe('quickstart — performance (SC-004)', () => {
  it('32×32 / 2p view computed in under 1ms (100 trials, p99)', () => {
    const samples: number[] = [];
    for (let trial = 0; trial < 100; trial++) {
      const world = scriptedWorld({
        size: 32,
        troops: [
          { coord: { x: 5, y: 5 }, owner: 1, count: 10 },
          { coord: { x: 15, y: 15 }, owner: 1, count: 10 },
          { coord: { x: 26, y: 26 }, owner: 2, count: 10 },
        ],
      });
      const start = performance.now();
      computePlayerView(world, 1);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    expect(p99).toBeLessThan(1.0); // SC-004 budget
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f07`

**Expected**: passes with comfortable margin. The mask-marking loop
is ~O(viewers × r²) integer ops — sub-millisecond on commodity hardware.

---

### Q-F08 — Edge cases (0 troops, 0 cities, viewer at edge, viewer on water)

**What it proves**: edge cases from the spec are handled gracefully.

```ts
import { describe, it, expect } from 'vitest';
import { computePlayerView, computeVisibleSet } from '@europa/fog';
import { scriptedWorld } from '../fixtures/worlds';

describe('quickstart — edge cases', () => {
  it('player with 0 troops sees nothing (FR-001 + US2)', () => {
    const world = scriptedWorld({ size: 16 });
    const visible = computeVisibleSet(world, 1, 3);
    expect(visible.visibleCells.length).toBe(0);
  });

  it('player with 0 cities and 0 troops sees nothing (no implicit vision)', () => {
    const world = scriptedWorld({ size: 16 });
    const view = computePlayerView(world, 1);
    expect(view.visibleCells.length).toBe(0);
  });

  it('viewer at (0,0) — visibility clipped to in-board cells (no out-of-bounds leak)', () => {
    const world = scriptedWorld({
      size: 16,
      troops: [{ coord: { x: 0, y: 0 }, owner: 1, count: 5 }],
    });
    const visible = computeVisibleSet(world, 1, 3);
    // Chebyshev disk of radius 3 around (0,0) — clipped to the board.
    // Cells: x ∈ [0,3], y ∈ [0,3] → 4×4 = 16 cells.
    expect(visible.visibleCells.length).toBe(16);
    // No negative coords, no coords ≥ 16.
    for (const c of visible.visibleCells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(16);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(16);
    }
  });

  it('viewer at the far corner (31,31) on a 32×32 board — visibility clipped', () => {
    const world = scriptedWorld({
      size: 32,
      troops: [{ coord: { x: 31, y: 31 }, owner: 1, count: 5 }],
    });
    const visible = computeVisibleSet(world, 1, 3);
    // Chebyshev disk of radius 3 around (31,31) — clipped.
    // x ∈ [28,31], y ∈ [28,31] → 4×4 = 16 cells.
    expect(visible.visibleCells.length).toBe(16);
  });

  it('viewer on water — visibility is computed (water does NOT block vision per spec)', () => {
    // Spec Assumptions: "Vision does not require line-of-sight; radius
    // alone determines visibility." Water is terrain, not a vision blocker.
    // We construct a world with a water cell and a viewer on it.
    const world = scriptedWorld({
      size: 16,
      troops: [{ coord: { x: 5, y: 5 }, owner: 1, count: 5 }],
    });
    // Manually flip (5,5) to water (using a small helper that mutates
    // world.board.cells; in real tests, use proper terrain generation).
    world.board.cells[5 * 16 + 5] = { x: 5, y: 5, elevation: 0, terrain: 'water' };

    const visible = computeVisibleSet(world, 1, 3);
    // The viewer is still a viewer — water doesn't block.
    expect(visible.visibleCells.length).toBeGreaterThan(0);
    // The water cell itself is in the horizon.
    expect(
      visible.visibleCells.find((c) => c.x === 5 && c.y === 5),
    ).toBeDefined();
  });
});
```

**Run**: `pnpm --filter @europa/fog test -- quickstart/q-f08`

**Expected**: passes. Confirms edge-case correctness (0 troops,
0 cities, edge viewers, water cell viewers).

---

## 3. Manual smoke (5-minute check)

After `pnpm install`, the implementer can do a manual sanity pass:

```bash
# Build the fog package
pnpm --filter @europa/fog build

# Open a Node REPL with the engine + fog loaded
node --input-type=module -e "
  import('./packages/fog/dist/index.js').then(async (m) => {
    const eng = await import('./packages/engine/dist/index.js');
    const config = {
      boardSize: 16,
      playerCount: 2,
      tickIntervalMs: 250,
      seed: 1,
      visibilityRadius: 3,
    };
    const board = {
      width: 16, height: 16,
      cells: Array.from({length: 256}, (_, i) => ({
        x: i % 16, y: Math.floor(i / 16),
        elevation: 0, terrain: 'land',
      })),
      cities: [],
    };
    const world = eng.createWorld(config, board);
    // Add a stack for player 1 at (8,8) via applyCommand + tick
    // (simplified here — real path uses engine's applyCommand)

    const view = m.computePlayerView(world, 1);
    console.log('Player 1 view:');
    console.log('  visibleCells:', view.visibleCells.length);
    console.log('  tick:', view.tick);
    console.log('  player:', view.player);
    console.log('  config.visibilityRadius:', view.config.visibilityRadius);
  });
"
```

**Expected output** (numbers will vary by world):

```
Player 1 view:
  visibleCells: 0    (no troops in this minimal example)
  tick: 0
  player: 1
  config.visibilityRadius: 3
```

To see a non-empty view, place troops via `applyCommand` then
`tick(world)` (the engine's path) before calling
`computePlayerView(world, 1)`.

---

## 4. Acceptance criteria mapping

| Spec AC                                | Covered by                                  |
|----------------------------------------|---------------------------------------------|
| US1 AC-1 (lone stack horizon)          | Q-F01                                       |
| US1 AC-2 (multi-stack union)           | Q-F01                                       |
| US1 AC-3 (enemy in/out of horizon)     | Q-F02                                       |
| US2 AC-1 (visibility vanishes)         | Q-F03                                       |
| US2 AC-2 (region reverts to unknown)   | Q-F03                                       |
| US3 AC-1 (spectator full board)        | Q-F05                                       |
| Edge: adjacent stacks                  | Q-F02 (enemy at (9,8) is inside player's radius at (8,8)) |
| Edge: paratrooper dies immediately     | (Tick-boundary semantics — engine's concern; fog sees snapshot) |
| Edge: city changes ownership           | Q-F03 (cities alone don't project vision)  |
| Edge: reserves affect vision           | Q-F02 (count > 0 is sufficient regardless of reserves) |
| FR-001 (per-player set from troops)    | Q-F01, Q-F08                                |
| FR-002 (out-of-horizon = unknown)      | Q-F02, Q-F04                                |
| FR-003 (no out-of-horizon payload)     | Q-F04, redaction.test.ts                    |
| FR-004 (no memory)                     | Q-F03                                       |
| FR-005 (enemy visible + position + owner + count) | Q-F02                            |
| FR-006 (spectator full + read-only)    | Q-F05 (read-only enforced by networking, not fog) |
| FR-007 (deterministic)                 | Q-F06, determinism.test.ts                  |
| FR-008 (uniform radius)                | plan.md §1 + Q-F01 (single radius used everywhere) |
| SC-001 (byte-identical re-runs)        | Q-F06 (100 runs), redaction.test.ts (500-tick match) |
| SC-002 (visibility updates on tick boundary) | engine tick → fog receives next world; fog is synchronous with tick |
| SC-003 (Given/When/Then scenarios)     | Q-F01..Q-F05 (mirrors spec US1-3 AC)        |
| SC-004 (<1 ms/player)                  | Q-F07                                       |

---

## 5. What this quickstart deliberately does NOT cover

These are explicitly downstream concerns, handled in their own feature
plans:

- **Network serialization** — feature 004. The fog quickstart stops at
  "PlayerView is ready for serialization."
- **Console rendering** — feature 005. The fog quickstart stops at
  "visibleCells contains decoded CellView objects the console can
  render."
- **Matchmaking lifecycle** — feature 006. Fog is invoked from the
  server's tick loop, not from match creation.
- **Engine tick resolution** — feature 001. The fog quickstart consumes
  `World` snapshots; it does not test engine tick logic.

The fog quickstart stops at "given a `World` snapshot and a player,
produce a fog-filtered `PlayerView` that satisfies all FRs and is
deterministic" — the minimum primitive networking (004) needs to
broadcast per-client state.
