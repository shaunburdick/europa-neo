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
| `session` | `ConsoleSession` | `INITIAL_CONSOLE_SESSION` | Match id, session token, server-issued player id, display name, participants (ID-keyed). |
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
- **Camera state**: continuous (zoom + pan), clamped to the 32–96 CSS
  px physical range and the fit-relative effective maximum; pan permits
  corner-cell centers to reach the viewport center and may expose blank
  margins beyond board edges.
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
             displayName: '', participants: [], playerNames: new Map() },
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
| `playerColors` | `Readonly<Record<PlayerId, string>>` | Per-player cosmetic color (hex string), keyed by server `PlayerId` and assigned from the ordered `PLAYER_COLOR_PALETTE` in `PlayerView.config.playerIds` (placement-slot) order. |
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
| `pan` | `{ x: number, y: number }` | CSS-pixel translation relative to the centered/fit board origin. |
| `minZoom` | `number` | Physical minimum cell size: 32 CSS px. |
| `maxZoom` | `number` | Physical maximum cell size: 96 CSS px; the effective percentage ceiling may be lower. |

### Coordinate mapping

```
baseOrigin = (
  (viewportWidth - board.width * zoom) / 2,
  (viewportHeight - board.height * zoom) / 2
)
screen = baseOrigin + pan + cell * zoom
viewportOffset = -(baseOrigin + pan)
```

`pan` is a screen-pixel translation from the board-centered fit origin,
including when the board overflows. `viewportOffset` is the board-pixel
origin at the viewport top-left, with the opposite sign; render and input
share `screen = cell * zoom - viewportOffset`.

Inverse (for hit-testing; `floor` selects the cell):

```
cell.x = floor((screen.x + viewportOffset.x) / zoom)
cell.y = floor((screen.y + viewportOffset.y) / zoom)
subcellX = ((screen.x + viewportOffset.x) / zoom) - cell.x   // [0, 1)
subcellY = ((screen.y + viewportOffset.y) / zoom) - cell.y   // [0, 1)
```

### Fit baseline and pan / zoom constraints

- `fitZoom` is the existing dynamic, measured fit baseline for the ready
  board view and the available board viewport. It is initialized when
  both measurements exist, whether the ready view or viewport is
  available first. It is not an added `CameraState` field.
- The 100% display/reset value is `fitZoom`; the percentage is relative
  to this baseline. Physical cell size remains bounded by
  `minCellPx = 32` and `maxCellPx = 96` CSS px.
- The effective percentage ceiling is `min(96px, fitZoom * 3)`. It can
  be below 300% when the fit baseline exceeds 32px. Do not expand the
  physical 96px ceiling to preserve a 300% percentage label.
- If the measured fit would require cells smaller than 32px, the 32px
  physical minimum wins and the entire board need not fit.
- At 100% fit, each of the four corner cell centers must be pan-able to
  the viewport center within 1 CSS px. Pan remains available on both
  axes whether the board fits or overflows; blank space beyond board
  edges is allowed.
- While the current camera equals the last auto-fit-applied camera, a
  viewport resize MUST recompute and reapply fit. Once a user camera
  change makes the camera differ from that value, a resize MUST preserve the
  changed camera instead of replacing it with fit. This is lifecycle
  policy; it does not add a field to `CameraState` (see spec.md v1.10
  FR-017 for the attributed ruling and provenance).
- `zoom` is clamped to the physical bounds and the fit-relative
  effective maximum. Pan is constrained by corner-center reachability,
  not by a full-board-only clamp.

### Default

```ts
const DEFAULT_CAMERA: CameraState = {
  zoom: 32,    // initial physical cell size; 100% is the measured fit baseline
  pan: { x: 0, y: 0 },
  minZoom: 32, // physical minimum (CSS px per cell)
  maxZoom: 96, // physical maximum (CSS px per cell)
};
```

A 32×32 board at 32 CSS px per cell is 1024×1024 CSS pixels. The
measured fit baseline depends on the actual board viewport, and the
physical lower bound can prevent the whole board fitting.

### Zoom percentage display (current camera contract)

The sidebar percentage is relative to the current measured `fitZoom`;
`CameraState.zoom` remains in CSS pixels per cell. The physical range
is always 32–96 CSS px per cell. For example, if `fitZoom` is 40px,
100% is 40px and the effective maximum is 96px (240%); if `fitZoom` is
32px, the effective maximum is 96px (300%).

