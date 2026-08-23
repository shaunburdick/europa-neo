# Feature Specification: Match Lifecycle & Matchmaking

**Feature Branch**: `006-match-lifecycle-matchmaking`

**Created**: 2026-08-21

**Last Updated**: 2026-08-21 (v1.1 — clarified visibility types and shareable join links)

**Version**: 1.1

**Status**: Implemented

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

### User Story 2 - Lobby Browser for Public Matches (Priority: P2)

As a player, I want to see open public matches — player count, seats filled, map size — so that I can choose where to play instead of guessing.

**Why this priority**: Mirrors the original's game-selection board; improves the multi-host experience but direct create+share works without it.

**Independent Test**: Can be tested by creating several public matches from scripted clients and asserting a third client's lobby listing reflects them accurately in near-real-time.

**Acceptance Scenarios**:

1. **Given** three open public matches in various fill states, **When** a client requests the lobby list, **Then** each match shows seat occupancy and settings accurately.
2. **Given** a public match that just started, **When** the lobby refreshes, **Then** it no longer appears as joinable.
3. **Given** a private match exists, **When** any client requests the lobby list, **Then** the private match does not appear.

---

### User Story 3 - Private Matches via Shareable Link (Priority: P2)

As a player, I want to create a private match that is invisible in the lobby and joinable only through its generated ID/shareable link, so that I can play against invited friends while strangers play in public.

**Why this priority**: Core to the social hosting model (play with your group); buildable immediately on top of match creation.

**Independent Test**: Can be tested by creating a private match from one client, verifying it is absent from another client's lobby, then joining via the generated link and asserting successful seating.

**Acceptance Scenarios**:

1. **Given** a player creates a match marked private, **When** creation completes, **Then** the server returns a unique match ID and a shareable join URL containing it.
2. **Given** a private match with open seats, **When** a client opens the shareable join URL, **Then** they take a seat like any other join flow.
3. **Given** a private match with open seats, **When** a client attempts to join by browsing (without the ID), **Then** no path exists to discover or join it from the lobby.

---

### User Story 4 - Game Over and Rematch (Priority: P2)

As a player, I want a clear results moment when a match ends — winner, duration, final board — and a one-click rematch offer, so that playing again with the same opponent is effortless.

**Why this priority**: Retention loop; requires terminal detection (feature 001) and stable sessions (feature 004).

**Independent Test**: Can be tested by scripting a match to termination and asserting results delivery plus rematch handshake behavior.

**Acceptance Scenarios**:

1. **Given** a match reaching its terminal condition, **When** the tick resolves, **Then** all participants receive a results payload (winner, tick count, seed).
2. **Given** a finished match, **When** any participant accepts a rematch offer, **Then** a new match is created with the same participants and fresh map generation once all accept.

---

### User Story 5 - Disconnect Forfeit Policy (Priority: P3)

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
- What happens when a client tries to join a private match without its ID? → No discovery path exists; join attempts by unknown ID fail with "match not found" (no existence leak).
- What happens when a private link is shared beyond the intended group? → In v1 anyone holding the link may take a seat (no accounts); hosts control privacy by limiting link distribution. Link rotation/revocation is deferred to the future accounts feature.
- What happens when a public match creator wanted privacy after all? → Visibility type is fixed at creation in v1; recreate the match.
- How are stale empty matches cleaned up? → Unstarted matches with no seated players are garbage-collected after a short TTL (public and private alike).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Players MUST be able to set an ephemeral display name per session (no account, no password); the server assigns each session a unique id.
- **FR-002**: The server MUST support creating matches with configurable player count (2 required for v1 launch; 3–4 supported by engine contract), map settings, and visibility type (public or private).
- **FR-003**: Every created match MUST receive a unique server-assigned ID and a corresponding shareable join URL; both MUST be returned to the creator at creation time.
- **FR-004**: A created match MUST reserve its creator's seat immediately and become joinable until seats fill.
- **FR-005**: The lobby listing MUST include public matches only (id, display info, seat occupancy, settings), updated in near-real-time.
- **FR-006**: Private matches MUST be joinable exclusively via their match ID/shareable URL; they MUST NOT appear in the lobby listing, and unknown IDs MUST be rejected without revealing whether a private match exists.
- **FR-007**: When all seats fill, the server MUST atomically generate a map (feature 003), initialize the engine (feature 001), assign player ids/starting cities, and begin ticking.
- **FR-008**: On match termination, the server MUST deliver results (winner, ticks elapsed, effective map seed) to all connected participants and spectators.
- **FR-009**: The server MUST offer rematch coordination: all original participants must accept within a bounded window; acceptance creates a fresh match with identical settings and visibility type, and a newly generated seed/ID/link.
- **FR-010**: Disconnect-forfeit: if a seated player cannot be reconnected within the grace window (shared with feature 004 FR-007), the server MUST mark them forfeit; if one player remains, they win; if none remain, the match is destroyed.
- **FR-011**: Empty unstarted matches MUST be garbage-collected after a short TTL; finished matches release resources after results delivery plus a grace period.
- **FR-012**: All lifecycle transitions (created → filling → running → finished → collected) MUST be observable via protocol messages for client status displays.

### Key Entities *(include if feature involves data)*

