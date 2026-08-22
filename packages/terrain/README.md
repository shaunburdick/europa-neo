# `@europa/terrain`

Europa Neo procedural terrain generation — deterministic, point-symmetric,
integer-only map generator producing engine-ready `Board` values for
feature 001 (the core game engine).

The package is **library-only** (`packages/terrain`), depends on no runtime
dependencies outside `@europa/engine` *types*, and ships a single public
function (`generateBoard`) plus a set of pure helpers exposed for testing.

> **Determinism is non-negotiable** (constitution Principle II). The
> generator is pure: same `(req, rng-state)` → byte-identical `Board`.
> Verified at 10,000-trial scale by `tests/integration/sc-001-determinism.test.ts`
> (10× the SC-001 spec).

---

## Install

From the monorepo root:

```bash
pnpm install
```

This builds the engine package and links the terrain package via
`workspace:*`. Terrain depends on the engine for the `Board`, `Cell`,
`CityPlacement`, `Coord`, `PlayerId`, and `MatchConfig` types and for
the `Rng` (sfc32) PRNG factory — terrain **consumes** the engine's
PRNG instance, never constructs its own.

## Build

```bash
pnpm --filter @europa/terrain build
```

Produces `dist/index.js` (ESM) and `dist/index.d.ts` (types) via `tsup`.

## Test

```bash
pnpm --filter @europa/terrain test
```

Runs the full Vitest suite (223 tests at last count). Coverage thresholds
are 80% on every metric (constitution Principle III merge gate):

```bash
pnpm --filter @europa/terrain test --coverage
```

## Lint / Format / Typecheck

```bash
pnpm --filter @europa/terrain lint          # biome check
pnpm --filter @europa/terrain format:check  # biome format --no-write
pnpm --filter @europa/terrain typecheck     # tsc --noEmit
```

---

## Quick usage

Mirror of `quickstart.md` §3 smoke REPL:

```ts
import {
  generateBoard,
  hashBoard,
  DEFAULT_GENERATION_SETTINGS,
} from '@europa/terrain';
import { createRng } from '@europa/engine';

const seed = 1;
const rng = createRng(seed);

const { board, effectiveSeed, effectiveSettings } = generateBoard({
  boardSize: 32,
  playerCount: 2,
  seed,
  rng,
  settings: DEFAULT_GENERATION_SETTINGS,
});

console.log('hash:', hashBoard(board));
console.log('effectiveSeed:', effectiveSeed);
console.log('effectiveSettings:', effectiveSettings);
console.log('board:', board.width, 'x', board.height);
console.log('cities:', board.cities.length);
```

Expected output (numbers vary by seed):

```
hash: <16-char hex>
effectiveSeed: 1
effectiveSettings: { waterRatio: 0.1, roughness: 0.5, octaves: 4, ... }
board: 32 x 32
cities: 2
```

---

## Public API surface

The full type surface is documented in `dist/index.d.ts` after build;
the source-of-truth contract lives at
`.specify/features/003-procedural-terrain-generation/contracts/terrain-types.ts`.

### Primary entry point

| Symbol | Purpose |
|--------|---------|
| `generateBoard(req)` | Orchestrator: produces a `Board` for a match. |
| `validateBoard(board, settings, playerCount)` | Test/006-side helper; runs all 15 invariants. |
| `hashBoard(board)` | 16-char hex hash for byte-identity comparison. |
| `assertBoardMatchesConfig(board, config)` | Structural conformance check (engine ↔ terrain gate). |
| `DEFAULT_GENERATION_SETTINGS` | Default `GenerationSettings`. |
| `TERRAIN_CONSTANTS` | Tunable numeric rules (elevation range, board size range). |
| `TERRAIN_API_VERSION` | `'0.1.0'` — pin-check at consumer startup. |

### US3 clamping helpers (FR-008)

| Symbol | Range |
|--------|-------|
| `clampSettings(s)` | Whole-object clamp (called inside `generateBoard`). |
| `clampWaterRatio(v)` | `[0.02, 0.25]` |
| `clampRoughness(v)` | `[0.1, 0.9]` |
| `clampOctaves(v)` | integer `[1, 6]` |
| `clampCitiesPerPlayer(v)` | integer `[1, 4]` |
| `clampMinCityWaterDistance(v)` | integer `[1, 6]` |
| `clampMinCityCityDistance(v)` | integer `[2, 10]` |
| `clampMaxRegenAttempts(v)` | integer `[1, 10]` |
| `WATER_RATIO_MIN` / `WATER_RATIO_MAX` | float range bounds |
| (and similar `*_MIN` / `*_MAX` exports for every clamped field) |

