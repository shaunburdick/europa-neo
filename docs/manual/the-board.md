# The board

Every match is fought on a square grid of cells. This page covers what the board looks like and why you can trust it to be fair.

## The grid

- A standard match uses a **32×32 board** — 1,024 cells.
- Every cell is one of two terrain types: **land** or **water**.
- Troops, cities, pipes, and combat all live on land. Water is impassable: nothing flows across it, nothing lands on it.

## Elevation shading

Land cells are shaded by elevation, from dark green at the lowest ground to bright green at the peaks. Elevation is not decoration — it drives pipe flow:

- **Downhill** pipes (toward lower cells) flow.
- **Flat** pipes (equal elevation) flow.
- **Uphill** pipes (toward higher cells) move nothing at v1 tuning.

Reading elevation well is a real skill: a ridge between your cities and the front can force long detours, because troops cannot be pumped uphill. See [Pipes](./pipes.md) for the flow rules.

## Water pools

Water appears as blue pools scattered across the map. Water never changes: it cannot be filled, crossed, piped through, or targeted by paratroopers. It shapes every supply line by existing — plan around it.

## Fair maps, guaranteed

Maps are generated fresh for each match, but fairness is built in:

- **Point symmetry**: the terrain is mirrored through the center of the board, so both halves offer identical ground.
- **Equal starts**: each player begins with the same number of cities in symmetric positions.
- **Guaranteed land routes**: there is always a land path between the starting positions — no player is ever walled off by water.

No pre-made maps, no map voting, no home-field advantage: both commanders face the same terrain.
