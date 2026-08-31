# Feature Specification: Real-Time Multiplayer Networking

**Feature Branch**: `004-multiplayer-networking`

**Created**: 2026-08-21
**Last Updated**: 2026-08-30 (v1.4; feature 013 identity-visibility policy)
**Version**: 1.4

**Status**: Implemented

**Input**: User description: "Server-authoritative WebSocket protocol connecting clients to running matches: command submission, per-tick state broadcast with fog-of-war filtering, delta sync, and reconnection handling."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authoritative Real-Time Match Channel (Priority: P1)

As a player, I want my orders to reach the server and the resulting game state to stream back to me every tick, so that both players experience the same authoritative match in real time.

**Why this priority**: This is the transport backbone — nothing user-facing works without it.

**Independent Test**: Can be tested with two scripted WebSocket clients against a server hosting a headless match: send commands, receive tick payloads, assert ordering and content.

**Acceptance Scenarios**:

1. **Given** a running 2-player match, **When** a client sends a valid pipe order, **Then** the server acknowledges it and the effect appears in the next tick payload.
2. **Given** a running match, **When** ticks elapse, **Then** each client receives exactly one state update per tick, filtered to its fog-of-war view (feature 002).
3. **Given** a client sends an invalid order (e.g., pipe into water), **When** the server processes it, **Then** the order is rejected with an error message and game state is unaffected.

---

### User Story 2 - Reconnection With State Resync (Priority: P2)

As a player, I want to reload or reconnect mid-match and resume where I left off within seconds, so that a browser refresh or network blip doesn't destroy a 20-minute game.

**Why this priority**: Robustness essential for hosted play, but buildable only on top of a working channel (Story 1).

**Independent Test**: Can be tested by disconnecting a client mid-match, reconnecting with its session token, and asserting it receives a full snapshot then continues per-tick updates.

**Acceptance Scenarios**:

1. **Given** a connected player drops mid-match, **When** they reconnect with valid session credentials within the timeout window, **Then** they receive a full current-state snapshot and subsequent tick deltas.
2. **Given** a disconnected player whose timeout expires, **When** the timeout elapses, **Then** their forces are handled per the disconnect policy (see Edge Cases) and the match continues for remaining players.

---

### User Story 3 - Late-Join Spectating (Priority: P3)

As an observer, I want to attach to a running match as a spectator and receive full-visibility updates, so that others can watch games in progress.

**Why this priority**: Completes the social layer; depends on stable match channels.

**Independent Test**: Can be tested by attaching a third client as spectator mid-match and asserting full-board payloads without order rights.

**Acceptance Scenarios**:

1. **Given** a running match, **When** a spectator connects, **Then** they receive a full snapshot and all subsequent ticks unfiltered, and any order they send is rejected.

---

### Edge Cases

