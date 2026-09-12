# Implementation Plan: Developer Debugging Tools (Feature 022)

## 1. Technical Context

**Goal**: Deliver a match capture/replay CLI harness and an in-game seed display so developers can reproduce, diagnose, and regression-test engine behavior from live matches.

**Scope**: Three CLI tools (`replay:capture`, `replay:run`, `replay:update`) plus a seed display in the console sidebar.

**Key dependencies**:
- `@europa/engine` — `createWorld`, `applyCommand`, `tick`, `hashWorld`, `createRng`, `ENGINE_API_VERSION`, types
- `@europa/terrain` — `generateBoard` (regenerates the board from seed + settings for replay)
- `@europa/console` — sidebar component for seed display

**Constitution alignment**:
- Principle I (Type Safety): TypeScript strict mode, no `any`, no suppressions
- Principle II (Deterministic Simulation): replay must produce byte-identical results — the engine's own functions are used, no alternative simulation path
- Principle III (Tested Game Logic): ≥80% coverage on replay logic
- Principle IV (Specs as Documentation): spec is the source of truth; plan documents architecture decisions
- Principle V (Simplicity Over Cleverness): replay tools are pure functions + a thin CLI wrapper; no complex framework

## 2. Architecture Decisions

### AD-1: Replay CLI lives in `packages/engine/scripts/`

**Decision**: The three replay CLI scripts (`capture.ts`, `run.ts`, `update.ts`) live in `packages/engine/scripts/`, run via `tsx` (catalog dependency, already used by `@europa/console`).

**Rationale**:
- The replay tools are engine-centric — they use `createWorld`, `applyCommand`, `tick`, `hashWorld`, `createRng` from `@europa/engine` and `generateBoard` from `@europa/terrain`.
- The engine package already has no scripts directory — this is additive.
- `tsx` is a catalog dependency (`^4.23.12`) already proven in the console package.
- The root `package.json` gets three new scripts: `replay:capture`, `replay:run`, `replay:update`.
- The engine's `package.json` gets `@europa/terrain` as a devDependency (only the scripts import it; the built dist does not).

**Alternative rejected**: Placing in a new `packages/replay/` package — over-engineered for three scripts; adds workspace complexity.

### AD-2: Capture is a headless match runner, not a server integration

**Decision**: `replay:capture` runs a headless match (creates world, applies scripted orders, writes fixture). It does NOT attach to a live networking server.

