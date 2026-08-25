# Numbers

Every player-facing number in Europa Neo, exactly as shipped. When this table and the game disagree, the manual is wrong — report it as a bug. Each row names the constant it ships from.

## Simulation

| Value | Shipped value | Constant |
| --- | --- | --- |
| Tick cadence | 250 ms (4 ticks/second) | `DEFAULT_TICK_INTERVAL_MS` |
| City production | 1 troop/tick until saturated | `ENGINE_CONSTANTS.productionRate` |
| City saturation cap | 30 troops | `ENGINE_CONSTANTS.cityCapacity` |
| Open-cell troop cap | 30 troops | `ENGINE_CONSTANTS.cellCapacity` |
| Unfed decay | −1 troop/tick | `ENGINE_CONSTANTS.decayPerTick` |
| Pipe flow, downhill or flat | 1 troop/tick per pipe | `ENGINE_CONSTANTS.flowBase` × `flowDownhillFactor` |
| Pipe flow, uphill | 0 — uphill pipes move nothing at v1 tuning | `ENGINE_CONSTANTS.flowUphillFactor` |

## Special weapons

| Value | Shipped value | Constant |
| --- | --- | --- |
| Paratroop order cost | 20 troops removed at source | `ENGINE_CONSTANTS.paratroopCost` (10) × 2 |
| Paratroops landed | 10 troops at target | `ENGINE_CONSTANTS.paratroopCost` |
| Gun shot cost | 5 troops per shot | `ENGINE_CONSTANTS.gunCost` |
| Gun damage | 2 troops, everything in the target cell | `ENGINE_CONSTANTS.gunDamage` |
| Weapon range (both weapons) | 2 cells max (diagonals count as 1) | `SUBCELL_RANGE` |

## Vision

| Value | Shipped value | Constant |
| --- | --- | --- |
| Sensor radius per stack | 4 cells (diagonals count as 1) | `ENGINE_CONSTANTS.visibilityRadiusDefault` |

## Match lifecycle

| Value | Shipped value | Constant |
| --- | --- | --- |
| Reconnect grace window | 60 seconds | `NETWORK_CONSTANTS.defaultReconnectGraceMs` |
| Board size (standard match) | 32×32 cells | `DEFAULT_MATCH_SETTINGS.boardSize` |
| Unstarted-match lifetime | ~5 minutes before cleanup | `MATCHMAKING_CONSTANTS.emptyMatchTtlMs` |

## Interface

| Value | Shipped value | Constant |
| --- | --- | --- |
| Reserves steps | 0–90% in 10% steps (digits 0–9) | reserve key mapping (`resolveReservePercent`) |
| Camera zoom bounds | 12–96 pixels per cell | `DEFAULT_CAMERA.minZoom` / `.maxZoom` |
| Default zoom | 32 pixels per cell | `DEFAULT_CAMERA.zoom` |
| Player 1 color | Red `#dc2626` | `DEFAULT_PLAYER_COLORS[1]` |
| Player 2 color | Blue `#2563eb` | `DEFAULT_PLAYER_COLORS[2]` |
| Player 3 color | Green `#059669` | `DEFAULT_PLAYER_COLORS[3]` |
| Player 4 color | Orange-gold `#d97706` | `DEFAULT_PLAYER_COLORS[4]` |

The v1 palette is fixed — these four colors are what ships. Owner identity is never conveyed by color alone: the interface also labels players by name and number.

---

[Back to contents](./index.md)
