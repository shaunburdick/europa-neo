# Data Model: Client Console (Feature 005)

**Date**: 2026-08-21 | **Feature**: 005-client-console | **Spec**: [spec.md](./spec.md)

This document describes the **UI-side** entities the console owns.
The engine's `World` (feature 001), fog's `PlayerView` (feature 002),
terrain's `Board` (feature 003), and networking's `ProtocolEnvelope`
(feature 004) are upstream types — they are imported, not re-modeled
here. The console is a leaf consumer.

## Entity overview

```
┌────────────────────────────────────────────────────────────────────┐
│                      ConsoleState                                  │
│   (global; single source of truth for UI)                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │  latestView  │  │   camera     │  │   session    │             │
│   │ (PlayerView) │  │              │  │              │             │
│   └──────────────┘  └──────────────┘  └──────────────┘             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │ status       │  │   feedback   │  │   qol        │             │
│   │              │  │              │  │              │             │
│   └──────────────┘  └──────────────┘  └──────────────┘             │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (derived per frame)
┌────────────────────────────────────────────────────────────────────┐
│                         MapView                                    │
│   (per-frame snapshot; what the renderer paints)                  │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │   cells      │  │   camera     │  │   effects    │             │
│   │  (Map<>)     │  │              │  │              │             │
│   └──────────────┘  └──────────────┘  └──────────────┘             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │   labels     │  │  hover/sel   │  │ playerColors │             │
│   └──────────────┘  └──────────────┘  └──────────────┘             │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (transient)
┌────────────────────────────────────────────────────────────────────┐
│                    CellRenderInfo, MapEffect, MapLabel             │
│   (per-cell; per-effect; per-label)                                │
└────────────────────────────────────────────────────────────────────┘
```

The runtime continuously reduces `ConsoleState` from `ConsoleAction`s
(input + network) and derives `MapView` snapshots for the renderer.

---

## 1. ConsoleState

The console's global state. Single source of truth. Read-only from
the outside; mutated only by `reduce()` (pure function declared in
`console-state.ts`).

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `ConsoleConnectionStatus` | `'idle'` | UI connection banner. Derived from `ConnectionState` + adapter observations. |
| `latestView` | `PlayerView \| null` | `null` | Last successfully-applied PlayerView. `null` until the first `tick` or `snapshot` event. |
| `initialWorld` | `World \| null` | `null` | Initial full-world snapshot from `JoinAckPayload.snapshot`. Used only for the very first paint. Cleared after the first `PlayerView` is applied. |
| `camera` | `CameraState` | `DEFAULT_CAMERA` | Current zoom + pan. |
| `hover` | `Coord \| null` | `null` | Cell the mouse is over. `null` when the cursor is over the HUD chrome. |
| `selection` | `Coord \| null` | `null` | Cell the keyboard has focused. Distinct from `hover`. |
| `lastCursorScreen` | `ScreenPoint \| null` | `null` | Last-known screen-space cursor position. Recomputed on every `pointermove`; used to keep the cursor target in sync when the camera moves. |
| `feedback` | `ReadonlyArray<FeedbackMessage>` | `[]` | Transient HUD messages ("Sent → Acknowledged", "Pipe N at (5, 7)"). TTL-cleared. |
| `rejectedOrders` | `ReadonlyArray<RejectedOrder>` | `[]` | Recent order rejections. Capped at `CONSOLE_CONSTANTS.maxRejectedOrders` (default 10). |
| `qol` | `QoLSettings` | `DEFAULT_QOL_SETTINGS` | Sound, animation, theme, etc. |
| `session` | `ConsoleSession` | `INITIAL_CONSOLE_SESSION` | Match id, session token, player id, display name, opponents. |
| `inputEnabled` | `boolean` | `false` | Whether pointer + keyboard input is currently accepted. `true` only when `status === 'live'`. |
| `exclusiveMode` | `boolean` | `false` | Whether the next pipe click is exclusive (replaces all) instead of toggle. |

### Validation rules

- `latestView.tick` MUST be monotonically non-decreasing across
  updates. The reducer drops out-of-order ticks (silently; logged).
- `feedback` is FIFO-evicted when the queue exceeds the
  `maxFeedbackMessages` constant.
- `rejectedOrders` is FIFO-evicted when the queue exceeds
  `maxRejectedOrders`.
- `inputEnabled` is set to `false` whenever `status !== 'live'`.
  The reducer enforces this; tests cover the transitions.
