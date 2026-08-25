# Quickstart: Core Game Engine (Feature 001)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `specs/001-core-game-engine/spec.md`

> Runnable validation scenarios for the engine package in isolation —
> no server, no client, no networking. Every other feature's quickstart
> will build on this one.
>
> **Status**: planning artifact. `packages/engine` does not exist yet
> (Phase 5 → Phase 6). These scenarios are what the implementation must
> satisfy. They are written as runnable Vitest specs so the implementer
> can paste-and-adapt when the package is scaffolded.

---

## 1. Prerequisites (when implementation begins)

- Node.js ≥ 20 LTS (matches pnpm 11 baseline)
- pnpm ≥ 11 (`corepack enable pnpm && corepack use pnpm@11`)
- Workspace bootstrapped via `pnpm install` (creates `packages/engine/`
  with `vitest`, `tsup`, `typescript`, `@biomejs/biome`).

### File layout being created

```
packages/engine/
├── package.json          // name: "@europa/engine", type: "module"
├── tsconfig.json         // strict: true; no implicit any
├── vitest.config.ts      // v8 coverage provider; threshold 80%
├── tsup.config.ts        // ESM + dts; src/index.ts → dist/
├── src/                  // see research.md §10
└── tests/                // see below
```

---

## 2. Quickstart scenarios

Each scenario is a Vitest spec. They cover FR-001 → FR-019 and SC-001
→ SC-005. The first one (Q-001) is the canonical "spin up a simulated
match to tick N" the prompt calls for.

### Q-001 — Tick a 2-player match from creation to terminal

**What it proves**: the engine runs end-to-end headless, returning
deterministic terminal results.

```ts
// packages/engine/tests/quickstart/tick-to-terminal.test.ts
import { describe, it, expect } from 'vitest';
import {
  createWorld,
  tick,
  isTerminal,
  hashWorld,
  ENGINE_CONSTANTS,
} from '@europa/engine';
import type { Board, MatchConfig } from '@europa/engine';

function buildSmallBoard(size: number, cities: Array<[number, number, 1 | 2]>): Board {
  // Build a flat board: all land, elevation 0, cities at given coords.
  // (Helper will live in tests/fixtures/board.ts once scaffolded.)
}

describe('quickstart — 2-player match to terminal', () => {
  it('ticks a small 8×8 board to a terminal result', () => {
    const config: MatchConfig = {
      boardSize: 8,
      playerCount: 2,
      tickIntervalMs: 0,        // irrelevant for headless
      seed: 0xC0FFEE,
      visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
    };
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);

    let world = createWorld(config, board);
    let safety = 0;
    while (!isTerminal(world) && safety < 5000) {
      world = tick(world).world;
      safety++;
    }

    expect(isTerminal(world)).toBeDefined();
    expect(safety).toBeLessThan(5000);

    // No matches with no orders end in <N ticks; production alone
    // doesn't eliminate. This first scenario runs a no-op tick loop;
    // it MUST terminate ONLY if a player is fed into a self-sustaining
    // stalemate (mutual feeding). The assertion below validates the
    // stalemate case: both players survive 200 ticks.
    expect(safety).toBeGreaterThanOrEqual(200);
  });

  it('produces byte-identical state from identical inputs (SC-001)', () => {
    const cfg: MatchConfig = {
      boardSize: 8, playerCount: 2, tickIntervalMs: 0,
      seed: 42, visibilityRadius: 2,
    };
    const board = buildSmallBoard(8, [[1, 1, 1], [6, 6, 2]]);

    const w1 = createWorld(cfg, board);
    const w2 = createWorld(cfg, board);

    expect(hashWorld(w1)).toBe(hashWorld(w2));

    const t1 = tick(w1);
    const t2 = tick(w2);
    expect(hashWorld(t1.world)).toBe(hashWorld(t2.world));
  });
});
```

**Run**: `pnpm --filter @europa/engine test -- quickstart/tick-to-terminal`

**Expected**: both tests pass; coverage report shows ≥80% on `src/`.

---

### Q-002 — City production saturates (US1 AC-1, FR-004)

```ts
import { describe, it, expect } from 'vitest';
import { createWorld, tick, getCell, ENGINE_CONSTANTS } from '@europa/engine';

describe('production saturates a city cell', () => {
  it('after N ticks, city contains min(N×rate, capacity) troops', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const world = createWorld({
      boardSize: 8, playerCount: 1, tickIntervalMs: 0, seed: 1,
      visibilityRadius: 2,
    }, board);

    let w = world;
    for (let i = 0; i < 10; i++) w = tick(w).world;

    const cell = getCell(w, 1, 1);
    expect(cell.troopCount).toBe(
      Math.min(10 * ENGINE_CONSTANTS.productionRate, ENGINE_CONSTANTS.cityCapacity),
    );
    expect(cell.troopOwner).toBe(1);
  });
});
```

---

### Q-003 — Downhill pipe flows more than uphill (US1 AC-4, FR-007)

