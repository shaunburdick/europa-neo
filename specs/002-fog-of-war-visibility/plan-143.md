# Implementation Plan: Issue #143 — Event Filtering Fix

**Branch**: `issue-143-filter-events` | **Date**: 2026-09-12 | **Spec**: [`specs/002-fog-of-war-visibility/spec.md`](./spec.md) v1.9

**Input**: GitHub Issue #143 — `filterTickEvents()` only filters `combat` and `captures`; `appliedOrders` and `errors` pass through unfiltered. Additionally, `broadcast.ts:257` calls `computePlayerView` WITHOUT passing events — so the filter is dead code in production.

---

## Problem Statement

Two bugs exist in the event filtering pipeline:

1. **Data flow gap (dead code)**: `server.ts:491` calls `channel.engineSession.advance()` which returns `{ world, events }`, but the return value is discarded. `buildTickBroadcast` at `broadcast.ts:257` calls `deps.fog.computePlayerView({ world, playerId, spectator })` WITHOUT passing events. So `computePlayerView` defaults to `emptyTickEvents()` — the filter is dead code in production. Every player receives empty events every tick.

2. **Incomplete filtering**: `filterTickEvents()` in `eventsFilter.ts:71-108` only filters `combat` and `captures` (cell-level events). `appliedOrders` and `errors` pass through unfiltered. Per FR-012 (v1.9), `appliedOrders` records should be included only if the order's player matches the viewer AND all referenced cells are visible; `errors` records should be included only if all referenced cells are visible OR the `ValidationError` variant contains no cell coordinates.

---

## Current Architecture (Data Flow)

```
server.ts:491  channel.engineSession.advance()  →  DISCARDED return value!
                    ↓ (only world is used)
server.ts:499  buildTickBroadcast(channel, { fog: deps.fog })
                    ↓
broadcast.ts:257  deps.fog.computePlayerView({ world, playerId, spectator })
                    ↓ (no events passed → defaults to emptyTickEvents())
fog/playerView.ts  filterTickEvents(world, visibleCells, emptyTickEvents(), false)
                    ↓ (filter runs on empty events → no-op)
fog/eventsFilter.ts  Only filters combat + captures (appliedOrders + errors unfiltered)
```

**The fix**: Thread `TickEvents` from `advance()` through the transport layer into `computePlayerView`, then extend the filter to cover all 5 event categories.

---

## Target Architecture (Data Flow)

```
server.ts:491  const { events } = channel.engineSession.advance()
                    ↓
server.ts:499  buildTickBroadcast(channel, { fog: deps.fog }, nowMs, events)
                    ↓
broadcast.ts:257  deps.fog.computePlayerView({ world, playerId, spectator, events })
                    ↓
fog/playerView.ts  filterTickEvents(world, visibleCells, events, false)
                    ↓
fog/eventsFilter.ts  Filters ALL 5 categories per FR-012 (v1.9)
```

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety | ✅ | All changes are typed; no `any` introduced |
| II. Determinism | ✅ | `filterTickEvents` remains a pure function; new helpers are pure |
| III. Tested Game Logic | ✅ | SC-001 audit extended; new unit tests for appliedOrders/errors filtering |
| IV. Specs as Documentation | ✅ | Spec v1.9 already documents FR-012; plan matches spec |
| V. Simplicity | ✅ | Coordinate extraction helpers are straightforward switch/map patterns |
| VII. Self-Hostable | ✅ | No new dependencies; no external services |

---

## Concrete Changes (File by File)

### 1. `packages/networking/src/contracts/network-api.ts` — FogFactory interface

**Change**: Add optional `events` parameter to `FogFactory.computePlayerView`.

```typescript
// Before:
computePlayerView(args: {
  readonly world: World;
  readonly playerId: PlayerId;
  readonly spectator: boolean;
}): PlayerView;

// After:
computePlayerView(args: {
  readonly world: World;
  readonly playerId: PlayerId;
  readonly spectator: boolean;
  readonly events?: TickEvents;
}): PlayerView;
```

