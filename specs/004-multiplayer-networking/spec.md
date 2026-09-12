# Feature Specification: Real-Time Multiplayer Networking

**Feature Branch**: `004-multiplayer-networking`

**Created**: 2026-08-21
**Last Updated**: 2026-09-11 (v1.9; 12-character universal player identity)
**Version**: 1.9

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
- **FR-007**: Sessions MUST be identified by an opaque bearer token issued at join; reconnection MUST present that token to reclaim a seat within the timeout window. `GuestPlayerId`, gameplay `PlayerId`, and `MatchId` values are not substitutes for the session/reconnect credential.
- **FR-008**: The server MUST apply received orders at tick boundaries in deterministic order (per feature 001 FR-017).
- **FR-009**: The server MUST enforce heartbeat/timeouts: silent clients are marked disconnected, seats reclaimed per policy after the grace window.
- **FR-010**: The server MUST rate-limit inbound frames per client for ALL frame kinds (order, lobby, hello, ping, and any future additions) using configurable per-connection rate buckets (token-bucket or leaky-bucket, tunable capacity and refill interval). Excess frames MUST be dropped with an error message; the connection MUST NOT be severed for rate-limit violations alone.
- **FR-011**: Protocol message definitions MUST live in a shared TypeScript package used by both server and client (single source of truth).
- **FR-012**: The server MUST enforce a configurable global connection cap and a configurable per-IP connection cap. When either cap is reached, new WebSocket upgrade requests MUST be rejected with an HTTP 429 (Too Many Requests) before the WebSocket handshake completes. Both defaults MUST be documented; the per-IP default MUST be sufficient for normal multi-tab use (≥5).
- **FR-013**: The server MUST validate the `Origin` header on WebSocket upgrade requests against a configurable allowlist (`allowedOrigins`). When the list is non-empty, connections from origins not in the list MUST be rejected with HTTP 403 before the handshake. The default list MUST be empty (all origins allowed) for local development, but deployments behind a reverse proxy SHOULD set it to the deployed origin.
- **FR-014**: The server MUST attach an error event listener to every WebSocket instance (`wss.on('error', ...)`) that logs the error without throwing or crashing the process. Connection-level errors MUST be handled gracefully and the socket MUST be closed if still open.
- **FR-015**: The server MUST enforce configurable maximum lengths for player display names (handles) and guest identity strings. Names exceeding the cap MUST be rejected at the lobby/hello handshake with an actionable error; the server MUST NOT silently truncate. Defaults: handles ≤ 32 characters, identity strings ≤ 128 characters.
- **FR-016**: The server MUST collapse match-existence error codes on the gameplay path. When a client attempts to join, spectate, or interact with a match that does not exist, is full, has the seat taken, or is not joinable, the server MUST respond with a single generic error code (`match_not_joinable`) regardless of the underlying reason. The server MUST NOT echo back the raw client-supplied match ID in the error payload. This prevents existence oracle attacks where an attacker distinguishes "match not found" from "match full" to probe private-match existence.
- **FR-017**: All protocol error codes MUST share a documented base type with a `client_` prefix for client-originated errors (e.g., `client_rate_limited`, `client_payload_too_large`). Server-originated errors (e.g., `internal_error`) retain their unprefixed names. The shared base type MUST be defined once in the networking protocol package and re-exported by all packages that define domain-specific error subsets (matchmaking, lobby).

### Key Entities *(include if feature involves data)*

- **Session**: authenticated connection bound to at most one player seat or spectator role; token + expiry.
- **ProtocolMessage**: versioned envelope { type, version, seq, payload }.
- **ProtocolErrorCode**: shared base type for all protocol error codes, defined in the networking protocol package. Client-originated errors use `client_` prefix (e.g., `client_rate_limited`); server-originated errors are unprefixed (e.g., `internal_error`). Domain-specific packages re-export subsets from this base.
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
- **SC-005**: A server sustains the default 250 ms tick cadence under continuous scripted load — over a ~10 s soak at production cadence: zero dropped ticks, median per-tick processing well under the 15 ms per-tick budget, p99 within a generous regression guard, and every submitted order acknowledged exactly once (measurement protocol in Clarifications v1.1). Multi-match concurrency (≥10 concurrent matches, 20+ sockets) remains covered by MatchRegistry unit tests. The broadcast phase (fog computation + delta encoding + serialization for all connections) MUST complete in under 5 ms total per tick (Clarifications v1.6).

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
 - 2026-08-26 (feature 010 Clarifications v1.6): the wire-mirrored `IdentityState` gains an additive OPTIONAL `guestPlayerId?: GuestPlayerId`; clients tolerate its absence and the field does not grant authority. The identity-visibility correction below makes clear that IDs are non-secret correlation data. Bearer credentials, private-match existence, and fog-filtered state remain protected.