### Per-phase helpers (exposed for testability)

| Symbol | Phase |
|--------|-------|
| `valueNoise(x, y, seed)` | FR-002 / US1 |
| `fbm(x, y, seed, octaves, persistence)` | FR-002 / US1 |
| `generateElevationMap(rng, w, h, settings)` | US1 |
| `extractWater(elev, w, h, waterRatio)` | FR-003 / US1 |
| `buildBoard(elev, water, w, h)` | US1 |
| `getPlayerBand(pid, playerCount, w, h)` | US2 |
| `placeCitiesInBand(...)` | FR-005 / US2 |
| `enforceCitySymmetry(...)` | FR-004 / US2 |
| `rotate180(x, y, w, h)` | FR-004 |
| `rotate180Index(i, w, h)` | FR-004 |
| `resolveSettings(partial)` | merge defaults |
| `validateSettings(s)` | shape validation |
| `deriveSubstream(parent)` | PRNG substream helper |
| `mixSeed(seed, attempt)` | retry-seed mixer |
| `GenerationError` | thrown on retry exhaustion or invalid request |

---

## Determinism

The package is the canonical exemplar of constitution Principle II
("Server-Authoritative Deterministic Simulation"). Several layers enforce
this:

1. **PRNG contract**: terrain consumes the engine's live sfc32 instance
   passed via `TerrainGenerationRequest.rng`. It never constructs its own.
   The engine retains the same instance after `generateBoard` returns,
   so the engine's tick stream picks up where the terrain left off.

2. **Integer-only arithmetic**: elevation stored as `Uint8Array`; noise
   values computed via integer hash + integer bilinear interpolation on
   integer lattice values. No `Math.sin` / `Math.cos` in the hot path.

3. **Symmetry by construction**: 180° point symmetry (FR-004) is enforced
   in `_enforcePointSymmetry` by copying one half onto the other — exact,
   no averaging, no seam drift. City symmetry (INV-9) is built by
   construction in `enforceCitySymmetry`.

4. **No wall-clock**: no `Date.now()` or `performance.now()` in `src/`
   (except as measurement instruments in tests, never in algorithm code).
   No `Math.random()`.

5. **Clamping is deterministic**: `clampSettings` is a pure function of
   the input. Same input → same output, no randomness.

6. **No I/O**: the generator is pure; no disk, no network, no native deps.

Verified at 10,000-trial scale by `tests/integration/sc-001-determinism.test.ts`.
The `hashBoard` function is the deterministic comparison tool — two Boards
with identical `(req, rng-state)` produce byte-identical hashes.

---

## What this package deliberately does NOT do

- **Engine tick consumption** — feature 001 owns `createWorld` and the
  tick loop. Terrain hands off the `Board` via `generateBoard`'s return
  value; the engine consumes it.
- **Fog-of-war filtering** — feature 002 owns per-player visibility.
- **Networking / serialization** — feature 004 owns wire format.
- **Rendering** — feature 005 owns the console UI.
- **Lobby / matchmaking** — feature 006 owns match creation.
- **Map editor** — not in v1 scope.

---

## Project layout

```
packages/terrain/
├── src/
│   ├── board.ts            # buildBoard, assertBoardMatchesConfig
│   ├── city-band.ts        # per-player spawn band geometry
│   ├── city-count.ts       # resolveCityCount
│   ├── city-placement.ts   # placeCitiesInBand
│   ├── city-symmetry.ts    # enforceCitySymmetry
│   ├── clamp.ts            # clampSettings + per-field helpers (US3)
│   ├── constants.ts        # TERRAIN_CONSTANTS, default re-exports
│   ├── contracts/          # local copies of spec contracts
│   ├── elevation.ts        # generateElevationMap, _enforcePointSymmetry
│   ├── errors.ts           # GenerationError
│   ├── fbm.ts              # fbm
│   ├── generate.ts         # orchestrator: generateBoard, hashBoard
│   ├── index.ts            # public barrel
│   ├── rng-adapter.ts      # deriveSubstream, mixSeed
│   ├── settings.ts         # resolveSettings, validateSettings
│   ├── symmetry.ts         # rotate180, rotate180Index
│   ├── types.ts            # public type re-exports
│   ├── validate.ts         # validateBoard (15 invariants)
│   ├── value-noise.ts      # valueNoise (lattice + bilinear)
│   └── water.ts            # extractWater, _extractWater
└── tests/
    ├── unit/               # per-module unit tests
    ├── integration/        # full pipeline tests
    ├── fixtures/           # board + seed helpers
    └── quickstart/         # Q-T01..Q-T08 from quickstart.md
```

---

## License

Open source; license TBD by the project owner.