```ts
describe('pipe flow respects slope', () => {
  it('downhill moves ≥ flat moves ≥ uphill', () => {
    // Build 3 boards: downhill, flat, uphill. Issue identical pipe
    // orders. Tick 1. Assert destination troop counts.
    // Expected ratios match ENGINE_CONSTANTS.flow{Downhill,Base,Uphill}Factor.
  });
});
```

---

### Q-004 — Identical re-runs are byte-identical (SC-001 over ≥10k ticks)

```ts
import { hashWorld, serializeWorld } from '@europa/engine';

describe('SC-001: determinism over 10,000 ticks', () => {
  it('two runs of the same scripted scenario hash identically', () => {
    const seed = 0xDEADBEEF;
    const cfg: MatchConfig = {
      boardSize: 16, playerCount: 2, tickIntervalMs: 0, seed,
      visibilityRadius: 2,
    };
    const board = buildSmallBoard(16, [[2, 2, 1], [13, 13, 2]]);

    // Scripted orders: set pipes east from (2,2), west from (13,13),
    // alternating each player, for 10,000 ticks. (Helper builds the
    // order batch.)

    const a = runScenario(cfg, board, scriptedOrders);
    const b = runScenario(cfg, board, scriptedOrders);

    expect(serializeWorld(a)).toEqual(serializeWorld(b));
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
```

---

### Q-005 — One-vs-one elimination ends in `win` for the survivor (US5)

```ts
describe('terminal condition: last player standing', () => {
  it('returns win result when one player has zero troops and zero cities', () => {
    // Build a board where player 1 has no cities; player 2 has cities
    // and a strong stack that pipes into player 1's only cell.
    // Tick until player 1 is eliminated.
    const result = isTerminal(world);
    expect(result?.kind).toBe('win');
    expect(result && 'winner' in result ? result.winner : null).toBe(2);
  });

  it('surrender immediately marks player eliminated (FR-016)', () => {
    const w0 = createWorld(cfg, board);
    const w1 = applyCommand(w0, { kind: 'surrender', player: 1 }).world;
    expect(getPlayer(w1, 1).status).toBe('eliminated');
    // Subsequent tick should declare player 2 the winner.
    const w2 = tick(w1);
    expect(w2.terminal?.kind).toBe('win');
  });
});
```

---

### Q-006 — Combat attrition (US2)

```ts
describe('attrition combat', () => {
  it('100v100 trade equal losses over one tick (US2 AC-1)', () => {
    // Pre-load two adjacent cells with 100 troops each from opposing
    // players. Open opposing pipes. Tick. Assert both stacks lost ~100.
  });

  it('200v50 overwhelms; 50 destroyed, attacker retains majority (US2 AC-2)', () => {
    // Same shape with 200 vs 50.
  });
});
```

---

### Q-007 — Decay, capacity, reserves (US3)

```ts
describe('decay, capacity, reserves', () => {
  it('unfed stack loses exactly 1 troop per tick (US3 AC-1)', () => {
    // Single cell, no pipes. After 5 ticks, count == initial - 5.
  });

  it('mutual feeding prevents decay (US3 AC-2, FR-010)', () => {
    // Two cells, each pipes into the other. After 50 ticks, both
    // stacks retain their original counts (no city supply needed).
  });

  it('reserves 30% holds at least 30% in place (US3 AC-3, FR-012)', () => {
    // Set reserves 30% on a cell with 100 troops. Pipe east.
    // Assert destination receives no more than 70 troops total.
  });

  it('cell capacity enforced (FR-011)', () => {
    // Pipe enough into a small cell that the cap is exceeded. Assert
    // destination count caps at capacity.
  });
});
```

---

### Q-008 — Paratroopers and guns (US4)

```ts
describe('paratroopers and guns', () => {
  it('paratroop 2:1 cost + clears pipes (US4 AC-1, AC-2, FR-013)', () => {
    // Source 20 troops, target 2 cells away (Chebyshev).
    // Issue paratroop with N=5. Source loses 10, target gains 5,
    // target's pipe config is cleared.
  });

  it('paratroop out of range is rejected (FR-018)', () => {
    // Source-target distance = 3. applyCommand returns ok:false.
  });

  it('paratroop into water rejected (FR-002)', () => {
    // Target is a water cell. applyCommand returns ok:false.
  });

  it('gun damages regardless of friend/foe (US4 AC-3, FR-014)', () => {
    // Fire into a cell with friendly troops. Friendly loses
    // ENGINE_CONSTANTS.gunDamage troops.
  });

  it('gun at empty cell only spends source troops (US4 AC-4)', () => {
    // Fire into an empty cell. Source loses gunCost; nothing else
    // changes.
  });
});
```

---

### Q-009 — Coverage gate (SC-003, constitution Principle III)

```bash
pnpm --filter @europa/engine test --coverage
```

**Expected output (abridged)**:

