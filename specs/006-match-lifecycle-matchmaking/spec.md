# Feature Specification: Match Lifecycle & Matchmaking

**Feature Branch**: `006-match-lifecycle-matchmaking`

**Created**: 2026-08-21

**Last Updated**: 2026-10-11 (v1.8; issue #146 guest-identity resume secret)

**Version**: 1.8

**Status**: Implemented (2026-09-12; universal PlayerId allocation + credential separation implemented — issue #74); v1.8 resume-secret requirement closes the remaining bare-id restore gap (issue #146) — NOT yet implemented (security-sweep branch)

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
- **FR-006**: Private matches MUST be joinable exclusively via their non-secret match ID/shareable URL; they MUST NOT appear in the lobby listing, and unknown IDs MUST be rejected without revealing whether a private match exists. Knowing the ID permits an admission attempt only: the server still authenticates reconnects with the applicable bearer credential and authoritatively assigns seats, orders, and fog-filtered views.
- **FR-007**: When all seats fill, the server MUST atomically generate a map (feature 003), initialize the engine (feature 001), assign player ids/starting cities, and begin ticking.
- **FR-008**: On match termination, the server MUST deliver results (winner, ticks elapsed, effective map seed) to all connected participants and spectators.
- **FR-009**: The server MUST offer rematch coordination: all original participants must accept within a bounded window; acceptance creates a fresh match with identical settings and visibility type, and a newly generated seed/ID/link.
- **FR-010**: Disconnect-forfeit: if a seated player cannot be reconnected within the grace window (shared with feature 004 FR-007), the server MUST mark them forfeit; if one player remains, they win; if none remain, the match is destroyed.
- **FR-011**: Empty unstarted matches MUST be garbage-collected after a short TTL; finished matches release resources after results delivery plus a grace period.
- **FR-012**: All lifecycle transitions (created → filling → running → finished → collected) MUST be observable via protocol messages for client status displays.
- **FR-013**: Match, guest identity, session, seat, and gameplay player IDs are non-secret correlation references and MAY appear in lifecycle records, URLs, wire payloads, logs, and diagnostics. This MUST NOT expose bearer credentials, enumerate private matches, or bypass authorization. The non-secret classification covers the IDs only: the guest-identity resume secret (FR-018) and the session/reconnect/seat tokens are bearer credentials and MUST NOT appear on any of those surfaces.

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

Resolved ambiguities from the initial v1.0 draft around how players find matches and how private play is supported.

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
- **Lazy sweeps, no timers (FR-009/FR-011)**: all GC sweeps
  (rematch-window expiry, results-TTL collection, empty-match TTL) run
  on read paths (`stats()`, `listPublicMatches()`) against the injected
  clock; `sweepIntervalMs` remains a host scheduling hint. The
  empty-match and results-TTL sweeps also delete seated players'
  ephemeral sessions (SC-005 no-leak invariant). "Empty" means
  *unstarted* — per the executable Q-M06 scenario, a creator-seated
  filling match that never fills is collected after the TTL. The
  results-TTL sweep collects every `finished` match past
  `resultsTtlMs` — including matches that finished with no rematch
  offer, which would otherwise hold a `maxConcurrentMatches` slot
  forever; it runs after rematch-window expiry so an open window that
  lapses is resolved by the more specific sweep first.
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
- **`leaveMatch` implemented (US3 AC-3, feature-010 remediation R-005,
  2026-08-25)**: the throwing stub is replaced by the real body, with
  this phase table (the contract's method doc already specified the
  filling/running semantics; the rulings below cover what it left
  open):
  - *filling*: the seat is released via the SAME inline-release
    machinery as the filling-forfeit path above (seat removed,
    session's match binding cleared — its identity association fields
    persist — networking detach). The match stays `'filling'` and
    fillable; `lastActivityAtMs` is refreshed (a leave is activity).
    Releasing the FINAL seat collects the match immediately (the
    contract's "no other seated players → collected" clause) instead
    of waiting out the empty-match TTL, and deletes the just-unbound
    leaver session per the GC sweeps' SC-005 no-leak discipline.
  - *running*: a voluntary leave is an immediate forfeit with no grace
    window, delegated to the same forfeit policy as grace expiry
    (engine surrender per FR-016, forfeit stamp, detach, all-forfeited
    teardown). Counter discipline: `totalForfeits` remains US5
    disconnect-forfeit telemetry and is NOT bumped for voluntary
    leaves; a teardown still counts in `totalCollected`.
  - *finished / collected*: acknowledged no-op success — nothing live
    to release; the results-TTL / rematch policy owns the record's
    remaining lifetime.
  - Credentials: unknown id → `match_not_found` (unchanged single code
    path); token matching no seat → `session_invalid`; an
    already-forfeited (stamped) seat → idempotent `{ ok: true }`. A
    RELEASED filling seat was removed rather than stamped, so its
    stale token yields `session_invalid` on a repeat leave.
- **Feature-010 composition seams (remediation R-005, 2026-08-25)**:
  three additive surfaces live on the REAL matchmaker object, discovered
  STRUCTURALLY by consumers (same pattern as servers' optional
  `bindMatchmaker`; deliberately not part of the `Matchmaker`
  interface so legacy consumers and fakes stay untouched):
  `registerLifecycleListener(listener)` fans every networking bridge
  trigger the matchmaker processes out to registered listeners AFTER
  its own policy resolves, in registration order, without event
  synthesis for internally decided actions such as voluntary leaves
  (their consequences travel on the status bus);
  `subscribeStatus(listener)` exposes the FR-012 status bus;
  `getMatch(matchId)` exposes the authoritative store lookup. The
  runtime listener mirrors `tests/fixtures/fakeMatchmakerBridge.ts`.
- **Identity pass-through on create/join (feature-010 FR-019 via R-005,
  2026-08-25)**: `CreateMatchRequest`/`JoinMatchRequest` gain OPTIONAL
  `guestPlayerId` (structurally the lobby's branded opaque id) and
  `acceptedHandle` fields. They are supplied ONLY by the server-side
  lobby facade from the identity registry — never by clients — and
  flow into the player session and seat snapshot records; omitted
  fields store `null` (fully backward compatible). The public
  `SeatAssignment` payload is unchanged (privacy envelope FR-003/FR-024).
- **Settings-rejection detail (US3 AC-4 via R-005, 2026-08-25)**:
  invalid `createMatch` settings fail with `invalid_request` carrying
  a credential-free `detail` of `{ field, reason }` (e.g.,
  `settings.playerCount` / "must be 2, 3, or 4") so downstream
  consumers can render field-specific feedback; finite out-of-range
  board sizes remain CLAMPED, not rejected.
- **`terrainSmoothing` flows through `terrainSettings` (issue #30,
  2026-08-30)**: feature 003's `GenerationSettings` gains an additive
  `terrainSmoothing` field (default 4, range [0, 8], spec 003 FR-010).
  `MatchSettings.terrainSettings` carries it automatically via
  `DEFAULT_GENERATION_SETTINGS` — no `MatchSettings`/`DEFAULT_MATCH_SETTINGS`
  shape change, no caller changes, existing matches and rematches
  unaffected (a rematch reuses the original settings, so the smoothing
  value carries over by construction). Hosts may pass
  `terrainSettings: { terrainSmoothing: N }` at create; the clamped
  value is surfaced via `TerrainGenerationResult.effectiveSettings`
  and `MapStats.effectiveSettings` (feature 003's existing
  `effectiveSettings` pattern).

### v1.2 (2026-08-30) — Product-owner identity-visibility correction

- Player IDs and guest identity IDs are not private. Handles remain preferred
  for UI labels; a generic fallback or ID is acceptable without a handle.
  `sessionToken` and `reconnectToken` remain secret bearer credentials. As of
  v1.8 the guest-identity resume secret is likewise a secret bearer credential
  (it is not an id, and "non-secret" never covers it). Private-match
  non-enumeration and server-authoritative membership are
  unchanged. `MatchId` is a non-secret routing/admission reference, not a
  session or reconnect bearer credential. It may be shared as the private join
  reference, but knowledge of it alone grants no seat, order, or view authority.

### v1.3 (2026-09-11) — Error-code alignment with spec 004 admission hardening (issue #151)

Rationale: spec 004 v1.5 collapses match-existence error codes (`match_not_found`, `match_full`, `seat_taken`, `match_not_joinable`) into a single `match_not_joinable` on the gameplay path and introduces a shared `ProtocolErrorCode` base type with `client_` prefix for client-originated errors. Spec 006's matchmaking error surface must align with these changes.

- **FR-006 amended**: the previous FR-006 specified that unknown IDs be rejected "without revealing whether a private match exists." This is now achieved by the broader error-code collapsing in spec 004 FR-016: all admission-failure modes (unknown match, full match, seat taken, not joinable) return `match_not_joinable`. The specific text "unknown IDs MUST be rejected without revealing whether a private match exists" remains correct but is now enforced by the unified code rather than by matching specific error strings.
- **LobbyErrorCode alignment**: matchmaking's `LobbyErrorCode` union (currently a closed set of lobby-domain codes like `invalid_request`, `identity_invalid`, `match_not_found`, etc.) MUST be updated to: (a) use the shared `ProtocolErrorCode` base type from spec 004 FR-017, and (b) replace `match_not_found` with `match_not_joinable` to match the collapsed gameplay-path code. The `client_` prefix convention applies to client-originated lobby errors (e.g., `client_invalid_request` becomes `invalid_request` if it is server-originated — the `client_` prefix is reserved for rate-limit, payload-size, and similar transport-level rejections defined in spec 004).
- **`leaveMatch` error codes updated**: the `leaveMatch` method (Implementation Notes, v1.2 `leaveMatch` section) currently returns `match_not_found` for unknown IDs and `session_invalid` for token mismatches. After this change: unknown IDs return `match_not_joinable`; `session_invalid` remains (it is a credential error, not an admission error, and does not leak match existence).
- **Conformance test update**: the matchmaking conformance suite's error-code assertions MUST be updated to expect `match_not_joinable` where `match_not_found` was previously asserted on admission paths. The `leaveMatch` conformance test updates accordingly.
- **No new FRs**: the error-code alignment is a clarification of existing FR-006 semantics, not new functionality. The FR numbering in spec 006 is unchanged.

### v1.6 (2026-09-11) — 12-character NanoID-style identity lifecycle and seat binding (issue #74)

- The server-generated `GuestPlayerId` is the universal `PlayerId`: one value is created for a new guest identity and propagated unchanged through lobby, waiting match, seat, engine, wire, console, terminal result, and reconnect-grace state. Handles are labels only.
- The ID persists across reload/reconnect, seat release/reassignment, and accepted rematches while the ephemeral guest identity remains active. Clearing browser storage, server restart, expiry/collection, or retirement ends the v1 lifecycle; no durable recovery is promised.
- Future accounts may link to an existing guest identity at an explicit future boundary. Account migration, cross-device recovery, historical merge, and replacement-ID policy are out of scope and must not be guessed here.
- IDs are non-secret correlation references. Admission and privileged operations require the applicable session/reconnect bearer credential (or, for identity restore, the guest-identity resume secret — FR-018/v1.8); shareable links contain match IDs only.
- **FR-014**: Matchmaking MUST atomically assign one active 12-character NanoID-style universal ID per guest identity/seat and pass explicit IDs into engine initialization; it MUST NOT use `seatIndex + 1`.
- **FR-015**: The ID MUST persist through active reconnect, seat reassignment, and accepted rematch, and MUST be unique among active identities; collisions MUST retry or fail closed.
- **FR-016**: A bare ID MUST NOT authorize identity mutation, admission, eviction, forfeit, orders, or views; those operations require server-bound proof of possession.
- **FR-017**: Two-player browser create/join/spectate and share-link flows MUST finish through the canonical mounted router paths.

### v1.7 (2026-09-12) — Issue #139 spec consolidation (absorbed feature 012-3-4)

- **Absorbed feature 012-3-4 (3–4 player support, issue #6) — board-size defaults and validation**:
  - **012-FR-001**: Matchmaking MUST default the board size by player count: 2 players → 32×32, 3 players → 48×48, 4 players → 48×48. The single source of truth is a `BOARD_SIZE_DEFAULTS` map (`{ 2: 32, 3: 48, 4: 48 }`) in `@europa/matchmaking`; `DEFAULT_MATCH_SETTINGS.boardSize` remains 32 (the 2-player default). Per Clarifications v1.1, 64×64 is temporarily disabled; the allowed set is 32 | 48, and the map is the authoritative default source. The `contracts/board-size-defaults.ts` mirror moves from the absorbed feature directory into `006/contracts/` in the same change set.
  - **012-FR-004**: Matchmaking validation MUST continue to accept exactly 2, 3, or 4 players and reject other counts with `invalid_request` plus a `detail` message. Auto-start fires 2 seconds after the match is full, for every player count. No validation behavior changes.
- **Contract move note**: the absorbed feature's `contracts/board-size-defaults.ts` is relocated to `006/contracts/` (same change set); the conformance suite's byte-identity check re-points at the new path.

### v1.8 (2026-10-11) — Guest-identity resume secret closes the bare-id restore gap (issue #146, security-sweep)

Rationale (honest conformance record — historical record of the pre-sweep state): FR-016 (v1.6) already forbids a bare ID from authorizing identity mutation, admission, eviction, forfeit, orders, or views — but as of the 2026-10-11 amendment the shipped implementation still restored a grace-window identity from a bare `guestPlayerId` claim (`identityRegistry.restoreIdentity` via `lobbyService`), and handle rename/leave then rode that restored binding. The implementation was therefore non-conformant with the spec's own intent (pre-sweep); this amendment does not weaken FR-016, it supplies the missing credential the restore path must demand. The earlier fix that stopped ACTIVE-holder eviction (active claim → mint fresh) stays; it never covered the grace window, which is exactly the takeover window.

- **FR-018**: Matchmaking MUST mint a per-identity guest resume secret at identity creation, regenerate it on every successful restore (so a captured secret is single-epoch), and deliver it ONLY to the owning connection through the directed identity event (spec 004 v1.11 FR-026 wire surface). Identity restore from a reconnect grace window, handle rename, and voluntary seat release MUST require either the correct resume secret or an existing server-bound session/reconnect/seat bearer credential. An id-only claim — with or without a matching handle, in grace or otherwise — MUST be treated as advisory: the server mints a fresh identity and MUST NOT mutate, reactivate, rename, evict, forfeit, or release anything. Sole exception: the same-connection idempotent refresh recorded below — authority there is the existing connection binding, never the id. An active holder MAY be superseded only by a claim carrying the matching resume secret (the owner's own reload); the superseded connection loses its lobby binding and spectator subscription immediately, and the rotation locks it out of every future restore (2026-10-12 sub-entry below). The resume secret is a bearer credential: it MUST NOT appear in public projections, roster events, logs, diagnostics, URLs, or documentation examples, and the durable documentation-privacy check (spec 010) MUST reject it like any other credential.
  - 2026-10-11 (Gate 2 re-entry; PO ruling — same-connection idempotent refresh; mirrors spec 004 v1.11 FR-027): when an id-only claim arrives on the connection ALREADY bound to that identity and the identity is active (not in a reconnect grace window), matchmaking MAY keep the existing binding as an idempotent refresh — no fresh identity is minted, no grace window starts, and nothing is reactivated, renamed, released, evicted, or superseded. The authority for keeping the binding is the pre-existing connection binding (established at first mint by the connection's own establishment, or at bind time via the resume secret or a session/reconnect credential); the claim's id stays advisory and grants nothing. The exception MUST NOT apply to any other connection claiming that id (mint fresh, even for an active identity), MUST NOT apply in grace (restore still requires the resume secret), and MUST NOT authorize rename or leave on that connection — those keep FR-018's credential requirements. This preserves the shipped refresh behavior pinned by the lobby-facade suite ("re-establishing the SAME identity starts no spurious grace window") without opening a takeover path for any other connection.
  - 2026-10-12 (supersession-clause precision; layering ruling): supersession is delivered by credential rotation + binding eviction, not by socket severing. A superseding claim carrying the matching secret ROTATES the record's resume secret (`identityRegistry.restoreIdentity`: verify → reactivate → rotate → deliver), so the superseded holder is locked out of every future restore regardless of socket state; and `bindConnection` evicts the stale connection's lobby binding and spectator subscription immediately, so an open-but-evicted connection can act as nothing. The rotation lockout is the reason an open-but-evicted socket is inert. Socket-level severing remains the match-server's semantic for single-seat token re-claims (spec 004 edge case) — a different layer, and out of the lobby facade's reach: `LobbyServiceDeps` exposes only `deliver` as its transport seam, no close seam exists, and this amendment adds none. This does not weaken FR-018: the superseded connection must still lose its binding and subscription immediately.
- **Prose reconciliation**: the "IDs are non-secret correlation references" statements in FR-013, v1.2, and v1.6 remain true and unchanged in meaning — they classify the ID, never the resume secret. The specs said the ID grants no authority (FR-016); the implementation made it grant authority. The implementation is what changes.
- **Behavioral compatibility**: pre-amendment clients that send id-only claims receive a fresh identity on reload (establishment never fails, matching the v1.6/feature-010 contract); identity churn on reload is the accepted cost of removing the impersonation path until those clients send the secret. No `NETWORK_API_VERSION` bump (additive fields only — spec 004 v1.11).
- **Test expectations**: matchmaking identity-registry and lobby-service suites that currently assert grace restore from a bare id MUST be updated to assert mint-fresh for id-only claims arriving on any OTHER connection (including against an active identity) and for grace-window claims without the resume secret, and restore for secret-bearing claims. The existing same-connection pin — the lobby-facade suite's "re-establishing the SAME identity starts no spurious grace window" — MUST be preserved unchanged: it pins the sole carve-out in the 2026-10-11 FR-018 entry (scoped 2026-10-11, Gate 2 re-entry), and "mint-fresh for bare claims" never directed its rewrite. Feature-010 acceptance coverage (SC-010 reconnect trials) MUST drive reload-restore through the stored secret end-to-end.