### v1.4 (2026-08-30) — Product-owner identity-visibility correction

- Guest identity IDs and gameplay `PlayerId` values may be carried in wire payloads and diagnostics for correlation. They do not change authorization or fog filtering. `sessionToken` and `reconnectToken` remain bearer credentials and MUST NOT be logged or placed in risky URLs/documentation examples.
- `MatchId` is a non-secret routing/admission reference, not a session or reconnect bearer credential. A client that knows one may attempt admission to the corresponding private match, but the ID alone grants no seat, order, or view authority; the server still resolves admission, seat ownership, orders, and fog-filtered views. Unknown-ID handling remains generic so private-match existence is not enumerable.
- The bearer-credential URL rule applies to public application URLs and documentation, logs, and diagnostics. The temporary/local `pnpm host` operator flow is a narrow exception: it may print tokenized join URLs for local seat handoff. Those URLs remain bearer secrets and this operator convenience does not authorize credential-bearing URLs elsewhere.

### v1.5 (2026-09-11) — Admission hardening + existence oracle collapse (issue #151, code review I-20 Thread T-09)

Rationale: code review identified seven hardening gaps — no connection cap, unthrottled hello/ping, no WebSocket origin validation, missing `wss` error listener, unbounded identities, distinguishable error codes enabling existence oracle attacks, and per-package error unions with no shared base. These are all P1 security requirements.

