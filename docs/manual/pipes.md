# Pipes

Pipes are how troops move. Without them your armies sit still and slowly rot. This page covers laying pipes, how flow works, and the decay rule that makes supply lines matter.

## Laying pipes

Pipes connect a cell to an adjacent cell in one of four directions: north, east, south, or west. A cell can hold **up to four directional pipes** — one per direction.

- Click near the edge of a selected cell (or press i/j/k/l) to toggle a pipe toward that region.
- Right-click or Alt+click (or Alt+i/j/k/l) lays an **exclusive pipe**: it replaces everything else in that cell with a single pipe toward the chosen region.
- Space clears all pipes in the selected cell.

See [Controls](./controls.md) for the full command tables.

## How flow works

Every tick, each pipe delivers **1 troop** into the neighboring cell it points at — subject to slope:

| Slope | Flow per tick |
| --- | --- |
| Downhill (target lower) | 1 troop |
| Flat (equal elevation) | 1 troop |
| Uphill (target higher) | **0 — uphill pipes move nothing at v1 tuning** |
{: .europa-table }

Flow never drains the source: the sending cell keeps its troops, and only the destination gains them.

Uphill pipes are the classic new-player trap: they can be laid, and they show on the board, but gravity wins and no troops ever travel through them. When a push stalls for no apparent reason, check whether you asked troops to walk uphill.

Two more limits:

- Water stops flow: a pipe pointing into water delivers nothing.
- Destination cells cap at 30 troops; a full cell accepts nothing until it has room.

## Feeding and decay

Troops cut off from supply do not wait politely — they die:

- A **stack** (all the troops sitting in one cell) in an open cell with **no incoming pipe flow loses 1 troop per tick** to decay.
- City cells never decay: their own production feeds them every tick.
- Any friendly inflow counts as feeding, even 1 troop per tick — a trickle keeps a forward garrison alive.

### Mutual feeding

Two cells piping into each other sustain each other indefinitely: each counts as fed by the other's flow, so neither decays. This is the standard way to hold a stable front line — pipe your forward cells into each other and neither rots.

Reserves interact with decay too: reserved troops cannot be eaten by decay. See [Reserves](./reserves.md).

## Pipes as tactics

- **Arteries**: long chains of downhill/flat pipes stream fresh troops from safe cities toward the front.
- **Severing**: paratroopers clear every pipe in the cell they land on — enemy supply lines are targets (see [Special weapons](./special-weapons.md)).
- **Stalemates**: two mutually-fed fronts can outlast anything thrown at them; breaking one usually means cutting the other's feed with paratroopers or guns.

---

[Back to contents](./index.md)

