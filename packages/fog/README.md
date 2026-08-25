# `@europa/fog`

Europa Neo fog of war & visibility — server-authoritative per-player
horizon filter. Sits between `@europa/engine` and the network layer:
it consumes a `World` snapshot (plus the tick's events) and emits the
fog-filtered payloads (`VisibleSet`, `PlayerView`) that feature 004
(networking) serializes per player.

The visibility rule is deliberately simple (spec Assumptions): a cell
is visible iff it is within **Chebyshev range `r`** of any friendly
troop stack — no line-of-sight, no elevation blockers, water does not
block vision. Troop stacks are the only vision sources; cities alone
project nothing. There is **no memory**: every view is recomputed from
current troop positions; previously seen state is never cached or
re-sent (FR-004).

> **Determinism is non-negotiable** (constitution Principle II). Every
> function is pure: same `(world, player, options)` → byte-identical
> output. Verified at 100-trial hash scale (`tests/determinism.test.ts`)
> and at 500-tick protocol level with zero leakage
> (`tests/redaction.test.ts`).

---

## Install

From the monorepo root:

```bash
pnpm install
```

Fog depends on `@europa/engine` (`workspace:*`) for the `World`,
`CellView`, `Coord`, `PlayerId`, `TickEvents`, and `MatchConfig`
types and for the read helpers (`cellsInRange`, `getCell`,
`forEachCell`). The engine never imports fog — fog is a pure
downstream filter.

## Build

```bash
pnpm --filter @europa/fog build
```

Produces `dist/index.js` (ESM) and `dist/index.d.ts` (types) via `tsup`.

## Test

```bash
pnpm --filter @europa/fog test
```

Runs the full Vitest suite (107 tests at last count, ~1 s). Coverage
thresholds are 80% on every metric (constitution Principle III merge
gate):

```bash
pnpm --filter @europa/fog coverage
```

## Lint / Format / Typecheck

```bash
pnpm --filter @europa/fog lint          # biome check
pnpm --filter @europa/fog format:check  # biome format --no-write
pnpm --filter @europa/fog typecheck     # tsc --noEmit
```

---

## Quick usage

Mirror of `quickstart.md` §3 smoke REPL:

```ts
import { tick } from '@europa/engine';
import {
  computePlayerView,
  computeVisibleSet,
  isVisible,
  visibleCellAt,
} from '@europa/fog';

// Advance the match one tick.
const result = tick(world);

// Lightweight set for server-side logic:
const visible = computeVisibleSet(result.world, playerId);
console.log(`player ${String(playerId)} sees ${String(visible.visibleCells.length)} cells`);

// Full payload for networking (events come from TickResult):
const view = computePlayerView(result.world, playerId, { events: result.events });

if (isVisible(view, { x: 10, y: 15 })) {
  const cell = visibleCellAt(view, { x: 10, y: 15 });
  console.log(`cell has ${String(cell?.troopCount ?? 0)} troops`);
}

// Spectator session (full board, unfiltered events):
const specView = computePlayerView(result.world, playerId, {
  spectator: true,
  events: result.events,
});
```

---

## Public API surface

The full type surface is documented in `dist/index.d.ts` after build;
the source-of-truth contracts live at
`specs/002-fog-of-war-visibility/contracts/`.

### Runtime functions

| Symbol | Purpose |
|--------|---------|
| `computeVisibleSet(world, player, radius?)` | Union of friendly stacks' Chebyshev disks → `VisibleSet`. Radius defaults to `world.config.visibilityRadius`. |
| `computePlayerView(world, player, options?)` | Full fog-filtered payload: decoded horizon cells + filtered events + config snapshot. `{ spectator: true }` returns every board cell with unfiltered events. `{ events }` supplies the current tick's `TickEvents` (from `tick()`'s `TickResult`). |
| `isVisible(view, coord)` | Membership test over `view.visibleCells`. |
| `visibleCellAt(view, coord)` | The decoded `CellView` for a coord, or `undefined` when redacted. |
| `filterTickEvents(world, visibleCells, events, spectator)` | FR-003 event filter (exposed primarily for tests). |
| `hashPlayerView(view)` | Stable 16-char hex hash used by the determinism suite. |

### Constants & types