**Rationale**: The `events` parameter is optional (backward-compatible). When omitted, `computePlayerView` defaults to `emptyTickEvents()` (existing behavior). When provided, the filter runs on real events.

### 2. `packages/networking/src/match-channel.ts` — Store last tick events

**Change**: Add a `lastTickEvents` field to `MatchChannel` to store the events from the most recent `advance()` call.

```typescript
// New field:
private _lastTickEvents: TickEvents = emptyTickEvents();

// New getter:
get lastTickEvents(): Readonly<TickEvents> { return this._lastTickEvents; }

// New setter (called from server.ts after advance()):
setLastTickEvents(events: TickEvents): void { this._lastTickEvents = events; }
```

**Rationale**: The `advance()` return value is currently discarded. Storing events on the channel makes them available to `buildTickBroadcast` without changing the `EngineSession` interface.

### 3. `packages/networking/src/server.ts` — Capture and pass events

**Change 1** (line ~491): Capture the `advance()` return value and store events on the channel.

```typescript
// Before:
channel.engineSession.advance();
channel.recordTick();

// After:
const advanceResult = channel.engineSession.advance();
channel.setLastTickEvents(advanceResult.events);
channel.recordTick();
```

**Change 2** (line ~499): Pass events to `buildTickBroadcast`.

```typescript
// Before:
const { broadcast, viewCache } = buildTickBroadcast(channel, { fog: deps.fog }, nowMs);

// After:
const { broadcast, viewCache } = buildTickBroadcast(channel, { fog: deps.fog }, nowMs, advanceResult.events);
```

**Change 3** (line ~526, resync fallback): Pass events when recomputing views for disconnected/skipped seats.

```typescript
// Before:
deps.fog.computePlayerView({
    world: channel.engineSession.world(),
    playerId,
    spectator: false,
});

// After:
deps.fog.computePlayerView({
    world: channel.engineSession.world(),
    playerId,
    spectator: false,
    events: channel.lastTickEvents,
});
```

**Change 4** (line ~1288, reconnect snapshot): Pass events when computing the reconnect snapshot.

```typescript
// Before:
const view = deps.fog.computePlayerView({
    world: channel.engineSession.world(),
    playerId: binding.playerId,
    spectator: false,
});

// After:
const view = deps.fog.computePlayerView({
    world: channel.engineSession.world(),
    playerId: binding.playerId,
    spectator: false,
    events: channel.lastTickEvents,
});
```

**Note**: The `sendJoinAck` (line ~1013) does NOT need events — join happens before any ticks have advanced, so there are no events to pass. The default `emptyTickEvents()` is correct for the initial join snapshot.

### 4. `packages/networking/src/broadcast.ts` — Thread events through

**Change 1** (line ~245): Add `events` parameter to `buildTickBroadcast`.

```typescript
// Before:
export function buildTickBroadcast(channel: MatchChannel, deps: BroadcastDeps, _nowMs?: number): BroadcastResult {

// After:
export function buildTickBroadcast(
    channel: MatchChannel,
    deps: BroadcastDeps,
    _nowMs?: number,
    events?: TickEvents,
): BroadcastResult {
```

**Change 2** (line ~257): Pass events to `computePlayerView`.

```typescript
// Before:
const view = deps.fog.computePlayerView({ world, playerId, spectator });

// After:
const view = deps.fog.computePlayerView({ world, playerId, spectator, events });
```

**Rationale**: The `events` parameter flows from `server.ts` → `buildTickBroadcast` → `computePlayerView`. Optional at each layer for backward compatibility.

### 5. `packages/fog/src/eventsFilter.ts` — Extend filtering to all 5 categories

**Change 1**: Add helper functions to extract cell coordinates from `Order` and `ValidationError`.