- **FR-010 rewritten** from order-only rate limiting to ALL-frame-kind rate limiting. The previous FR-010 only covered `order` and `lobby*` frames; an attacker could flood hello, ping, or any future frame kind without triggering the bucket. The new FR-010 mandates per-connection inbound rate buckets for every frame kind, with configurable capacity and refill interval (token-bucket or leaky-bucket). Rate-limit violations drop the frame with an error but do NOT sever the connection — a brief burst is normal browser behavior (e.g., tab-reload floods hello + subscribe).
- **FR-012 added** — global and per-IP connection caps. Before the WebSocket handshake, the server counts active connections (global) and connections from the requesting IP. Either cap exceeded → HTTP 429 with `Retry-After` header. Defaults: global = 1000, per-IP = 10 (configurable). The per-IP default of 10 accommodates normal multi-tab use (typical browser allows 6 concurrent connections per host; a developer with two browser windows hits ≤12). The global cap prevents memory exhaustion under sustained load; the per-IP cap prevents single-attacker flooding.
- **FR-013 added** — WebSocket origin validation. The `Origin` header is checked against `allowedOrigins` (a configurable string set). Empty list = all origins allowed (local dev default). Non-empty list = only listed origins accepted; others get HTTP 403 before the handshake. This is the standard WebSocket CSRF mitigation; deployments behind a reverse proxy should set it to the deployed origin.
- **FR-014 added** — `wss.on('error')` listener. Every WebSocket instance gets an error handler that logs the error (at warn level) and closes the socket if still open. This prevents uncaught exceptions from propagating to the process level and crashing the server. The handler does NOT re-throw.
- **FR-015 added** — identity/handle length caps. Handles are capped at 32 characters, identity strings at 128 characters (both configurable). Exceeding the cap returns an actionable error at handshake time — no silent truncation. This prevents memory exhaustion via millions of unique long strings; the cap is generous enough for any reasonable name.
- **FR-016 added** — error-code collapsing for match existence. Previously, four distinct error codes existed on the gameplay join path: `match_not_found`, `match_full`, `seat_taken`, `match_not_joinable`. An attacker could probe whether a private match exists by distinguishing "not found" from "full" or "seat taken." FR-016 collapses all four into a single `match_not_joinable` code, and the server does NOT echo the raw client-supplied match ID. The only distinction preserved: `token_invalid`/`token_expired`/`token_mismatch` (authentication errors, which are bearer-credential related and do not leak match existence) and `spectator_readonly` (authorization, not admission). This aligns with the existing FR-006 "unknown IDs MUST be rejected without revealing whether a private match exists" principle but extends it to all admission-failure modes.
- **FR-017 added** — shared error-code base. `NetworkErrorCode` and `LobbyErrorCode` currently exist as separate closed unions with overlapping names but no common prefix. FR-017 mandates a shared `ProtocolErrorCode` base type defined in the networking protocol package, with a `client_` prefix for client-originated errors (e.g., `client_rate_limited`, `client_payload_too_large`) and unprefixed names for server-originated errors (e.g., `internal_error`). Domain-specific packages (matchmaking, lobby) re-export their subsets from this base. This prevents accidental name collisions and makes error provenance clear from the code string alone.
- **Backward compatibility**: FR-016 is a breaking change to the error-code surface (codes are removed from the gameplay path). This warrants a major version bump of `NETWORK_API_VERSION` when the change ships. Old clients receiving `match_not_joinable` for a formerly `match_full` scenario will still get an actionable error; the only behavioral change is that the distinction is lost — which is the security goal. FR-017 introduces the `client_` prefix convention; existing codes like `rate_limited` become `client_rate_limited` (the old unprefixed code is removed). Pre-amendment clients that do not recognize the new codes MUST handle them generically (per FR-004's "unknown message kinds" clause).
- **Contract changes (breaking)**: the `ErrorCode` union in both contract mirrors is updated: `match_not_found`, `match_full`, `seat_taken`, `match_not_joinable` collapsed to `match_not_joinable`; `rate_limited` → `client_rate_limited`; new `client_payload_too_large` added. Both mirrors (`packages/networking/src/contracts/wire-types.ts` and `specs/004-multiplayer-networking/contracts/wire-types.ts`) MUST be updated in the same change set.
- **Test expectations**: integration tests that assert specific error codes for match-full or seat-taken scenarios MUST be updated to expect `match_not_joinable`. The conformance suite's union exhaustiveness check is updated automatically by the new union shape.

### v1.6 (2026-09-11) — Hot-path performance (issue #135, code review I-28 Thread T-14)

Rationale: code review identified four hot-path performance bottlenecks — per-tick typed-array allocation in the engine, redundant fog-view computation + JSON-stringify in broadcast, view recomputation on resync, and O(n²) BFS in terrain validation. These are P1 enhancement requirements that affect tick cadence and broadcast latency.

- **FR-010 performance extension**: the rate-bucket implementation MUST use pre-allocated arrays and avoid per-frame object allocation on the hot path. The bucket state per connection is a fixed-size struct (capacity, tokens, last-refill-epoch); frame processing reads/writes these fields without creating intermediate objects.
- **FR-018 added** — broadcast view reuse. When broadcasting tick deltas to multiple clients in the same match, the server MUST compute the fog-filtered view once per tick (not once per connection per tick). The shared view is then serialized individually per connection (each connection may have a different fog boundary). This reduces the per-tick broadcast cost from O(players × cells) to O(cells + players × visible-cells).
- **FR-019 added** — resync view reuse. When a reconnecting client requests a full snapshot, the server MUST reuse the most recently computed broadcast view for that player (or compute it once if none is cached). The resync path MUST NOT trigger a second independent fog-computation pass. The cached view is valid until the next tick boundary; after that, the new tick's broadcast view replaces it.
- **FR-020 added** — structural view comparison for delta encoding. When computing per-tick deltas (FR-006), the server MUST use structural comparison (field-by-field equality check on the view objects) rather than JSON.stringify-based comparison. JSON.stringify comparison allocates a string per cell per tick; structural comparison operates on the typed arrays directly and short-circuits on the first difference.
- **No contract change**: these are internal performance optimizations. The wire protocol, `TickDelta`, `Snapshot`, and `ProtocolMessage` types are unchanged. Callers see identical behavior with lower latency.
- **Performance target**: at production cadence (250 ms ticks) with a 32×32 2-player board, the broadcast phase (fog computation + delta encoding + serialization for all connections) MUST complete in under 5 ms total (SC-005 budget). The resync path MUST complete in under 10 ms (SC-003 unchanged).

### v1.9 (2026-09-11) — 12-character NanoID-style universal player identity and authentication boundary (issue #74)

- Gameplay `playerId` fields, seat assignments, order attribution, snapshots, deltas, events, and reconnect associations carry the universal 12-character NanoID-style string equal to the lobby `GuestPlayerId`; numeric IDs are invalid. Spectators remain `null` where nullable.
- `sessionToken`/`reconnectToken` remain separate bearer credentials. The universal ID is never accepted as proof of possession, seat claim, reconnect credential, or authorization input; client claims are advisory and server resolution is authoritative.
- `NETWORK_API_VERSION` receives a breaking major-version bump. Mismatched versions are rejected before payload interpretation; no numeric compatibility shim or mixed-version gameplay channel exists. Both contract mirrors and fixtures change together.
- **FR-021**: Gameplay identity fields MUST use canonical 12-character NanoID-style strings; numeric identity payloads MUST be rejected.
- **FR-022**: A universal ID MUST NOT authenticate, claim a seat, reconnect, submit orders, or select a view without the server-bound bearer credential.
- **FR-023**: The major wire-version bump MUST reject old-version/numeric clients before payload interpretation; no compatibility shim is required.
- **FR-024**: Authoritative ID ordering MUST use explicit UTF-16 code-unit comparison and round-trip byte-stably.
- **FR-025**: The canonical accepted form is exactly `[A-Za-z0-9_-]{12}` (72 bits). The server MUST generate IDs with CSPRNG-backed rejection sampling; collisions retry or fail closed. The identifier is not a time/order token, and no runtime `nanoid` dependency is required because it is absent from direct package manifests.
