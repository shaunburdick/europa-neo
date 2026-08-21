# Feature Specification: Match Lifecycle & Matchmaking

**Feature Branch**: `006-match-lifecycle-matchmaking`

**Created**: 2026-08-21

**Status**: Draft

**Input**: User description: "Lobby-lite flow from arrival to battle: pick a display name, browse/create matches, auto-start when players are seated, play to conclusion, see results, rematch. No persistent accounts in v1."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Match Creation and Auto-Start (Priority: P1)

As a player, I want to create or join a match and have the game start automatically when all seats fill, so that I can get from landing page to battle in under a minute.

**Why this priority**: The core loop's entry point; without it nothing else in this feature matters.

**Independent Test**: Can be tested with two scripted clients: one creates a 2-player match, the other joins; assert both receive match-start with their seats assigned.

**Acceptance Scenarios**:

1. **Given** a player on the lobby screen, **When** they create a new 2-player match, **Then** an open match appears and their seat is reserved.
2. **Given** an open match with one seat filled, **When** a second player joins, **Then** the server generates the map (feature 003), initializes the engine (feature 001), and both clients enter the console (feature 005) simultaneously.
3. **Given** a player who abandons matchmaking before start, **When** they leave, **Then** their reserved seat is released for others.

---

### User Story 2 - Lobby Browser (Priority: P2)

As a player, I want to see open matches — player count, seats filled, map size — so that I can choose where to play instead of guessing.

**Why this priority**: Mirrors the original's game-selection board; improves the multi-host experience but direct create+share works without it.

**Independent Test**: Can be tested by creating several matches from scripted clients and asserting a third client's lobby listing reflects them accurately in near-real-time.

**Acceptance Scenarios**:

1. **Given** three open matches in various fill states, **When** a client requests the lobby list, **Then** each match shows seat occupancy and settings accurately.
2. **Given** a match that just started, **When** the lobby refreshes, **Then** it no longer appears as joinable.

---

### User Story 3 - Game Over and Rematch (Priority: P2)

As a player, I want a clear results moment when a match ends — winner, duration, final board — and a one-click rematch offer, so that playing again with the same opponent is effortless.

**Why this priority**: Retention loop; requires terminal detection (feature 001) and stable sessions (feature 004).

**Independent Test**: Can be tested by scripting a match to termination and asserting results delivery plus rematch handshake behavior.

**Acceptance Scenarios**:

1. **Given** a match reaching its terminal condition, **When** the tick resolves, **Then** all participants receive a results payload (winner, tick count, seed).
2. **Given** a finished match, **When** any participant accepts a rematch offer, **Then** a new match is created with the same participants and fresh map generation once all accept.

---

### User Story 4 - Disconnect Forfeit Policy (Priority: P3)

As a player, I want abandoned matches to resolve sensibly — my opponent wins after a grace window rather than waiting forever — so that quitters don't hold games hostage.

**Why this priority**: Robustness for hosted play; depends on session tracking (feature 004).

**Independent Test**: Can be tested by dropping a client past the grace window and asserting forfeit handling and victory for the remaining player.

**Acceptance Scenarios**:

1. **Given** a player disconnected beyond the reconnect grace window mid-match, **When** the window expires, **Then** they are marked forfeit and the remaining player is declared winner.
2. **Given** all players disconnect, **When** windows expire, **Then** the match is torn down and resources released.

---

### Edge Cases

- What happens when two creators race to name matches identically? → Server assigns unique match ids; display names need not be unique.
- What happens when a player joins a match that fills in the same instant? → Seat assignment is atomic server-side; losers receive a clean "match full" response.
- What happens when a rematch participant has left? → Rematch requires all original seats to accept within a window; otherwise it degrades to normal matchmaking.
- What happens when someone reuses a display name currently in the lobby? → Allowed; disambiguation is by server-assigned id (no accounts in v1).
- How are stale empty matches cleaned up? → Unstarted matches with no seated players are garbage-collected after a short TTL.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Players MUST be able to set an ephemeral display name per session (no account, no password); the server assigns each session a unique id.
- **FR-002**: The server MUST support creating matches with configurable player count (2 required for v1 launch; 3–4 supported by engine contract) and map settings.
- **FR-003**: A created match MUST reserve its creator's seat immediately and become joinable until seats fill.
- **FR-004**: When all seats fill, the server MUST atomically generate a map (feature 003), initialize the engine (feature 001), assign player ids/starting cities, and begin ticking.
- **FR-005**: The server MUST expose a lobby listing of joinable matches (id, display info, seat occupancy, settings) updated in near-real-time.
- **FR-006**: On match termination, the server MUST deliver results (winner, ticks elapsed, effective map seed) to all connected participants and spectators.
- **FR-007**: The server MUST offer rematch coordination: all original participants must accept within a bounded window; acceptance creates a fresh match with identical settings and a newly generated seed.
- **FR-008**: Disconnect-forfeit: if a seated player cannot be reconnected within the grace window (shared with feature 004 FR-007), the server MUST mark them forfeit; if one player remains, they win; if none remain, the match is destroyed.
- **FR-009**: Empty unstarted matches MUST be garbage-collected after a short TTL; finished matches release resources after results delivery plus a grace period.
- **FR-010**: All lifecycle transitions (created → filling → running → finished → collected) MUST be observable via protocol messages for client status displays.

### Key Entities *(include if feature involves data)*

- **PlayerSession**: ephemeral identity { unique id, display name, connection }.
- **Match**: id, settings (player count, map config), seats, state machine position, engine instance reference.
- **Seat**: slot binding a PlayerSession to a player id for a match's lifetime.
- **LobbyEntry**: projected public view of a joinable Match.
- **RematchOffer**: pending invitation set + expiry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two browser clients complete the full journey — arrive, name, create/join, play a scripted short match, see results, rematch — with zero manual server intervention.
- **SC-002**: Time from "second seat filled" to first tick received by both clients is under 2 seconds (map generation included).
- **SC-003**: Lobby listing reflects match creation/start/collection events within 1 tick of occurrence.
- **SC-004**: Forfeit policy triggers exactly at grace-window expiry in 10/10 scripted drop tests, with correct winner declaration.
- **SC-005**: A soak test of 50 sequential create/play/finish cycles leaks no matches or sessions (all collected).

## Assumptions

- v1 ships 2-player matches end-to-end; 3–4 player flows work by contract but get lighter testing (mirrors feature 001 assumption).
- No persistence across server restarts: lobby and matches are memory-resident; accounts/ratings/chat are future features (the original's Rating system documented in `europa-source/.../rating.html` and `src/games/Rating/Rating.java` is the reference for the future ratings feature).
- Display names are cosmetic and unmoderated in v1; self-hosted deployments may add moderation later.
- The original's login/password character system is intentionally not reproduced (product decision: gameplay-first v1).