```typescript
/**
 * Extract all cell coordinates referenced by an Order. Returns coords
 * from `cell`, `source`, and `target` fields depending on order kind.
 * Used by the event filter to determine horizon visibility.
 *
 * @param order The order to extract coordinates from.
 * @returns Array of Coord references (may be empty for surrender orders).
 */
function orderCoords(order: Order): Coord[] {
    switch (order.kind) {
        case 'setPipe':
        case 'clearPipe':
        case 'setPipesExclusive':
        case 'clearAllPipes':
        case 'setReserves':
            return [order.cell];
        case 'paratroop':
        case 'gun':
            return [order.source, order.target];
        case 'surrender':
            return [];
    }
}

/**
 * Extract all cell coordinates referenced by a ValidationError.
 * Some variants carry cell coordinates (out_of_bounds, water_target,
 * not_owner, no_source_troops, paratroop_range); others carry only
 * player IDs or scalar values (already_surrendered, invalid_percent,
 * unknown_player, unknown_order, invalid_direction, match_terminal).
 *
 * @param reason The validation error to extract coordinates from.
 * @returns Array of Coord references (may be empty for non-cell errors).
 */
function validationErrorCoords(reason: ValidationError): Coord[] {
    switch (reason.kind) {
        case 'out_of_bounds':
        case 'water_target':
        case 'not_owner':
        case 'no_source_troops':
            return [reason.coord];
        case 'paratroop_range':
            return [reason.source, reason.target];
        case 'already_surrendered':
        case 'invalid_percent':
        case 'unknown_player':
        case 'unknown_order':
        case 'invalid_direction':
        case 'match_terminal':
            return [];
    }
}
```

**Change 2**: Add a helper to check if ALL coords in a list are visible.

```typescript
/**
 * Check whether every Coord in the list is in the visible set.
 * Returns true for empty lists (vacuous truth — an order with no cell
 * references, like surrender, is always visible).
 *
 * @param coords   The coordinates to check.
 * @param visible  The visible-set index (Set<number> of flat keys).
 * @param width    Board width for flat-index computation.
 * @returns `true` if all coords are visible (or the list is empty).
 */
function allCoordsVisible(coords: readonly Coord[], visible: Set<number>, width: number): boolean {
    for (const coord of coords) {
        if (!visible.has(coord.y * width + coord.x)) {
            return false;
        }
    }
    return true;
}
```

**Change 3**: Extend `filterTickEvents` to filter `appliedOrders` and `errors`.

```typescript
// Replace the current filter logic:

// Old:
if (events.combat.length === 0 && events.captures.length === 0) {
    return events;
}
const visible = buildVisibleIndex(visibleCells, world.board.width);
const combat = events.combat.filter(...);
const captures = events.captures.filter(...);
if (combat.length === events.combat.length && captures.length === events.captures.length) {
    return events;
}
return {
    combat,
    captures,
    eliminations: events.eliminations,
    appliedOrders: events.appliedOrders,
    errors: events.errors,
};

// New:
// Fast path: no events at all → return input unchanged.
if (
    events.combat.length === 0 &&
    events.captures.length === 0 &&
    events.appliedOrders.length === 0 &&
    events.errors.length === 0
) {
    return events;
}

const visible = buildVisibleIndex(visibleCells, world.board.width);
const width = world.board.width;

// Cell-level events: drop if cell is outside visible set.
const combat = events.combat.filter((event) => visible.has(event.cell.y * width + event.cell.x));
const captures = events.captures.filter((event) => visible.has(event.cell.y * width + event.cell.x));

// FR-012 (v1.9): appliedOrders — include if order.player matches viewer
// AND all referenced cells are in the visible set. Exclude entire record
// if any referenced cell is outside the visible set.
const appliedOrders = events.appliedOrders.filter((record) => {
    if (record.order.player !== player) {
        return false;
    }
    return allCoordsVisible(orderCoords(record.order), visible, width);
});

// FR-012 (v1.9): errors — include if all referenced cells are in the
// visible set OR the ValidationError variant contains no cell coordinates.
// Exclude entire record if any referenced cell is outside the visible set.
const errors = events.errors.filter(({ order, reason }) => {
    const coords = validationErrorCoords(reason);
    if (coords.length === 0) {
        return true;
    }
    return allCoordsVisible(coords, visible, width);
});

// Check if anything changed to decide whether to return original reference.
if (
    combat.length === events.combat.length &&
    captures.length === events.captures.length &&
    appliedOrders.length === events.appliedOrders.length &&
    errors.length === events.errors.length
) {
    return events;
}

return {
    combat,
    captures,
    eliminations: events.eliminations,
    appliedOrders,
    errors,
};
```