- `selection` MUST be in bounds (`0 <= x < width, 0 <= y < height`)
  whenever `latestView !== null`. The reducer clamps out-of-bounds
  selections to `null` (or to the nearest in-bounds cell, depending
  on the action).

### State transitions

The full state machine is the union of:

- **Connection state machine** (mirrors feature 004's
  `ConnectionState`): `idle → connecting → live → (reconnecting
  ↔ live) → expired | spectating | game_over → closed`.
- **Input state machine**: `enabled ↔ disabled` based on `status`,
  modals, and explicit host override.
- **Camera state**: continuous (zoom + pan), clamped to
  `[minZoom, maxZoom]` and to bounds (no pan past the board edges).
- **Selection state**: `null → coord → null`. `Escape` clears.
  Arrow keys move the selection by ±1 in the relevant axis.

### Initial value

`INITIAL_CONSOLE_STATE` (see `console-state.ts`):

```ts
{
  status: 'idle',
  latestView: null,
  initialWorld: null,
  camera: DEFAULT_CAMERA,
  hover: null,
  selection: null,
  lastCursorScreen: null,
  feedback: [],
  rejectedOrders: [],
  qol: DEFAULT_QOL_SETTINGS,
  session: { matchId: null, sessionToken: null, playerId: null,
             displayName: '', opponents: [] },
  inputEnabled: false,
  exclusiveMode: false,
}
```

---

## 2. MapView

A pure-data snapshot of what the renderer should paint for one
frame. The runtime derives it from `ConsoleState` on every
`state.dirty` mark (typically once per server tick, ~4 Hz).

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `MapViewId` | Unique per view; used as React `key` and for diagnostics. |
| `tick` | `number` | The tick this view is for. From `latestView.tick`. |
| `width`, `height` | `number` | Board dimensions in cells. |
| `cells` | `ReadonlyMap<string, CellRenderInfo>` | `coordKey(coord) → CellRenderInfo` for every visible cell. Cells outside the horizon are NOT present. |
| `playerColors` | `Readonly<Record<PlayerId, string>>` | Per-player cosmetic color (hex string). v1 uses `DEFAULT_PLAYER_COLORS`; v2 takes from matchmaking. |
| `effects` | `ReadonlyArray<MapEffect>` | Transient effects to paint (combat flash, paratroop trail). |
| `labels` | `ReadonlyArray<MapLabel>` | Transient labels (e.g., "70%" after a reserve change). |
| `camera` | `CameraState` | Zoom + pan. |
| `hover` | `Coord \| null` | Highlight target. |
| `selection` | `Coord \| null` | Focus ring target. |
| `dragSelection` | `ReadonlyArray<Coord> \| null` | v1: always `null`. v1.1: drag-to-select region. |
| `exclusiveMode` | `boolean` | Whether exclusive-pipe mode is active (renderer draws a "MODE: EXCLUSIVE" badge in the HUD). |

### Relationships

- `MapView` is **derived** from `ConsoleState` + `PlayerView`. It
  is never stored between frames; the runtime rebuilds it on every
  paint.
- `cells` references only the cells present in
  `latestView.visibleCells`. Cells outside the horizon are absent
  (the renderer paints them as void).

---

## 3. CellRenderInfo

Per-cell data the renderer needs. Pure data; no DOM, no canvas
references.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `coord` | `Coord` | Cell position. |
| `elevation` | `number` | `0..255` integer. Renderer shades terrain by this. |
| `terrain` | `'land' \| 'water'` | Water cells render blue; land renders shaded. |
| `troops` | `number` | Troop count. `0` = empty. |
| `owner` | `PlayerId \| null` | Troop owner. `null` for empty / neutral. |
| `isCity` | `boolean` | Whether this cell is a city. Distinct border + icon. |
| `cityOwner` | `PlayerId \| null` | City owner (may differ from `owner` during a capture in flight). |
| `pipes` | `ReadonlySet<Direction>` | Active pipes. Renderer draws pipe triangles at the corresponding cell edges. |
| `reservesPct` | `ReservesPct` | `0..9` (×10 = percent). Renderer draws a small badge. |
| `changedThisTick` | `boolean` | `true` for cells whose state changed in the most recent tick. Renderer draws a brief highlight (~200 ms). |

### Source

Built by `cellViewToRenderInfo(cell: CellView)` in `console-state.ts`.
The reducer calls this for every `visibleCells[i]` in the latest
`PlayerView`.

### Validation