| Symbol | Purpose |
|--------|---------|
| `FOG_CONSTANTS` | Tunable numeric rules (mask sentinels, radius fallbacks). |
| `FOG_API_VERSION` | `'0.1.0'` — pin-check at consumer startup. |
| `ENGINE_API_VERSION_REF` | Engine version fog was built against. |
| `FOG_MASK_UNKNOWN` / `FOG_MASK_VISIBLE` | Binary mask sentinels. |
| `createMask` / `markVisible` / `isCellMarked` / `unionMasks` | Binary mask helpers (internal working buffer, exposed for testing). |
| `chebyshevDisk` / `chebyshevDistance` | Chebyshev range primitives. |

### Redaction model (FR-002 / FR-003 / FR-005)

Structural redaction: cells outside the horizon are **absent** from
`PlayerView.visibleCells` entirely — there is no "redacted placeholder"
type. In-horizon cells are fully exposed (terrain, elevation, troop
count/owner, pipes, reserves, city owner), including exact enemy data.
Cell-level events outside the horizon are dropped; player-level events
(eliminations, applied orders, errors) always pass through.

---

## Determinism

1. **Pure functions**: no I/O, no wall-clock reads, no unseeded
   randomness anywhere in `src/`. `performance.now()` appears only as
   a measurement instrument inside one test (Q-F07), never in
   algorithm code.
2. **Row-major iteration**: every scan and emission order is y-outer,
   x-inner — identical inputs produce byte-identical outputs on every
   platform.
3. **Integer-only math**: mask indices, Chebyshev distances, and flat
   keys are plain integers; the view hash uses FNV-1a rounds over
   `Math.imul`.
4. **No-memory by construction**: the fog mask is allocated fresh
   (zero-initialized) on every call — recall is structurally
   impossible (FR-004).

Verified by `tests/determinism.test.ts` (100-trial byte-identical
hashes) and `tests/redaction.test.ts` (500-tick scripted match audited
against an independent oracle: zero leaked cells, zero leaked events).

---

## Conformance

The engine ↔ fog boundary contract
(`packages/fog/src/contracts/engine-to-fog.ts`) is a mirror of feature
001's canonical `engine-to-fog.ts`; the two must stay in lock-step.
Drift is caught by:

- `tests/conformance.test.ts` — byte-identity against the spec copy,
  semantic identity of the verbatim-mirror section against feature
  001's canonical file, compile-time mutual assignability of
  `VisibleSet` / `PlayerView`, and signature conformance of
  `computeVisibleSet`.
- `tests/contracts-drift.test.ts` — semantic comparison of all four
  local contract copies against `specs/002-fog-of-war-visibility/contracts/`.

---

## Self-hosting

Zero external service dependencies: fog is a pure library over
`@europa/engine` types and helpers. No database, no network calls, no
native modules. It runs anywhere Node ≥ 22 runs, which keeps any
Europa Neo deployment self-hostable by default.

---

## Project layout

```
packages/fog/
├── src/
│   ├── constants.ts        # FOG_CONSTANTS (single tunables location)
│   ├── contracts/          # local copies of spec contracts (drift-tested)
│   ├── eventsFilter.ts     # filterTickEvents (FR-003)
│   ├── index.ts            # public barrel
│   ├── mask.ts             # binary FogMask helpers (no recall state)
│   ├── playerView.ts       # computePlayerView (US1 redaction + US3 spectator)
│   ├── range.ts            # chebyshevDisk, chebyshevDistance
│   ├── types.ts            # public type re-exports
│   ├── utils.ts            # isVisible, visibleCellAt, hashPlayerView
│   └── visibleSet.ts       # computeVisibleSet (US1 horizon)
└── tests/
    ├── acceptance/         # US1/US2/US3 Given/When/Then scenarios
    ├── fixtures/           # world/view/seed builders
    ├── quickstart/         # Q-F01..Q-F08 from quickstart.md
    ├── unit/               # per-module unit tests
    ├── conformance.test.ts # engine ↔ fog boundary enforcement
    ├── contracts-drift.test.ts
    ├── determinism.test.ts # SC-001 micro-check (100 trials)
    └── redaction.test.ts   # SC-001 protocol level (500 ticks)
```

---

## License

Open source; license TBD by the project owner.