**Change 4**: Update the function signature to accept `player` (needed for `appliedOrders` filtering).

```typescript
// Before:
export function filterTickEvents(
    world: Readonly<World>,
    visibleCells: readonly Coord[],
    events: Readonly<TickEvents>,
    spectator: boolean,
): Readonly<TickEvents> {

// After:
export function filterTickEvents(
    world: Readonly<World>,
    visibleCells: readonly Coord[],
    events: Readonly<TickEvents>,
    spectator: boolean,
    player?: PlayerId,
): Readonly<TickEvents> {
```

**Rationale**: The `appliedOrders` filter needs to know the viewer's player ID to check `record.order.player !== player`. The parameter is optional — when omitted (spectator mode or tests that don't need player matching), `appliedOrders` pass through unfiltered (backward-compatible).

### 6. `packages/fog/src/playerView.ts` — Pass player to filter

**Change**: Update the `filterTickEvents` call to pass the player ID.

```typescript
// Before (line 182):
events: filterTickEvents(world, visible.visibleCells, tickEvents, false),

// After:
events: filterTickEvents(world, visible.visibleCells, tickEvents, false, player),
```

### 7. `packages/fog/tests/redaction.test.ts` — Extend SC-001 audit

**Change**: Extend the 500-tick audit to cover all 5 event categories with real order types.

The existing test only checks `combat` and `captures` events for leakage (lines 186-195). Extend to:

1. **Add real order submissions** between ticks: submit `setPipe`, `clearPipe`, `setPipesExclusive`, `clearAllPipes`, `setReserves`, `paratroop`, `gun` orders for both players. Some orders should reference cells inside the viewer's horizon, others outside.

2. **Audit `appliedOrders`**: For each `appliedOrders` record in the view, verify:
   - If `record.order.player === P1` (the viewer), then all cells referenced by the order are in the expected visible set.
   - If `record.order.player !== P1`, the record should NOT be in the view (player mismatch).

3. **Audit `errors`**: For each error record in the view, verify:
   - If the `ValidationError` variant has cell coordinates, all referenced cells are in the expected visible set.
   - If the variant has no cell coordinates (`already_surrendered`, `invalid_percent`, etc.), the record is always present.

4. **Audit `eliminations`**: Verify all elimination events are present regardless of cell coordinates (they have none).

5. **Submit intentionally invalid orders** to generate `errors`: e.g., submit a `setPipe` to a cell outside the viewer's horizon to generate a `not_owner` error; submit a `paratroop` with out-of-range source/target to generate a `paratroop_range` error.

**Note**: The test needs to use `applyCommand` from `@europa/engine` to stage orders before calling `tick()`. The existing test already calls `tick(world)` directly; we'll add order staging between ticks.

### 8. `packages/fog/tests/unit/eventsFilter.test.ts` — New unit tests

**Change**: Add test cases for the new filtering behavior.

New test cases:
- `appliedOrders` with `order.player === viewer` and all cells visible → included
- `appliedOrders` with `order.player === viewer` and any cell outside visible → excluded
- `appliedOrders` with `order.player !== viewer` → excluded (regardless of cell visibility)
- `errors` with cell-carrying variant and all cells visible → included
- `errors` with cell-carrying variant and any cell outside visible → excluded
- `errors` with non-cell variant (`already_surrendered`, `match_terminal`, etc.) → always included
- `paratroop` order with both source and target visible → included
- `paratroop` order with source visible but target outside → excluded
- `surrender` order (no cell refs) with player match → included
- Spectator mode → all events pass through unchanged

---

## Key Decisions with Rationale

### Decision 1: Store events on MatchChannel (not on EngineSession)

