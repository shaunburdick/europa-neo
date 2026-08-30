# Pipes

Pipes are how troops move. Without them your armies sit still and slowly rot. This page covers laying pipes, how flow works, and the decay rule that makes supply lines matter.

## Laying pipes

Pipes connect a cell to an adjacent cell in one of four directions: north, east, south, or west. A cell can hold **up to four directional pipes** — one per direction.

- Click near the edge of a selected cell (or press i/j/k/l) to toggle a pipe toward that region.
- Right-click or Alt+click (or Alt+i/j/k/l) lays an **exclusive pipe**: it replaces everything else in that cell with a single pipe toward the chosen region.
- Space clears all pipes in the selected cell.

See [Controls](./controls.md) for the full command tables.

## How flow works

Every tick, each pipe delivers troops into the neighboring cell it points at — the rate depends on the slope between the two cells (Δ = destination elevation − source elevation):

| Slope | Flow per tick |
| --- | --- |
| Downhill (target lower) | 8–12 troops — the steeper the drop, the faster the flow (Δ=1 → 8, Δ≥5 → 12) |
| Flat (equal elevation) | 7 troops |
| Uphill (target higher) | 6→1 troops — the steeper the climb, the slower the flow (Δ=1 → 6, Δ=6 → 1) |
| Steep uphill (Δ≥7) | **0 — stalled** |
{: .europa-table }

Flow never drains the source: the sending cell keeps its troops, and only the destination gains them.

Uphill pipes are the classic new-player trap: they can be laid, and they show on the board, but every step of climb costs speed. Gentle uphill pipes still move troops — just slowly — while steep uphill pipes (a climb of 7 or more elevation steps) stall completely and move nothing. A stalled pipe renders as a **hollow triangle** on the board, so you can spot a dead supply line at a glance. When a push stalls for no apparent reason, check whether you asked troops to walk uphill.

Two more limits:

- Water stops flow: a pipe pointing into water delivers nothing.
- Destination cells cap at 30 troops; a full cell accepts nothing until it has room.

## Feeding and decay

Troops cut off from supply do not wait politely — they die:

- A **stack** (all the troops sitting in one cell) in an open cell with **no incoming pipe flow loses 1 troop per tick** to decay.
- City cells never decay: their own production feeds them every tick.
- Any friendly inflow counts as feeding, even a trickle — the minimum non-zero flow is 1 troop per tick, and it keeps a forward garrison alive.

### Mutual feeding

Two cells piping into each other sustain each other indefinitely: each counts as fed by the other's flow, so neither decays. This is the standard way to hold a stable front line — pipe your forward cells into each other and neither rots.

Reserves interact with decay too: reserved troops cannot be eaten by decay. See [Reserves](./reserves.md).

## Pipes as tactics

- **Arteries**: long chains of downhill/flat pipes stream fresh troops from safe cities toward the front.
- **Severing**: paratroopers clear every pipe in the cell they land on — enemy supply lines are targets (see [Special weapons](./special-weapons.md)).
- **Stalemates**: two mutually-fed fronts can outlast anything thrown at them; breaking one usually means cutting the other's feed with paratroopers or guns.

---

[Back to contents](./index.md)