- What happens when commands arrive between ticks? → They queue and apply at the next tick boundary in deterministic arrival order.
- What happens when two clients claim the same player seat? → Session tokens are single-seat; a second claim invalidates the first (old socket closed).
- What happens when the server restarts mid-match? → v1: matches are in-memory; clients receive a "match lost" notice. Persistence is out of scope.
- What happens when a client floods orders? → Server enforces per-client rate limits; excess orders are dropped with warnings.
- What happens when payloads would exceed size limits? → Delta encoding keeps per-tick payloads small; full snapshots occur only on join/resync.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All client-server communication MUST run over WebSocket with JSON text frames carrying typed protocol messages.
- **FR-002**: The server MUST be fully authoritative: clients render state and submit orders only; no client message may directly mutate state outside validation.
- **FR-003**: The protocol MUST include: hello/authenticate, join-match, order submission (typed per feature 001's order set), per-tick state delta, full snapshot, error/acknowledgment, and match-terminal messages.
- **FR-004**: Every protocol message MUST carry a schema version field; servers MUST reject mismatched major versions gracefully. This protocol version is the wire compatibility contract only — it is distinct from the application version (the release identity carried additively by `HelloAckPayload.appVersion`, feature 009-shared-app-versioning): neither implies the other, and no code path may derive one from the other (see Clarifications v1.2).
- **FR-005**: Per-tick broadcasts MUST be filtered through each recipient's fog-of-war view before transmission (server-side enforcement).
- **FR-006**: Tick payloads MUST be deltas (changed cells/events only) relative to the recipient's last known state; recipients MUST be able to request or be given a full snapshot on desync.
- **FR-007**: Sessions MUST be identified by an opaque token issued at join; reconnection MUST present the token to reclaim a seat within the timeout window.
- **FR-008**: The server MUST apply received orders at tick boundaries in deterministic order (per feature 001 FR-017).
- **FR-009**: The server MUST enforce heartbeat/timeouts: silent clients are marked disconnected, seats reclaimed per policy after the grace window.
- **FR-010**: The server MUST rate-limit order submissions per client (tunable) and drop excess with an error message.
- **FR-011**: Protocol message definitions MUST live in a shared TypeScript package used by both server and client (single source of truth).

### Key Entities *(include if feature involves data)*

- **Session**: authenticated connection bound to at most one player seat or spectator role; token + expiry.
- **ProtocolMessage**: versioned envelope { type, version, seq, payload }.
- **HelloAckPayload**: server→client greeting response { protocolVersion, connectionId, heartbeatIntervalMs, appVersion? }; the additive optional `appVersion` string (feature 009-shared-app-versioning) carries the server's release identity — presence indicates a feature-009-generation server, clients MUST tolerate its absence, and it is never derived from or related to `protocolVersion`.
- **OrderMessage**: validated wire form of engine orders.
- **TickDelta**: changed-cell list + events, already fog-filtered per recipient.
- **Snapshot**: complete PlayerView (or full board for spectators) for join/resync.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two scripted clients complete a full scripted match (orders in, deltas out) with zero protocol errors over ≥5,000 ticks.
- **SC-002**: Order-to-acknowledgment round trip is under 100 ms on localhost/LAN.
- **SC-003**: Reconnect-to-first-payload is under 2 seconds for a default-size match.
- **SC-004**: A 500-tick audit shows zero fog-of-war violations in any transmitted payload (cross-check with feature 002 SC-001).
- **SC-005**: A server sustains the default 250 ms tick cadence under continuous scripted load — over a ~10 s soak at production cadence: zero dropped ticks, median per-tick processing well under the 15 ms per-tick budget, p99 within a generous regression guard, and every submitted order acknowledged exactly once (measurement protocol in Clarifications v1.1). Multi-match concurrency (≥10 concurrent matches, 20+ sockets) remains covered by MatchRegistry unit tests.

## Assumptions

- Matches are held in memory; server persistence/restart recovery is explicitly out of scope for v1.
- Authentication is session-scoped (token issued at join); persistent accounts are out of scope (feature 006).
- Clients are tolerant of brief disconnections via auto-retry; mobile/unstable networks are not the v1 target.
- TLS termination is a deployment concern (reverse proxy), not part of this feature.

## Clarifications

### v1.1 (2026-08-22) — SC-005 measurement hardening + polish-wave test scope

- 2026-08-22: SC-005 measurement hardened — a timed "≥10 concurrent matches without >10% degradation" soak is flaky on shared CI runners for the same reason feature 002 SC-004 was (scheduler stalls dominate wall-clock tails). SC-005 now verifies cadence stability directly: one match at the production 250 ms cadence rides a ~10 s window (~38 tick broadcasts) and asserts zero dropped ticks (contiguous numbering), median per-tick processing < 15 ms (the plan's per-tick budget), p99 under a deliberately generous 100 ms regression guard, and deterministic drain intact (every submitted order acked exactly once with `ok: true` and echoed seq). Concurrency safety stays with MatchRegistry unit tests.
- 2026-08-22: Polish-wave test scope trimmed — version-policy enforcement and rate limiting are pinned by end-to-end integration tests over the real wire path (error frame code + close code 1008; bucket capacity/burst/refill semantics via injected clock) instead of additional unit-level variants; the integration layer already exercises the same code paths and shared fixtures keep maintenance cost down.

### v1.2 (2026-08-25) — Additive `appVersion` on `HelloAckPayload` (feature 009-shared-app-versioning)

- 2026-08-25: The server→client hello acknowledgment gains an additive optional `appVersion: string`, populated at the sole helloAck construction site from the shared `APP_VERSION` constant (`@europa/version`). Presence indicates a server of feature-009 generation or later; clients MUST tolerate its absence, and pre-feature clients ignore the unknown field (additive compatibility — no major bump of `NETWORK_API_VERSION`). It is release identity only: never derived from or compared against `protocolVersion`, and FR-004's `validateVersion` semantics are untouched. Pinned by integration test: the ack carries `APP_VERSION`; `appVersion` and `protocolVersion` hold independent values simultaneously; a raw old client completes the handshake and claims a seat; the envelope is otherwise byte-stable (contract key order + decode→encode round trip).

### v1.3 (2026-08-25) — Additive lobby message family (feature 010-public-lobby-match-browser)

- 2026-08-25: The wire protocol gains a closed additive `lobby*` message family per feature 010's approved contract (`specs/010-public-lobby-match-browser/contracts/lobby-wire.md`): client→server `lobbyIdentity`, `lobbySetHandle`, `lobbySubscribe`, `lobbyCreate`, `lobbyJoin`, `lobbySpectate`, `lobbyLeave`; server→client `lobbyEvent`. All ride the existing `ProtocolEnvelope`; every gameplay payload declared by this specification is byte-for-byte unchanged, so FR-001..FR-011 semantics and FR-004's breaking boundary do not move (`NETWORK_API_VERSION` is NOT bumped for the family's introduction). Normative policy, mirrored in both canonical contract copies: recipients MUST ignore unrecognized message kinds and unrecognized additive `LobbyEvent` variants; a lobby frame reaching a peer without lobby support gets a graceful actionable error while the connection stays open; the server delivers `lobbyEvent` frames ONLY to connections that opted in via `lobbySubscribe`, so gameplay-only clients never observe lobby traffic; identity/handle/seat resolution is server-authoritative with client-supplied claims advisory. The domain shapes (`GuestIdentityClaim`, `LobbySnapshot`, `LobbyEvent`, etc.) are wire-mirrored in the networking contract because matchmaking depends on networking — mutual assignability between the mirror and matchmaking's feature-010 implementation contracts is pinned by conformance fixtures. Pinned by tests: kind↔payload exhaustiveness over the extended union (twenty kinds), structural conformance of both copies against the lobby-wire.md transcription, schema admission of minimal valid lobby envelopes, and unchanged gameplay-kind behavior.
 - 2026-08-26 (feature 010 Clarifications v1.6): the wire-mirrored `IdentityState` gains an additive OPTIONAL `guestPlayerId?: GuestPlayerId`; clients tolerate its absence and the field does not grant authority. See feature 013 for the later policy that IDs are non-secret correlation data. Bearer credentials, private-match existence, and fog-filtered state remain protected.

### v1.4 (2026-08-30) — Relaxed player-ID visibility policy (feature 013)

- Guest identity IDs and gameplay `PlayerId` values may be carried in wire payloads and diagnostics for correlation. They do not change authorization or fog filtering. `sessionToken` and `reconnectToken` remain bearer credentials and MUST NOT be logged or placed in risky URLs/documentation examples.