**Alternative considered**: Modify `EngineSession` to cache the last `TickEvents` alongside the world.

**Chosen approach**: Store `_lastTickEvents` on `MatchChannel`.

**Rationale**: The `EngineSession` interface is defined in `packages/networking/src/contracts/network-api.ts` and implemented in `packages/matchmaking/src/engineSession.ts`. Modifying the interface would require changes across two packages. `MatchChannel` is the natural owner — it already owns the tick counter and the last-sent view cache. Storing events here keeps the change localized to the networking package.

### Decision 2: Optional `events` parameter (not required)

**Alternative considered**: Make `events` a required parameter on `FogFactory.computePlayerView`.

**Chosen approach**: Optional `events?: TickEvents`.

**Rationale**: Backward compatibility. The `sendJoinAck` path (line ~1013) doesn't have events to pass (join happens before any ticks). Tests that don't care about events can omit the parameter. The default `emptyTickEvents()` preserves existing behavior when events are absent.

### Decision 3: Exclusion (not redaction) for appliedOrders/errors

**Alternative considered**: Redact out-of-horizon cell coordinates from included records.

**Chosen approach**: Exclude (drop) entire records if any referenced cell is outside the visible set.

**Rationale**: Matches spec v1.9 FR-012 amendment and is consistent with how `combat`/`captures` work — if you can't see the cell, the event is meaningless to you. Simpler to implement and reason about than partial redaction.

### Decision 4: `player` parameter on `filterTickEvents` (optional)

**Alternative considered**: Required `player` parameter.

**Chosen approach**: Optional `player?: PlayerId`.

**Rationale**: Backward compatibility with existing tests and the spectator path. When omitted, `appliedOrders` pass through unfiltered (the spectator path calls with `spectator: true` which short-circuits before reaching the filter logic anyway).

### Decision 5: Order coordinate extraction via switch (not property probing)

**Alternative considered**: Use `'cell' in order` / `'source' in order` property probing (like `pickCoord` in `tick.ts`).

**Chosen approach**: Exhaustive switch on `order.kind`.

**Rationale**: TypeScript exhaustive switch provides compile-time safety — if a new order kind is added, the compiler forces a case to be added. Property probing is fragile and doesn't distinguish between order kinds that have `cell` vs `source`/`target`.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `applyCommand` in test doesn't stage orders for `tick()` | Medium | Test can't generate real appliedOrders/errors | Read `applyCommand` implementation; orders are staged via `withPendingOrders` which `tick()` drains. Use the engine's `applyCommand` + `tick` sequence. |
| Performance regression from filtering 5 categories | Low | SC-004 budget | Each filter is O(n) over its category; total is O(combat + captures + appliedOrders + errors). Typical tick has <100 events total. Negligible. |
| Backward compat break in FogFactory interface | Low | Tests break | `events` is optional; all existing callers omit it and get `emptyTickEvents()` default. |
| `appliedOrders` filter excludes orders the viewer submitted | Medium | Viewer doesn't see their own orders | FR-012 says "order.player matches the viewer" — viewer sees their own orders only if all cells are visible. If they submitted an order to a cell outside their horizon, they shouldn't see it (they can't see that cell). This is correct per spec. |
| Exhaustive switch in `validationErrorCoords` breaks if new error kind added | Low | Compile error (good!) | TypeScript exhaustive switch + never type ensures new variants are handled. |

---

## Verification Plan

1. **Unit tests**: `pnpm --filter @europa/fog test` — new test cases in `eventsFilter.test.ts` for appliedOrders/errors filtering
2. **SC-001 audit**: `pnpm --filter @europa/fog test` — extended `redaction.test.ts` covers all 5 event categories
3. **Networking integration**: `pnpm --filter @europa/networking test` — existing broadcast tests still pass with the new `events` parameter
4. **Full verification**: `pnpm verify` — lint, typecheck, tests, build across all packages
5. **Manual smoke**: Start the app with `pnpm host`, create a match, verify events appear in the client view (not empty)
