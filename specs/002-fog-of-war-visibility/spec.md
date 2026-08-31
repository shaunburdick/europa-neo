# Feature Specification: Fog of War & Visibility

**Feature Branch**: `002-fog-of-war-visibility`

**Created**: 2026-08-21
**Last Updated**: 2026-08-30 (v1.2; feature 013 identity-visibility policy)
**Version**: 1.2

**Status**: Implemented

**Input**: User description: "Per-player visibility horizon derived from troop positions; no memory of previously seen terrain; unseen areas are unknown (black); server never reveals hidden information to clients."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visibility Horizon Around Owned Troops (Priority: P1)

As a player, I want to see terrain, pipes, and troops only within sensor range of my own troops, so that scouting and positioning matter the way they did in the original game.

**Why this priority**: Information hiding is fundamental to Europa's strategy — without it, the game is just open-board optimization.

**Independent Test**: Can be tested by constructing a board with known troop placements, computing each player's visible set, and asserting exactly which cells are visible.

**Acceptance Scenarios**:

1. **Given** a lone friendly stack on an open board, **When** visibility is computed, **Then** all cells within the sensor radius are visible and nothing beyond is.
2. **Given** two friendly stacks in different regions, **When** visibility is computed, **Then** the visible set is the union of both stacks' horizons.
3. **Given** an enemy stack inside my horizon, **When** I receive state, **Then** its position and count are included; enemy stacks outside my horizon are absent entirely.

---

### User Story 2 - No Memory of Previously Seen Terrain (Priority: P2)

As a player, I want visibility to vanish when my troops leave or die in a region — the map returns to unknown black — so that I cannot rely on stale intelligence.

**Why this priority**: The no-memory rule is a defining original mechanic that shapes raiding and defense decisions; it depends on Story 1's horizon computation but is a distinct behavior.

**Independent Test**: Can be tested by moving/removing a stack between ticks and asserting the previously visible cells disappear from the player's view payload.

**Acceptance Scenarios**:

1. **Given** a cell was visible last tick because a friendly stack occupied it, **When** that stack is destroyed by combat, **Then** next tick's view for that player contains no data for that cell.
2. **Given** a friendly stack marches out of range of a region, **When** the tick resolves, **Then** the region reverts to unknown for that player.

---

### User Story 3 - Spectator Sees Everything (Priority: P3)

As a surrendered player or observer, I want full-board visibility so I can watch the remainder of the match without restriction (as in the original).

**Why this priority**: Spectation completes the social loop after elimination; not required for core play.

**Independent Test**: Can be tested by marking a client as spectator and asserting payloads contain complete board state.

**Acceptance Scenarios**:

1. **Given** a player surrenders mid-match, **When** subsequent ticks broadcast, **Then** their client receives unrestricted board state and cannot issue orders.

---

### Edge Cases

- What happens when opposing stacks occupy adjacent cells? → Both players see each other (each is within the other's radius); combat resolution itself reveals nothing extra beyond the horizon rule.
- What happens when a paratrooper lands then dies immediately? → Visibility applies at tick boundaries; transient positions between ticks are never exposed.
- What happens when a city changes ownership? → Visibility derives from troop presence, not ownership; capturing a city grants no vision without occupying troops.
- Do reserves affect vision? → No; any occupying troop stack projects vision regardless of reserve status.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compute a per-player visible-cell set each tick from the positions of that player's troop stacks, using a uniform sensor radius (tunable constant).
- **FR-002**: Cells outside a player's visible set MUST be transmitted as "unknown" — no terrain, elevation, pipe, or troop information.
- **FR-003**: The server MUST enforce information hiding: no payload sent to a player may contain state about cells outside that player's visible set (spectators excepted).
- **FR-004**: Visibility MUST have no memory: the visible set is recomputed from current troop positions every tick; previously seen state MUST NOT be cached or re-sent as "remembered."
- **FR-005**: Enemy troop stacks MUST be visible (position + owner + count) only while inside the viewer's horizon.
- **FR-006**: A spectator/observer mode MUST receive full board state and MUST be read-only.
- **FR-007**: Visibility computation MUST be deterministic and part of the engine core (same inputs → same visible sets), testable headlessly.
- **FR-008**: Sensor radius MUST apply uniformly to all players (no asymmetric vision in v1).
- **FR-009**: Player IDs and guest identity IDs are identity metadata, not hidden game state. They MAY accompany an otherwise authorized view, but MUST NOT grant access to or disclose cells, terrain, troops, events, or other fog-filtered state.

### Key Entities *(include if feature involves data)*

- **VisibleSet**: per-player set of cell coordinates visible this tick.
- **SensorRadius**: tunable constant (cells, Chebyshev or Euclidean per plan decision).
- **PlayerView**: filtered GameState projection (visible cells detailed, others unknown) used for all client payloads.
- **SpectatorFlag**: per-session marker granting full visibility and revoking order rights.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Protocol-level test suite proves zero hidden-state leakage across a scripted 500-tick match (every payload audited against computed VisibleSets).
- **SC-002**: Visibility updates take effect on the same tick boundary as the troop movement/destruction that caused them.
- **SC-003**: Given/When/Then scenarios from Stories 1–3 pass as automated tests.
- **SC-004**: Computing visibility for a default 32×32 board adds <1 ms per player per tick. Verified by benchmark: after a 50-call warmup, the best of three 200-call rounds must show median wall-clock time <1 ms, with a p99 <10 ms regression guard (raw p99 over small samples is dominated by shared-CI-runner scheduler jitter, so the median carries the budget and p99 only guards against algorithmic blowups).

## Assumptions

- Sensor radius is identical for all troop types (the original states all strains share the same technical restriction).
- Vision does not require line-of-sight; radius alone determines visibility (consistent with original's flat satellite display).
- Clients MAY locally render discovered terrain dimmed for usability, but the authoritative state feed contains no remembered data — any client-side memory is cosmetic only and must not survive reconnects.

## Clarifications

### v1.1 (2026-08-22) — SC-004 measurement hardening

- 2026-08-22: SC-004 measurement hardened — wall-clock p99 over ≤100 samples is dominated by shared-CI-runner scheduler stalls (observed 1.9–3.7ms tails against a 0.078ms median); assertion now median < 1ms + p99 < 10ms guard after warmup. Algorithm unchanged.

### v1.2 (2026-08-30) — Identity metadata is distinct from fog privacy (feature 013)

- IDs may be exposed for participant correlation, including in a view or transport trace, without relaxing the server-side visibility set. Fog protects game state, not identity references.