- `troops >= 0` (engine invariant; the console doesn't recheck).
- `pipes.size <= 4` (engine invariant).
- `reservesPct` in `0..9` (engine invariant).
- `owner` and `cityOwner` are non-null only if the corresponding
  count is positive / the cell is a city; engine guarantees this.

---

## 4. CameraState

The view transform. Pure data.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `zoom` | `number` | Cell size in CSS pixels. Clamped to `[minZoom, maxZoom]`. |
| `pan` | `{ x: number, y: number }` | Top-left offset in CSS pixels. |
| `minZoom` | `number` | Min cell size (default 12). |
| `maxZoom` | `number` | Max cell size (default 96). |

### Coordinate mapping

```
screen.x = pan.x + cell.x * zoom
screen.y = pan.y + cell.y * zoom
```

Inverse (for hit-testing):

```
cell.x = floor((screen.x - pan.x) / zoom)
cell.y = floor((screen.y - pan.y) / zoom)
subcellX = ((screen.x - pan.x) / zoom) - cell.x   // [0, 1)
subcellY = ((screen.y - pan.y) / zoom) - cell.y   // [0, 1)
```

### Pan / zoom constraints

- `pan.x` is clamped to `[-(maxZoom * 2), boardWidth * zoom]`
  (i.e., the board can't be panned entirely off-screen).
- `pan.y` is clamped to `[-(maxZoom * 2), boardHeight * zoom]`.
- `zoom` is clamped to `[minZoom, maxZoom]`.

### Default

```ts
const DEFAULT_CAMERA: CameraState = {
  zoom: 32,    // 32 px per cell
  pan: { x: 0, y: 0 },
  minZoom: 12,
  maxZoom: 96,
};
```

A 32×32 board at default zoom is 1024×1024 CSS pixels — fits
a typical 1080p viewport with HUD chrome on the side.

---

## 5. MapEffect

A transient effect the renderer paints on top of the base layer.
Cleared by the renderer reporting `consumedEffects` (or after
`expiresAtMs`, whichever comes first).

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `'combat' \| 'capture' \| 'paratroop_launch' \| 'paratroop_land' \| 'gun_fire'` | What to draw. |
| `cell` | `Coord` | Primary cell (e.g., the captured cell, the paratroop destination). |
| `otherCell` | `Coord \| undefined` | Secondary cell (e.g., paratroop source for `paratroop_launch`). |
| `expiresAtMs` | `number` | Epoch ms after which the effect is auto-removed. |

### Lifecycle

- Created by `eventToEffect(tickEvent, { nowMs, tick })` when the
  reducer processes a new `TickEvents` block.
- Added to `MapView.effects` for the next paint.
- Removed by the runtime when:
  - the renderer reports it consumed (via `RenderFeedback`), OR
  - `nowMs > expiresAtMs` (whichever comes first).

### TTL

Default `CONSOLE_CONSTANTS.effectTtlMs = 400` ms. Tunable.

---

## 6. MapLabel

A transient text label at a cell. Used for "70%" reserve
confirmation, "INVALID" for a rejected order, etc.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `cell` | `Coord` | Where to draw. |
| `text` | `string` | The label text. |
| `expiresAtMs` | `number` | Epoch ms after which the label is auto-removed. |

### Lifecycle

Identical to `MapEffect`. Default TTL is
`CONSOLE_CONSTANTS.labelTtlMs = 1500` ms.

---

## 7. FeedbackMessage

A transient HUD message (e.g., "Pipe N at (5, 7)"). Rendered
in a toast region above the board.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique. UUID v4 or similar. |
| `text` | `string` | Visible text. Localized-ready (v2 i18n). |
| `kind` | `'info' \| 'success' \| 'warning' \| 'error'` | Visual style. |
| `ttlMs` | `number` | How long to show. |
| `createdAtMs` | `number` | When the message was created (used to compute expiry). |

### Lifecycle

- Created by the reducer (e.g., on a successful order
  submission: `appendFeedback(... { text: 'Sent pipe N at (5, 7)', kind: 'info', ttlMs: 2000 }, nowMs)`).
- Added to `ConsoleState.feedback`.
- Removed by the reducer on the next action dispatch when
  `nowMs - createdAtMs > ttlMs` (lazy cleanup).
- Maximum 5 messages retained; older ones evicted FIFO.

---

## 8. RejectedOrder

A record of one rejected order. Used for the "X rejected" badge
in the HUD.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `actionId` | `ActionId` | The action that produced the order. |
| `order` | `Order` | The order that was rejected. |
| `reason` | `ValidationError` | Why it was rejected. |
| `atTick` | `number` | Tick at which it was rejected. |
| `atMs` | `number` | Epoch ms when the rejection was processed. |

### Lifecycle

- Created by the reducer on `NetEvent { kind: 'orderAck', result: { ok: false, reason } }`.
- Added to `ConsoleState.rejectedOrders`.
- Evicted FIFO when the array exceeds
  `CONSOLE_CONSTANTS.maxRejectedOrders` (default 10).
- Cleared when the user opens the feedback panel (v1.1).

---

## 9. QoLSettings

User-facing comfort settings. Persisted by the host (the console
does not access `localStorage`).

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `soundOn` | `boolean` | `false` | Sound effects. |
| `animation` | `'full' \| 'reduced'` | `'full'` | UI animation intensity. |
| `tooltips` | `boolean` | `true` | Show tooltips on hover. |
| `theme` | `'system' \| 'light' \| 'dark'` | `'system'` | Color theme. |
| `ownerColorRing` | `boolean` | `true` | Color-blind aid: shape pattern around owned cells. |

### Persistence contract

The host's `ConsoleConfig.persist(settings)` callback is invoked
when the reducer applies a `setQol` action. The console does
NOT call `localStorage` itself.

### Default

```ts
const DEFAULT_QOL_SETTINGS: QoLSettings = {
  soundOn: false,
  animation: 'full',
  tooltips: true,
  theme: 'system',
  ownerColorRing: true,
};
```

---

## 10. ConsoleSession

The console's record of the current match session. Mirrors
feature 004's join-ack payload plus cosmetic fields.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `matchId` | `MatchId \| null` | The match the console is in. `null` before `joinMatch`. |
| `sessionToken` | `SessionToken \| null` | Reconnect token. `null` before `joinMatch`. |
| `playerId` | `PlayerId \| null` | The local player id. `null` for spectators. |
| `displayName` | `string` | Cosmetic. |
| `opponents` | `ReadonlyArray<string>` | Display names of other players (length = `playerCount - 1`). Used by the HUD lobby strip. |

---

## 11. PlayerAction

Discriminated union of every legal gesture the console produces.
Each variant maps 1:1 to an engine `Order` (or stays local for
non-order gestures). See `console-types.ts` for the full union.

### Mapping table

| `PlayerAction.kind` | Engine `Order` | Notes |
|----------------------|----------------|-------|
| `setPipe` | `OrderSetPipe` | `direction` from `region` or from key. |
| `clearPipe` | `OrderClearPipe` | For toggle removal. |
| `setPipesExclusive` | `OrderSetPipesExclusive` | Replaces all pipes. |
| `clearAllPipes` | `OrderClearAllPipes` | Space bar. |
| `setReserves` | `OrderSetReserves` | `percent` from digit key. |
| `paratroop` | `OrderParatroop` | `source` from selection, `target` from subcell. |
| `gun` | `OrderGun` | Same. |
| `surrender` | `OrderSurrender` | Triggered by confirm flow. |
| `selectCell` | — (local) | Updates `ConsoleState.selection`. |
| `hoverCell` | — (local) | Updates `ConsoleState.hover`. |
| `setCamera` | — (local) | Updates `ConsoleState.camera`. |
| `setQol` | — (local) | Updates `ConsoleState.qol`. Triggers `persist` effect. |
| `setExclusiveMode` | — (local) | Updates `ConsoleState.exclusiveMode`. |

---

## 12. NetEvent

Discriminated union of every event the network adapter hands to
the reducer. See `console-state.ts` for the full union.

### Mapping table

| Wire `MessageKind` | `NetEvent.kind` | Notes |
|--------------------|-----------------|-------|
| `helloAck` | `helloAck` | `connectionId` + `heartbeatIntervalMs`. |
| `joinAck` | `joined` | `sessionToken` + `playerId` + `view` + `players`. |
| (rejoin) | `reconnected` | Variant of `joined` for the reconnect path. |
| `tick` | `tick` | `view` is the new PlayerView. |
| `orderAck` | `orderAck` | `actionId` + `result`. |
| `terminal` | `terminal` | `result` is the engine's MatchResult. |
| `pong` | `pong` | Echo timing. |
| `error` | `error` | `code` + `message`. |
| (socket close) | `socketClosed` | Adapter-level event (not a wire message). |
| (reconnect attempt) | `reconnecting` | Adapter-level event. |

---

## 13. ReducerEffect

Side effects the reducer requests of the runtime. Pure declaration
on the reducer side; the runtime interprets and applies them.

| Effect | Runtime behavior |
|--------|-----------------|
| `sendOrder` | Call `client.sendOrder(actionId, order)`. Stash `seq ↔ actionId` in the adapter's reverse-lookup. |
| `playSound` | Look up the clip's URL in the bundled asset map; play via HTMLAudioElement. |
| `persistQol` | Call `ConsoleConfig.persist(qol)`. |
| `requestSurrenderConfirm` | Open the built-in modal OR call `ConsoleConfig.onSurrenderRequest()`. On confirm, dispatch `{ kind: 'surrender' }`. |
| `showErrorModal` | Open the built-in error modal with the given title + body. |
| `announce` | Set the text of an `aria-live` region in the renderer. |
| `scheduleReconnect` | Call the adapter's reconnect logic. |

---

## 14. Branded primitives

| Name | Base | Brand | Purpose |
|------|------|-------|---------|
| `MapViewId` | `string` | `__brand: 'MapViewId'` | Identifies a `MapView` instance. |
| `ActionId` | `number` | `__brand: 'ActionId'` | Console-internal action counter. Distinct from networking's `SequenceNumber`. |
| `CellRegion` | `'N' \| 'E' \| 'S' \| 'W'` | n/a | Quadrant of a cell for pipe targeting. |
| `SubcellPosition` | `{ x, y }` in `[0, 1)` | n/a | Cursor position within a cell. |

---

## 15. Constants

`CONSOLE_CONSTANTS` is the single tunable-knobs location (mirror
of the engine's `ENGINE_CONSTANTS` discipline):

| Constant | Default | Description |
|----------|---------|-------------|
| `defaultCellPx` | `32` | Default cell size. |
| `minCellPx` | `12` | Min zoom. |
| `maxCellPx` | `96` | Max zoom. |
| `feedbackTtlMs` | `2000` | Feedback message TTL. |
| `labelTtlMs` | `1500` | MapLabel TTL (e.g., "70%" flash). |
| `effectTtlMs` | `400` | MapEffect TTL (e.g., combat flash). |
| `maxFeedbackMessages` | `5` | Max feedback messages retained. |
| `maxRejectedOrders` | `10` | Max rejections retained. |
| `clientOrderRatePerSec` | `10` | Client-side debounce. |
| `reconnectBackoffBaseMs` | `500` | Reconnect backoff base. |
| `reconnectBackoffCapMs` | `30000` | Reconnect backoff cap. |

---

## 16. Cross-feature conformance

The console conforms to:

- **Feature 001** (`engine-types.ts`): the console imports
  `World`, `CellView`, `Coord`, `Direction`, `Order`,
  `ReservesPct`, `PlayerId`, `TickEvents`, `ValidationError`,
  `MatchConfig`. No additive changes.
- **Feature 002** (`fog-types.ts`): the console imports
  `PlayerView`. No additive changes.
- **Feature 003** (`terrain-types.ts`): the console imports
  `Board` and `Cell` (type-only) for the initial paint.
  No additive changes.
- **Feature 004** (`network-types.ts`): the console imports
  `ConnectionState`, `SessionToken`, `MatchId`, `ErrorCode`,
  `SequenceNumber`. The console uses feature 004's
  `MatchClient` for all wire I/O. No additive changes.

The console is a **leaf consumer** — it does not propose any
additive change to upstream features.

---

## 17. Test invariants

For each entity, the test suite asserts:

| Entity | Invariant |
|--------|-----------|
| `ConsoleState` | Immutability: no field is mutated after construction. |
| `ConsoleState` | `inputEnabled === (status === 'live')` after every reducer step. |
| `ConsoleState` | `latestView.tick` is monotonic non-decreasing. |
| `MapView` | `cells.size === latestView.visibleCells.length` (no duplication, no missing). |
| `MapView` | `cells` keys are unique; `coordKey(coord) === keyToCoord(key)` round-trips. |
| `CellRenderInfo` | `troops >= 0`; `pipes.size <= 4`; `reservesPct in 0..9`. |
| `CameraState` | `minZoom <= zoom <= maxZoom`. |
| `FeedbackMessage` | FIFO eviction at `maxFeedbackMessages`. |
| `RejectedOrder` | FIFO eviction at `maxRejectedOrders`. |
| `PlayerAction` → `Order` | Every order-producing variant produces a valid `Order` of the right kind. |
| `NetEvent` | Every `NetEvent` produces a new `ConsoleState` without throwing. |

1000 consecutive ticks of scripted input produce byte-identical
`MapView` snapshots (SC-002 determinism).
