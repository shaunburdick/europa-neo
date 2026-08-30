# The board

Every match is fought on a square grid of cells. This page covers what the board looks like and why you can trust it to be fair.

## The grid

- A standard match uses a square board. The default size depends on how many players are in the match:
  - **2 players → 32×32** (1,024 cells) — the long-shipped default.
  - **3 players → 48×48** (2,304 cells).
  - **4 players → 48×48** (2,304 cells).
- You can override the board size when creating a match to **32×32** or **48×48**. The 64×64 size is temporarily disabled — terrain generation is unreliable (follow-up issue #26) — so the supported override set is 32 and 48 until that fix lands.
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

No pre-made maps, no map voting, no home-field advantage: all commanders face the same terrain.

---

[Back to contents](./index.md)