**Rationale**:
- All spec acceptance scenarios describe headless scenarios ("running a headless match with seed + scripted orders").
- Server-integrated capture would require changes to `@europa/networking`'s `ServerConfig`, `MatchChannel`, and tick pipeline — invasive for a v1 debugging tool.
- The headless approach satisfies every FR (FR-001 through FR-004) and AC (FR-001 AC through FR-004 AC).
- Live match capture is a natural future extension (spec's "Future Extensions" section).

**Input format**: The capture script accepts `--seed`, `--settings` (JSON file or inline), and `--orders` (JSON file with `[{tick, playerId, order}]`). This makes it scriptable and CI-friendly.

### AD-3: Fixture stores terrain settings for board regeneration

**Decision**: The fixture format includes a `terrainSettings` field (`GenerationSettings`) in addition to the `MatchConfig`.

**Rationale**:
- Replay requires regenerating the board from seed + settings via `generateBoard`.
- `generateBoard` needs `GenerationSettings` (waterRatio, roughness, octaves, citiesPerPlayer, symmetryStrategy, minCityWaterDistance, terrainSmoothing).
- The spec's fixture format lists `MatchConfig` but not terrain settings — this is an additive extension that doesn't break the spec (the `version` field enables schema evolution).
- Without terrain settings, replay would assume defaults, which breaks determinism for non-default maps.

### AD-4: Seed display reads from `PlayerView.config.seed` in a collapsible Debug section

**Decision**: A new collapsible "Debug" section appears in the sidebar below Status, starting collapsed. It reads the seed from `state.latestView?.config.seed` and renders "Seed: {value}" with appropriate aria-labels. The section creates a home for future debugging tools.

**Rationale**:
- No new plumbing needed — the seed flows through the existing `PlayerView` → `latestView` pipeline.
- `PlayerView.config` is `Readonly<MatchConfig>` (fog contract `engine-to-fog.ts:106`), which includes `seed`.
- The sidebar already receives `state: ConsoleState` — just read `state.latestView?.config.seed`.
- Collapsed by default avoids cluttering the HUD for non-debug use cases.
- Future debug tools (state inspector, tick diffing, etc.) slot naturally into this section.

### AD-5: Fixture format version 1

**Decision**: The fixture format starts at version 1 with the following top-level fields:

```json
{
  "version": 1,
  "seed": 12345,
  "settings": { "boardSize": 32, "playerCount": 2, "tickIntervalMs": 250, "visibilityRadius": 6 },
  "terrainSettings": { "waterRatio": 0.1, "roughness": 0.5, "octaves": 4, "citiesPerPlayer": 1, "symmetryStrategy": "point", "minCityWaterDistance": 3, "terrainSmoothing": 4 },
  "playerCount": 2,
  "orders": [{ "tick": 1, "playerId": 1, "order": { "kind": "setPipe", ... } }],
  "terminalTick": 500,
  "terminalResult": { "kind": "win", "winner": 1, "tick": 500, "reason": "last_standing" },
  "finalStateHash": "a1b2c3d4",
  "engineVersion": "0.1.0"
}
```

**Rationale**: Human-readable JSON (NFR-002), `JSON.parse`-safe (FR-013), versioned for forward compatibility (NFR-005).

## 3. Data Model

### Fixture (JSON on disk)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `number` | Yes | Fixture format version (starting at 1) |
| `seed` | `number` | Yes | PRNG seed (uint32) |
| `settings` | `MatchConfig` | Yes | Engine config (boardSize, playerCount, tickIntervalMs, seed, visibilityRadius) |
| `terrainSettings` | `GenerationSettings` | Yes | Terrain generation settings for board reconstruction |
| `playerCount` | `number` | Yes | Redundant with `settings.playerCount` but explicit for quick inspection |
| `orders` | `OrderRecord[]` | Yes | Applied orders in tick-ascending, playerId-ascending, kind-alphabetical order |
| `terminalTick` | `number` | Yes | Tick at which the match ended |
| `terminalResult` | `MatchResult \| null` | Yes | Terminal match result (win/draw) or null if match didn't terminate |
| `finalStateHash` | `string` | Yes | 8-char hex FNV-1a hash of the final world state |
| `engineVersion` | `string` | Yes | `ENGINE_API_VERSION` at capture time |

### OrderRecord

| Field | Type | Description |
|-------|------|-------------|
| `tick` | `number` | Tick at which this order was applied |
| `playerId` | `PlayerId` | Player who issued the order (1–4) |
| `order` | `Order` | The full engine Order object |

## 4. Implementation Approach

### 4.1 Replay Core (`packages/engine/src/replay/`)

A small library module (`packages/engine/src/replay/index.ts`) exporting pure functions:

- **`replayMatch(fixture, options?)`**: Takes a fixture object, regenerates the board via `generateBoard`, creates the world, replays orders tick-by-tick, and returns `{ finalWorld, hash, tickCount }`. Pure function — no I/O.

- **`validateFixture(data: unknown)`**: Type-narrowing validator that checks all required fields exist with correct types. Returns `Fixture` or throws with a descriptive error.

This module lives in `src/replay/` so it's part of the engine's public surface (re-exported via barrel) and testable in-process.

### 4.2 CLI Scripts (`packages/engine/scripts/`)

Three scripts, each ~50–80 lines, using `tsx` runner:

1. **`capture.ts`** — Reads `--seed`, `--settings` (JSON), `--orders` (JSON), `--out` (path). Creates board + world, replays orders, computes hash, writes fixture JSON.

2. **`run.ts`** — Reads fixture path from argv. Validates fixture, replays, compares hash. Exits 0/1/2 per FR-006/FR-007.

3. **`update.ts`** — Reads fixture path from argv. Validates, replays, overwrites `finalStateHash`. Prints old → new.

### 4.3 Root Scripts (`package.json`)

```
"replay:capture": "tsx packages/engine/scripts/capture.ts",
"replay:run": "tsx packages/engine/scripts/run.ts",
"replay:update": "tsx packages/engine/scripts/update.ts"
```

### 4.4 Debug Section & Seed Display (`packages/console/src/ui/sidebar.tsx`)

Add a collapsible "Debug" section below the existing Status section in the sidebar:
- Collapsed by default; header click toggles expansion (FR-018)
- Inside: reads `state.latestView?.config.seed`, renders `"Seed: {value}"` (FR-015)
- `aria-label="Map seed: {value}"` for screen reader accessibility (FR-016)
- Visible in both player and spectator modes — no `interactive` guard needed (FR-017)
- Uses existing `europa-hud__item` class for consistency

### 4.5 Dependencies

- `packages/engine/package.json`: add `@europa/terrain: "workspace:*"` as devDependency (scripts only)
- `packages/engine/package.json`: add `tsx` script pattern (already in catalog)
- No new external dependencies — all imports are workspace packages

## 5. Key Technical Details

### Board regeneration for replay

```typescript
import { createRng } from '@europa/engine';
import { generateBoard } from '@europa/terrain';

const rng = createRng(fixture.seed);
const { board } = generateBoard({
    boardSize: fixture.settings.boardSize,
    playerCount: fixture.settings.playerCount,
    seed: fixture.seed,
    rng,
    settings: fixture.terrainSettings,
});
```

### Order replay loop

```typescript
import { createWorld, applyCommand, tick, hashWorld, isTerminal } from '@europa/engine';

let world = createWorld(config, board);
const ordersByTick = groupOrdersByTick(fixture.orders); // Map<number, OrderRecord[]>

for (let t = 0; t < fixture.terminalTick; t++) {
    const orders = ordersByTick.get(t) ?? [];
    for (const { order } of orders) {
        const { world: w } = applyCommand(world, order);
        world = w;
    }
    const result = tick(world);
    world = result.world;
}

const hash = hashWorld(world);
```

### Hash comparison

```typescript
const actual = hashWorld(replayedWorld);
if (actual === fixture.finalStateHash) {
    console.log(`PASS ${fixture.terminalTick} ticks`);
    process.exit(0);
} else {
    console.log(`FAIL expected ${fixture.finalStateHash} got ${actual}`);
    process.exit(1);
}
```

### Error exit codes

- Exit 0: PASS (hash matches)
- Exit 1: FAIL (hash mismatch)
- Exit 2: Input error (missing file, invalid JSON, missing fields)

## 6. Testing Strategy

- **Unit tests** for `replayMatch` and `validateFixture` (packages/engine/tests/replay/)
- **Fixture round-trip test**: create a fixture programmatically → replay → verify hash matches
- **Edge case tests**: empty orders, corrupted fixture, missing fields, engine version mismatch warning
- **Seed display component test**: render sidebar with seed in ConsoleState, assert DOM content + aria-label
- **CLI integration tests**: spawn each script via `child_process`, verify exit codes and stdout output

## 7. Open Questions / Clarifications Needed

1. **Fixture `terrainSettings` field**: The spec lists `MatchConfig` as the settings but doesn't mention terrain settings. We need them for board regeneration. Proposed: add `terrainSettings` as an additive field (version 1 format).

2. **Capture input format**: The spec says "records a live match" but acceptance scenarios are headless. Proposed: capture accepts `--seed`, `--settings`, `--orders` for headless mode; live server integration deferred.

3. **Engine version warning**: FR-011 edge case says "replay tools print a warning if the current ENGINE_API_VERSION differs, but still run the replay." Proposed: print to stderr, don't affect exit code.

---

*Plan created: 2026-09-06*
*Feature branch: `issue-81-match-replay`*