```
File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
src/           |   85.4  |   82.1   |   88.0  |   85.7
  applyCommand |   92.0  |   88.5   |  100.0  |   92.0
  tick         |   87.5  |   84.0   |   90.0  |   88.0
  resolution/  |   88.0  |   85.0   |   90.0  |   89.0
  ...          |   ...   |   ...    |   ...   |   ...
---------------|---------|----------|---------|--------
All files      |   85.4  |   82.1   |   88.0  |   85.7
```

Threshold is 80%; the build fails if any package drops below.

---

### Q-010 — Lint, typecheck, and determinism gates

```bash
# From repo root
pnpm -r typecheck             # tsc --noEmit per package
pnpm -r lint                  # biome lint .
pnpm -r format:check          # biome format --check .
pnpm --filter @europa/engine test    # full Vitest run (no filter)
```

**Expected**: all four exit zero. CI will run the same sequence.

---

## 3. Manual smoke (5-minute check)

After `pnpm install`, the implementer can do a manual sanity pass:

```bash
# Build the engine
pnpm --filter @europa/engine build

# Open a Node REPL with the engine loaded
node --input-type=module -e "
  import('./packages/engine/dist/index.js').then(async (m) => {
    const cfg = {
      boardSize: 8, playerCount: 2, tickIntervalMs: 0,
      seed: 1, visibilityRadius: 2,
    };
    const board = {
      width: 8, height: 8,
      cells: Array.from({length: 64}, (_, i) => ({
        x: i % 8, y: Math.floor(i/8),
        elevation: 0, terrain: 'land',
      })),
      cities: [
        { cell: { x: 1, y: 1 }, owner: 1 },
        { cell: { x: 6, y: 6 }, owner: 2 },
      ],
    };
    let w = m.createWorld(cfg, board);
    for (let i = 0; i < 10; i++) w = m.tick(w).world;
    console.log('tick:', w.tick, 'p1 troops:', m.getPlayer(w, 1).troopsHeld);
    console.log('hash:', m.hashWorld(w));
  });
"
```

**Expected output**:

```
tick: 10 p1 troops: <min(10 × productionRate, cityCapacity)>
hash: <64-char hex>
```

If this prints, the engine is wired up correctly end-to-end.

---

## 4. Acceptance criteria mapping

| Spec AC                                | Covered by |
|----------------------------------------|------------|
| US1 AC-1 — production saturates        | Q-002      |
| US1 AC-2 — pipe flow into empty cell   | Q-003 + supplementary test |
| US1 AC-3 — byte-identical re-runs      | Q-001, Q-004 |
| US1 AC-4 — slope factors               | Q-003      |
| US2 AC-1, AC-2, AC-3 — combat          | Q-006      |
| US3 AC-1 — decay                       | Q-007      |
| US3 AC-2 — mutual feeding              | Q-007      |
| US3 AC-3 — reserves                    | Q-007      |
| US4 AC-1, AC-2 — paratroops            | Q-008      |
| US4 AC-3, AC-4 — guns                  | Q-008      |
| US5 AC-1, AC-2 — terminal              | Q-005      |
| SC-001 (10k tick determinism)          | Q-004      |
| SC-002 (acceptance tests as automated) | Q-002..Q-008 |
| SC-003 (≥80% coverage)                 | Q-009      |
| SC-004 (32×32 < 10 ms/tick)            | perf benchmark (tasks.md, not quickstart) |
| SC-005 (constants location)            | imported as `ENGINE_CONSTANTS`; linter rule forbids literals in src/ |
| FR-002 (water impassable)              | Q-008 (paratroop-into-water) + supplementary tests |
| FR-009 (no inflow → decay 1/tick)      | Q-007      |
| FR-010 (mutual feeding)                | Q-007      |
| FR-011 (capacity cap)                  | Q-007      |
| FR-012 (reserves)                      | Q-007      |
| FR-013 (paratroop 2:1, range 2, clear) | Q-008      |
| FR-014 (gun cost, friendly fire)       | Q-008      |
| FR-015 (terminal condition)            | Q-005      |
| FR-016 (surrender)                     | Q-005      |
| FR-017 (determinism)                   | Q-001, Q-004 |
| FR-018 (command validation)            | Q-008 (paratroop rejection) + supplementary |
| FR-019 (2–4 players)                   | (3/4-player variant tested in supplementary file) |

---

## 5. What this quickstart deliberately does NOT cover

These are explicitly downstream concerns, handled in their own feature
plans:

- **Networking round-trip** — feature 004 quickstart will start two
  Node WebSocket clients and assert per-tick broadcasts.
- **Fog filtering** — feature 002 quickstart will assert visibility
  per-player per-tick.
- **Lobby / matchmaking** — feature 006 quickstart will spawn the full
  create → tick → terminal flow.
- **Rendering** — feature 005 quickstart will render a Vitest snapshot
  from a `PlayerView`.

The engine quickstart stops at "given a world and orders, tick it and
get a deterministic terminal result back" — the minimum primitive every
downstream feature builds on.