Conversion: `percent = round(zoom / fitZoom * 100)`. The effective
maximum cell size is `min(96px, fitZoom * 3)`.

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
- Removed by the reducer on the next action dispatch **that is not a
  `pong` no-op** when `nowMs - createdAtMs > ttlMs` (lazy cleanup). The
  v1.12 heartbeat no-op short-circuit (FR-045) returns before this
  prune, so a `pong` dispatch defers it to the next dispatch that is
  not a `pong` no-op — other no-op arms (e.g. `socketClosed` while
  `status === 'game_over'`) still reach the prune even though they
  change nothing.
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
| `playerId` | `PlayerId \| null` | The local server-issued identity. `null` for spectators. |
| `displayName` | `string` | The local player's server-accepted handle, or `''` when unnamed (the canonical ID is the fallback label). |
| `participants` | `ReadonlyArray<ConsoleParticipant>` | Every participant in placement-slot order, keyed by the server-issued `PlayerId` (`{ id, name, isLocal }`). Replaces the former seat-ordered `opponents` string list (issue #74). Used by the HUD lobby strip. |
| `playerNames` | `ReadonlyMap<PlayerId, string>` | Server-provided human handles keyed by `PlayerId` (only real handles; the engine's raw-ID placeholder is omitted so the ID can render as the fallback label). |

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
| `defaultCellPx` | `32` | Shipped initial cell size; the measured fit baseline is displayed as 100%. |
| `minCellPx` | `32` | Physical minimum cell size in CSS px. |
| `maxCellPx` | `96` | Physical maximum cell size in CSS px; effective percentage maximum is `min(96px, fitZoom * 3)`. |
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
| `NetEvent` | Every `NetEvent` produces a `ConsoleState` without throwing; the heartbeat echo (`pong`, spec v1.12 FR-045) returns the **same** state reference. That guarantee is scoped to `pong` — other no-op arms (e.g. `socketClosed` while `status === 'game_over'`, `reducer.ts:630-632`) still return a freshly built state. |

1000 consecutive ticks of scripted input produce byte-identical
`MapView` snapshots (SC-002 determinism).

---

## 18. Sidebar layout (issue #76, FR-014..FR-022)

The match view restructures into a two-column flex layout. This is a
**presentation** model — no new state entity; the sidebar is composed
from existing `ConsoleState` slices.

### Layout structure

```
europa-main (display: flex)
├── europa-board-area (flex-grow: 1)   ← canvas + grid overlay + targeting/waiting overlays
└── europa-sidebar (fixed width ~280px) ← Status / Players / Orders / Reserve / Overview / Zoom / Surrender / Help
```

- `europa-main` becomes `display: flex`; `europa-board-area` is the
  left (flex-grow: 1) column; a new `europa-sidebar` is the right
  (fixed ~280px) column (FR-014).
- The header (page title) and `BrandedFooter` stay at the view root,
  outside the two-column area (FR-014).
- The sidebar is composed as children of `App` (FR-022) so player and
  spectator share one render path.

### Sidebar sections (FR-015, in vertical order)

| Section | Content | State source |
|---------|---------|--------------|
| Status | Tick counter, player turn indicator, connection status | `ConsoleState.status`, `MapView.tick` |
| Players | List with color indicators, names, roles YOU/P2/... | `ConsoleSession` (via `ParticipantStrip`) |
| Orders | Exclusive/clear mode toggle with mode label | `ConsoleState.exclusiveMode`, `inputEnabled` |
| Reserve | Percentage slider with quick-select buttons (0, 25, 50, 75, 100) | `ConsoleState.selection`, cell `reservesPercent` |
| Overview | Minimap with viewport rectangle | `MapView`, `CameraState`, `useContainerSize` |
| Zoom | Level indicator and controls | `CameraState.zoom` (percentage display) |
| Surrender | Surrender button | `ConsoleState.inputEnabled`, `onSurrenderRequest` |
| Help | Help button | `ConsoleState.status` (terminal gate only — never `inputEnabled`; FR-041 keeps Help operable for spectators) |

### Zoom percentage display (FR-017)

The sidebar Zoom section shows the current physical cell size relative
to the dynamic measured fit baseline (`fitZoom`). The baseline is
initialized when both the ready view and viewport measurement exist,
regardless of mount/measurement order. The physical range is 32–96 CSS
px per cell; the effective percentage maximum is `min(96px, fitZoom *
3)`, so it can be below 300%. If fit would require less than 32px per
cell, the board may not fit entirely.

At 100%, each corner cell center can be moved to the viewport center
within 1 CSS px. This is true on axes where the board fits and where it
overflows. User camera state is preserved across a viewport resize once
the user has interacted with the camera.

The minimap uses the exact main-board viewport transform. Its viewfinder
is clipped to the intersection of the viewport and board bounds, and a
minimap cell click targets that cell's center. Blank margins outside
board bounds are not targets and must produce no action or wire order.

### Keyboard zoom shortcuts (FR-018)

`HotkeyController` gains a UI-zoom layer:

| Key | Action |
|-----|--------|
| `+` or `=` | Zoom in one step |
| `-` or `_` | Zoom out one step |
| `Home` | Reset to 100% measured fit |

Suppressed when focus is inside interactive chrome (reuses the
existing `shouldIgnoreKeyEvent` focus guard). `0` remains the
`reserve0` order binding and is not a zoom shortcut.

### Responsive (FR-020)

`@media (max-width: 768px)`: `europa-main` flips to
`flex-direction: column`; `europa-sidebar` becomes `width: 100%`
(stacked below the board). All interactive elements remain reachable
by mouse and keyboard.

### Spectator parity (FR-021)

The sidebar renders identically for player and spectator. When
`store === undefined` (spectator path), order-producing controls
(Orders, Reserve, Surrender) render disabled or visually inert. This
is defense-in-depth for the UI; the structural invariant (no store, no
order bridge, adapter refuses orders) is the security boundary.

---

## 19. Review-cleanup additions (spec v1.12 / v1.15 — issues #153, #127)

Two entities exist *outside* `ConsoleState` and are introduced by
`plan.md` §5. One existing lobby-state shape is reduced. §4
`CameraState` is unchanged — its pan-clamp line
(`data-model.md:264-266`) is the normative guard for finding
`F-CON-ST-006`, which is already satisfied on `main`.

### 19.1 ReducerCorrelation (store scope — FR-045)

Per-store mutable correlation state for the pure reducer. It is
**not** a field of `ConsoleState` (the state shape stays fixed, see
`reducer.ts:68-69`) and **never** module scope.

| Field | Type | Constraints |
|-------|------|-------------|
| `lastActionId` | `number` | Monotonic, starts at `0`; the issued `ActionId` is `lastActionId + 1` (so id `0` is never issued). Unique **within its store** only. |
| `pendingOrders` | `Map<ActionId, Order>` | Capped at `PENDING_ORDERS_CAP = 64`; oldest-first eviction; an entry is removed when its `orderAck` settles (`takePendingOrder`). |

**Lifecycle**: created by `createConsoleStore` and passed to every
`reduce(...)` call as `ReduceOptions.correlation?`. A `reduce()` call
without a bag gets an ephemeral one for that call, so ad-hoc callers
stay deterministic and no module-level table survives.

**Transitions**: `stampOrder` increments `lastActionId` and registers
the order; `takePendingOrder` deletes on ack; nothing else mutates it.

**Relationships**: one bag ↔ one `ConsoleStore`; two stores in the same
module never share counters or pending maps (test N3 in `plan.md` §7.4).

### 19.2 ActiveModal (App-local UI state — FR-042)

Exclusive modal selection for the match view. App-local `useState`, so
it is deliberately absent from `ConsoleState`.

| Value | Renders | Focus on open | Focus on close |
|-------|---------|---------------|----------------|
| `'surrender'` | `SurrenderModal` (`aria-modal="true"`) | Cancel | the control that opened it (FR-009) |
| `'help'` | `HelpOverlay` (via `EuropaModal`, `aria-modal="true"`) | first control (EuropaModal trap) | the Help control (`App.tsx:713-716`) |
| `null` | neither | — | — |

**Transitions**: opening one value replaces the current one (the union
closes the other modal by construction). The game-over modal is **not**
a member: it renders from `status === 'game_over' && matchResult !==
null` and takes precedence — while it is up, `activeModal` is forced to
`null` and the openers are no-ops, so a terminal modal is never
preempted (019-FR-005/008/011).

**Invariant**: at most one element with `aria-modal="true"` exists in
the DOM at any time (test N16 in `plan.md` §7.4).

### 19.3 Lobby `RosterState` after F-CON-ST-009 deletion

`RosterState` (`packages/console/src/state/lobby-state.ts:164`) keeps
`players` and `connected`; the never-read `revision` field (`:167-168`)
is **removed** together with the never-dispatched `lobbyRosterDelta`
action. Revision gating lives upstream in the transport
(`ws-lobby-client.ts:1191-1198, 1216-1223`), which is where the
ordering guarantee also lives (spec 010 v1.15):

> After every delta merge the transport roster array is sorted by
> `compareUtf16(a.handle.toLowerCase(), b.handle.toLowerCase())`; the
> store adopts that array wholesale and the roster card renders array
> order with no compensating re-sort.

Lobby state is otherwise not modelled in this document (it belongs to
spec 010 / feature 023); this subsection exists only to record the
shape change so §17-style invariants stay honest.

## 20. Runtime `ControlMapping` (issue #201)

`ControlMapping` is a per-runtime configuration object, not part of
`ConsoleState` or `PlayerAction`. It maps stable `ControlActionId`s to ordered
lists of typed source bindings. Each binding dispatches the same existing
semantic action regardless of source; the mapping does not carry coordinates,
order payloads, or authoritative game state.

`ControlMappingSession` owns the current snapshot and the session's reset
baseline. Production creates one at page lifetime and shares it across route
changes/rematches. Each `ConsoleRuntime` embedding creates its own. The adapter
converts legacy `ConsoleConfig.inputMapping` into this representation. Updates
are in-memory only; reload constructs a new session, and no mapping value is
persisted or sent over the network.

M1 supports logical keyboard `event.key` and pointer bindings. Standard Gamepad
binding shapes are reserved in the type union but are rejected by M1's source
capabilities until the M2 adapter is implemented. Physical keyboard
`event.code` is not currently supported, and Ctrl/Meta keyboard chords remain
reserved for browser shortcuts. Middle pointer input remains owned by the
zoom/pan controller; the pipe mappings keep left/right and Alt+left behavior.
Atomic validation rejects overlapping conflicts and leaves the prior snapshot
unchanged; controller consumers read the current snapshot without remounting.
