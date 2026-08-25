# Quickstart: Procedural Terrain Generation (Feature 003)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `specs/003-procedural-terrain-generation/spec.md`

> Runnable validation scenarios for the terrain package in isolation —
> no engine, no server, no client, no networking. Every scenario is
> written as a runnable Vitest spec so the implementer can paste-and-
> adapt when `packages/terrain` is scaffolded.
>
> **Status**: planning artifact. `packages/terrain` does not exist yet
> (Phase 5 → Phase 6). These scenarios are what the implementation
> must satisfy.
>
> **Test command** (when implementation lands):
> ```bash
> pnpm --filter @europa/terrain test
> ```

---

## 1. Prerequisites (when implementation begins)

- Node.js ≥ 20 LTS
- pnpm ≥ 11 (matches engine baseline)
- `@europa/engine` package published locally via `pnpm install` (the
  terrain tests will `import { sfc32 } from '@europa/engine'` or
  from a local fixture, per the proposed additive change #1).
- Workspace bootstrapped; `packages/terrain/` scaffolded per the
  structure in `plan.md`.

### File layout being created

```
packages/terrain/
├── package.json          // name: "@europa/terrain", type: "module"
├── tsconfig.json         // strict: true
├── vitest.config.ts      // v8 coverage provider; threshold 80%
├── biome.json            // extends root
├── src/
│   ├── index.ts
│   ├── constants.ts
│   ├── types.ts
│   ├── generate.ts
│   ├── noise.ts
│   ├── symmetry.ts
│   ├── water.ts
│   ├── cities.ts
│   ├── validate.ts
│   └── prng.ts
└── tests/
    ├── unit/
    ├── fixtures/
    ├── quickstart/         // Q-T01..Q-T08
    ├── determinism.test.ts
    ├── balance.test.ts
    └── conformance.test.ts
```

---

## 2. Quickstart scenarios

Each scenario is a Vitest spec. They cover FR-001 → FR-009 and SC-001
→ SC-004.

### Q-T01 — Same seed produces byte-identical Board (SC-001, FR-006)

**What it proves**: the generator is deterministic; the same seed and
PRNG state produce the same Board hash every time.

```ts
// packages/terrain/tests/quickstart/q-t01-determinism.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateBoard,
  hashBoard,
  DEFAULT_GENERATION_SETTINGS,
  TERRAIN_API_VERSION,
} from '@europa/terrain';
import { sfc32 } from '@europa/engine'; // proposed additive change #1

describe('quickstart — determinism (SC-001, FR-006)', () => {
  it('1000 trials: same seed + same PRNG state → identical Board hash', () => {
    for (let trial = 0; trial < 1000; trial++) {
      const seed = (trial * 0x9E3779B1) >>> 0; // golden ratio mix
      const rng1 = sfc32(seed);
      const rng2 = sfc32(seed);

      const r1 = generateBoard({
        boardSize: 32,
        playerCount: 2,
        seed,
        rng: rng1,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      const r2 = generateBoard({
        boardSize: 32,
        playerCount: 2,
        seed,
        rng: rng2,
        settings: DEFAULT_GENERATION_SETTINGS,
      });

      expect(hashBoard(r1.board)).toBe(hashBoard(r2.board));
      expect(r1.effectiveSeed).toBe(r2.effectiveSeed);
    }
  });

  it('reproduces a known-good golden Board (regression guard)', () => {
    // Snapshot test: a specific seed produces a specific hash. If
    // the algorithm changes, this test fails and forces a deliberate
    // update. Catches accidental algorithm drift.
    const seed = 0xC0FFEE;
    const rng = sfc32(seed);
    const { board, effectiveSeed } = generateBoard({
      boardSize: 32,
      playerCount: 2,
      seed,
      rng,
      settings: DEFAULT_GENERATION_SETTINGS,
    });
    expect(hashBoard(board)).toMatchSnapshot();
    expect(effectiveSeed).toBe(seed);
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t01`

**Expected**: both tests pass. The snapshot test creates a
`tests/quickstart/__snapshots__/q-t01-determinism.test.ts.snap` file
on first run; commit it.

---

### Q-T02 — Different seeds produce different Boards (FR-006)

**What it proves**: the generator's PRNG stream actually varies the
output (sanity check that the seed is wired in correctly).

```ts
import { generateBoard, hashBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32 } from '@europa/engine';

describe('quickstart — seed variability', () => {
  it('100 different seeds produce ≥ 95 distinct Boards', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const seed = (i * 0x9E3779B1) >>> 0;
      const rng = sfc32(seed);
      const { board } = generateBoard({
        boardSize: 32,
        playerCount: 2,
        seed,
        rng,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      hashes.add(hashBoard(board));
    }
    expect(hashes.size).toBeGreaterThanOrEqual(95);
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t02`

**Expected**: passes. With 100 random 32×32 boards, statistical
collision is negligible (the noise function has high entropy per cell).

---

### Q-T03 — Point-symmetric maps (US1 AC-1, FR-004)

**What it proves**: elevation, water, and cities are all 180°-rotation
symmetric. The `validateBoard` helper enforces this; we also assert it
explicitly to make the test self-documenting.

```ts
import { generateBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32 } from '@europa/engine';
import type { Board } from '@europa/engine';

function rotatedCoord(x: number, y: number, w: number, h: number) {
  return { x: w - 1 - x, y: h - 1 - y };
}

describe('quickstart — point symmetry (US1 AC-1, FR-004)', () => {
  it('elevation is 180°-symmetric', () => {
    const rng = sfc32(42);
    const { board } = generateBoard({
      boardSize: 32, playerCount: 2, seed: 42, rng,
      settings: DEFAULT_GENERATION_SETTINGS,
    });
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const a = board.cells[y * board.width + x];
        const { x: rx, y: ry } = rotatedCoord(x, y, board.width, board.height);
        const b = board.cells[ry * board.width + rx];
        expect(a.elevation).toBe(b.elevation);
      }
    }
  });

  it('water is 180°-symmetric', () => {
    const rng = sfc32(42);
    const { board } = generateBoard({
      boardSize: 32, playerCount: 2, seed: 42, rng,
      settings: DEFAULT_GENERATION_SETTINGS,
    });
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const a = board.cells[y * board.width + x];
        const { x: rx, y: ry } = rotatedCoord(x, y, board.width, board.height);
        const b = board.cells[ry * board.width + rx];
        expect(a.terrain).toBe(b.terrain);
      }
    }
  });

  it('cities are 180°-symmetric across the center', () => {
    const rng = sfc32(42);
    const { board } = generateBoard({
      boardSize: 32, playerCount: 2, seed: 42, rng,
      settings: DEFAULT_GENERATION_SETTINGS,
    });
    // For 2 players, every player-1 city has a player-2 city at its
    // 180°-rotated coord.
    const byOwner = new Map<number, Set<string>>();
    for (const c of board.cities) {
      const set = byOwner.get(c.owner) ?? new Set();
      set.add(`${c.cell.x},${c.cell.y}`);
      byOwner.set(c.owner, set);
    }
    const p1 = byOwner.get(1)!;
    const p2 = byOwner.get(2)!;
    for (const key of p1) {
      const [x, y] = key.split(',').map(Number);
      const { x: rx, y: ry } = rotatedCoord(x, y, board.width, board.height);
      expect(p2.has(`${rx},${ry}`)).toBe(true);
    }
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t03`

**Expected**: all three tests pass for any seed.

---

### Q-T04 — All cities connected by land (US1 AC-3, FR-007)

**What it proves**: every city can reach every other city over land
cells. Validated by BFS from each city.

```ts
import { generateBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32 } from '@europa/engine';
import type { Board, Cell } from '@europa/engine';

function bfsReachable(board: Board, start: { x: number; y: number }): Set<string> {
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const queue: Array<{ x: number; y: number }> = [start];
  while (queue.length > 0) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || nx >= board.width || ny < 0 || ny >= board.height) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const cell: Cell = board.cells[ny * board.width + nx];
      if (cell.terrain !== 'land') continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return visited;
}

describe('quickstart — city connectivity (US1 AC-3)', () => {
  it('all 2-player cities reach each other over land (100 trials)', () => {
    for (let trial = 0; trial < 100; trial++) {
      const seed = (trial * 0x9E3779B1) >>> 0;
      const rng = sfc32(seed);
      const { board } = generateBoard({
        boardSize: 32, playerCount: 2, seed, rng,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      const reachable = bfsReachable(board, board.cities[0]!.cell);
      for (let i = 1; i < board.cities.length; i++) {
        const c = board.cities[i]!.cell;
        expect(reachable.has(`${c.x},${c.y}`)).toBe(true);
      }
    }
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t04`

**Expected**: passes. The threshold-flood and band-based city placement
together make connectivity the common case; only pathological
`waterRatio` settings would break it, and the retry loop catches those.

---

### Q-T05 — Water coverage within configured range (US3 AC-1)

**What it proves**: actual water ratio is within ±10% of the configured
`waterRatio`, across many seeds.

```ts
import { generateBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32 } from '@europa/engine';

describe('quickstart — water coverage (US3 AC-1, SC-004)', () => {
  it('1000 trials: water ratio within ±10% of target (default 10%)', () => {
    const target = DEFAULT_GENERATION_SETTINGS.waterRatio;
    const tolerance = target * 0.10; // ±10% relative
    const min = target - tolerance;
    const max = target + tolerance;

    for (let trial = 0; trial < 1000; trial++) {
      const seed = (trial * 0x9E3779B1) >>> 0;
      const rng = sfc32(seed);
      const { board } = generateBoard({
        boardSize: 32, playerCount: 2, seed, rng,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      const waterCount = board.cells.filter((c) => c.terrain === 'water').length;
      const actual = waterCount / board.cells.length;
      expect(actual).toBeGreaterThanOrEqual(min);
      expect(actual).toBeLessThanOrEqual(max);
    }
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t05`

**Expected**: passes. The threshold-flood algorithm produces a tight
distribution around the target ratio.

---

### Q-T06 — Elevation variance above the floor (US3 AC-2)

**What it proves**: no map is fully flat. Variance is above a small
floor, indicating meaningful hills and valleys.

```ts
import { generateBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32 } from '@europa/engine';

describe('quickstart — elevation variance (US3 AC-2, SC-004)', () => {
  it('1000 trials: elevation variance > 100 (no flat maps)', () => {
    for (let trial = 0; trial < 1000; trial++) {
      const seed = (trial * 0x9E3779B1) >>> 0;
      const rng = sfc32(seed);
      const { board } = generateBoard({
        boardSize: 32, playerCount: 2, seed, rng,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      const elevs = board.cells.map((c) => c.elevation);
      const mean = elevs.reduce((a, b) => a + b, 0) / elevs.length;
      const variance =
        elevs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / elevs.length;
      expect(variance).toBeGreaterThan(100);
    }
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t06`

**Expected**: passes. fBm noise with 4 octaves and persistence 0.5
produces variance in the thousands; the floor of 100 is conservative.

---

### Q-T07 — Generation completes in under 1 second (SC-003)

**What it proves**: the default 32×32 / 2-player map generates in
under 1 second including validation and up to 5 regen retries.

```ts
import { generateBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32 } from '@europa/engine';

describe('quickstart — performance (SC-003)', () => {
  it('default 32×32 / 2p map generates in under 1 second', () => {
    const samples: number[] = [];
    for (let trial = 0; trial < 100; trial++) {
      const seed = (trial * 0x9E3779B1) >>> 0;
      const rng = sfc32(seed);
      const start = performance.now();
      generateBoard({
        boardSize: 32, playerCount: 2, seed, rng,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      samples.push(performance.now() - start);
    }
    // Use 99th percentile (not max) so a single OS hiccup doesn't
    // fail the test. Vitest's CI runners vary widely.
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    expect(p99).toBeLessThan(1000);
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t07`

**Expected**: passes with comfortable margin (typical 32×32 / 2p
generation is < 50ms on commodity hardware).

---

### Q-T08 — Board satisfies `assertBoardMatchesConfig` (conformance)

**What it proves**: the engine's `assertBoardMatchesConfig` accepts
every generated Board. This is the conformance gate from the engine ↔
terrain contract.

```ts
import { generateBoard, DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { sfc32, assertBoardMatchesConfig } from '@europa/engine';
import type { MatchConfig } from '@europa/engine';

describe('quickstart — engine conformance', () => {
  it('1000 generated Boards all pass assertBoardMatchesConfig', () => {
    for (let trial = 0; trial < 1000; trial++) {
      const seed = (trial * 0x9E3779B1) >>> 0;
      const rng = sfc32(seed);
      const { board } = generateBoard({
        boardSize: 32, playerCount: 2, seed, rng,
        settings: DEFAULT_GENERATION_SETTINGS,
      });
      const config: MatchConfig = {
        boardSize: 32,
        playerCount: 2,
        tickIntervalMs: 250,
        seed,
        visibilityRadius: 2,
      };
      // Throws on failure; the expect never fires.
      expect(() => assertBoardMatchesConfig(board, config)).not.toThrow();
    }
  });
});
```

**Run**: `pnpm --filter @europa/terrain test -- quickstart/q-t08`

**Expected**: passes. The generator's internal validation is a strict
superset of the engine's pre-conditions (square, sized, city-on-land),
so conformance is by construction.

---

## 3. Manual smoke (5-minute check)

After `pnpm install`, the implementer can do a manual sanity pass:

```bash
# Build the terrain package
pnpm --filter @europa/terrain build

# Open a Node REPL with the engine + terrain loaded
node --input-type=module -e "
  import('./packages/terrain/dist/index.js').then(async (m) => {
    const eng = await import('./packages/engine/dist/index.js');
    const seed = 1;
    const rng = eng.sfc32(seed);
    const { board, effectiveSeed } = m.generateBoard({
      boardSize: 32,
      playerCount: 2,
      seed,
      rng,
      settings: m.DEFAULT_GENERATION_SETTINGS,
    });
    const waterCount = board.cells.filter(c => c.terrain === 'water').length;
    console.log('hash:', m.hashBoard(board));
    console.log('effectiveSeed:', effectiveSeed);
    console.log('board:', board.width, 'x', board.height);
    console.log('water cells:', waterCount, '(' + (waterCount / board.cells.length * 100).toFixed(1) + '%)');
    console.log('cities:', board.cities.length);
    console.log('elev range:', Math.min(...board.cells.map(c => c.elevation)),
                               '..', Math.max(...board.cells.map(c => c.elevation)));
  });
"
```

**Expected output** (numbers will vary by seed):

```
hash: <16-char hex>
effectiveSeed: 1
board: 32 x 32
water cells: 102 (10.0%)
cities: 2
elev range: 0 .. 255
```

If this prints, the terrain package is wired up correctly end-to-end.

---

## 4. Acceptance criteria mapping

| Spec AC | Covered by |
|---------|------------|
| US1 AC-1 (180° rotation symmetry) | Q-T03 |
| US1 AC-2 (equal city counts in symmetric positions) | Q-T03 (cities) + Q-T08 |
| US1 AC-3 (all cities connected) | Q-T04 |
| US2 AC-1 (byte-identical re-runs) | Q-T01 (1000 trials) |
| US2 AC-2 (different seeds differ) | Q-T02 |
| US3 AC-1 (water coverage 5–15%) | Q-T05 |
| US3 AC-2 (no flat boards) | Q-T06 |
| FR-001 (square, sized, integer elev) | Q-T08 (engine asserts) + unit/cells |
| FR-002 (fractal/fBm algorithm) | unit/noise.test.ts + Q-T06 |
| FR-003 (contiguous water pools) | unit/water.test.ts + Q-T05 |
| FR-004 (point symmetry) | Q-T03 (all 3 layers) |
| FR-005 (fair city placement) | Q-T03 (symmetric) + Q-T04 (connected) + unit/cities |
| FR-006 (determinism) | Q-T01 + Q-T02 |
| FR-007 (validation + retry) | determinism.test.ts (1000 trials, no `GenerationError` thrown) |
| FR-008 (configurable with clamping) | unit/validate.test.ts + integration/clamp.test.ts |
| FR-009 (emit effective seed) | Q-T01 (asserts effectiveSeed) + unit/generate.test.ts |
| SC-001 (byte-identical 100/100) | Q-T01 (1000 trials, stronger than spec) |
| SC-002 (100% valid maps) | determinism.test.ts + balance.test.ts (1000 trials, all valid) |
| SC-003 (<1s default) | Q-T07 (p99 < 1000ms) |
| SC-004 (statistical suite 100 seeds) | Q-T05, Q-T06 (1000 trials, stronger) |

---

## 5. What this quickstart deliberately does NOT cover

These are explicitly downstream concerns, handled in their own feature
plans:

- **Engine tick consumption** — feature 001 quickstart covers the
  engine reading a `Board`. The terrain quickstart stops at "the Board
  passes `assertBoardMatchesConfig`" (Q-T08).
- **Fog filtering** — feature 002 quickstart covers per-player
  visibility. Terrain produces full data; visibility is a consumer
  concern.
- **Networking round-trip** — feature 004 quickstart will serialize a
  Board over the wire. The Board shape is already defined by the
  engine's `serializeWorld`.
- **Rendering** — feature 005 quickstart will render a Board. The
  generator is data-only.
- **Lobby / matchmaking** — feature 006 quickstart will exercise the
  full create → tick → terminal flow, including the call to
  `generateBoard`.

The terrain quickstart stops at "given a seed and settings, produce
a Board that satisfies all invariants and passes the engine's
conformance check" — the minimum primitive the engine needs to start
a match.