- **PlayerSession**: ephemeral identity { unique id, display name, connection }.
- **Match**: id, shareable join URL, visibility type (public/private), settings (player count, map config), seats, state machine position, engine instance reference.
- **Seat**: slot binding a PlayerSession to a player id for a match's lifetime.
- **LobbyEntry**: projected public view of a joinable Match.
- **RematchOffer**: pending invitation set + expiry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two browser clients complete the full journey — arrive, name, create/join, play a scripted short match, see results, rematch — with zero manual server intervention.
- **SC-002**: Time from "second seat filled" to first tick received by both clients is under 2 seconds (map generation included).
- **SC-003**: Lobby listing reflects match creation/start/collection events within 1 tick of occurrence, and contains zero private matches in every sampled listing.
- **SC-004**: Forfeit policy triggers exactly at grace-window expiry in 10/10 scripted drop tests, with correct winner declaration.
- **SC-005**: A soak test of 50 sequential create/play/finish cycles leaks no matches or sessions (all collected).
- **SC-006**: Joining a private match via its shareable URL succeeds identically to public join; joining via an unknown ID returns "match not found" in 10/10 trials.

## Assumptions

- v1 ships 2-player matches end-to-end; 3–4 player flows work by contract but get lighter testing (mirrors feature 001 assumption).
- No persistence across server restarts: lobby and matches are memory-resident; accounts/ratings/chat are future features (the original's Rating system documented in `europa-source/.../rating.html` and `src/games/Rating/Rating.java` is the reference for the future ratings feature).
- Display names are cosmetic and unmoderated in v1; self-hosted deployments may add moderation later.
- The original's login/password character system is intentionally not reproduced (product decision: gameplay-first v1).

## Clarifications

### v1.1 (2026-08-21) — Visibility types and shareable join links

Resolved ambiguities from the initial v1.0 draft around how players find matches and how private play is supported. See commit `1ed3233` for the full diff.

- **Q1 — Lobby scope**: Is the lobby the only way to find a match?
  - **Resolution**: No. Matches carry a visibility type (`public` or `private`) chosen at creation. Lobby lists public matches only; private matches are discoverable exclusively via their server-assigned match ID / shareable join URL. See US2, US3, FR-002, FR-003, FR-005, FR-006.
- **Q2 — Private-match discovery**: Can a private match be enumerated by guessing IDs?
  - **Resolution**: Unknown IDs are rejected with a generic `match not found` response; the server does not leak whether a private match exists. Link sharing is the only entry path; link rotation/revocation is out of scope for v1 (deferred to the future accounts feature). See edge cases "tries to join without ID" and "link shared beyond intended group", and FR-006.
- **Q3 — Join URL shape**: Is there a shareable URL, or just an opaque ID?
  - **Resolution**: Both. Every created match returns `match_id` and a `join_url` (the URL embeds the match ID) at creation time; the creator is responsible for distributing it. See FR-003, US3 AC-1.
- **Q4 — Visibility mutability**: Can a creator flip a public match to private after the fact?
  - **Resolution**: No in v1; visibility type is fixed at creation. Creators who want the other mode must recreate the match. See edge case "creator wanted privacy after all".
- **Q5 — Lobby freshness**: How quickly must the lobby reflect lifecycle transitions?
  - **Resolution**: Updates must propagate within one tick of the underlying event (SC-003). The lifecycle states observed by clients are `created → filling → running → finished → collected` (FR-012).

## Implementation Notes

Shipped deviations and rulings recorded during Phases 3–8 (implementation
is faithful to the FRs; each item below documents where the code
deliberately differs from earlier task prose or planning contracts).
Contracts were updated in the same change set wherever behavior changed.

- **Double-request idempotency (US4)**: a repeat `requestRematch` on an
  open window returns the existing offer id; if the caller already
  voted, it returns `rematch_already_voted`. Anchored the window
  deadline at `finishedAtMs` so a late first caller can find the window
  already closed.
- **`initialSeed` additive field (US4)**: rematch-created matches mint
  their seed at creation (they sit in `filling` until players
  reconnect, so no auto-start exists to mint it); normal creates mint
  at auto-start. Stored as `MatchRecord.initialSeed`.
- **Lazy sweeps, no timers (FR-009/FR-011)**: both GC sweeps
  (rematch-window expiry, empty-match TTL) run on read paths
  (`stats()`, `listPublicMatches()`) against the injected clock;
  `sweepIntervalMs` remains a host scheduling hint. The empty-match
  sweep also deletes seated players' ephemeral sessions (SC-005
  no-leak invariant). "Empty" means *unstarted* — per the executable
  Q-M06 scenario, a creator-seated filling match that never fills is
  collected after the TTL.
- **Conformance-clause rewrite (Phase 8)**: T061's prose referenced an
  engine `createMatchSession` / `MatchInitRequest` contract that was
  never shipped; the conformance test asserts the drift-catching intent
  against the real surfaces instead (engine primitive lifecycle wrapped
  by `engineSession.ts`; networking's canonical request shapes; bridge
  assignability). Networking's shipped `DetachRequest` carries no
  `reason` field — the `'forfeit_timeout'` reason exists only in the
  planning contract.
- **Filling-forfeit inline release (US5)**: forfeiting a seat on a
  `filling` match performs the minimal inline release (seat removed +
  session unbound + detach), not full `leaveMatch` semantics.
