/**
 * Feature 004 — Multiplayer Networking & Transport
 *
 * Transport-layer types (frames, sequence numbers, payload-kind discriminators).
 *
 * Feature 004 declares its OWN transport-layer types here and RE-EXPORTS
 * the canonical engine and fog types it depends on. The engine's
 * `engine-to-networking.ts` and fog's `fog-to-networking.ts` are the
 * source of truth for the payload bodies that ride inside these envelopes;
 * this file declares only what is specific to the wire transport.
 *
 * Rules for this file:
 *   - All types are readonly outside networking internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Integer-only numeric fields (sequence numbers, timestamps in ms).
 *   - Every message on the wire is one of these envelopes, never a bare object.
 *
 * Feature 010 (public lobby & match browser) extends this file with an
 * ADDITIVE `lobby*` message family; see the feature-010 section below.
 * Its design source of truth is
 * `specs/010-public-lobby-match-browser/contracts/lobby-wire.md`.
 */

// Engine type used directly by this module's declarations
// (`ServerConnection.playerId`, `JoinAckPayload.playerId`). The
// consumer-facing re-export block lives at the bottom of this file.
import type { PlayerId } from '@europa/engine';

// ----------------------------------------------------------------------------
// Network API version (mirror of engine/fog versioning discipline)
// ----------------------------------------------------------------------------

/**
 * Current networking wire-protocol version. Increment on any breaking
 * change to the wire format or to the set of message kinds.
 *
 * Versioning strategy:
 *   - `NETWORK_API_VERSION` is the *wire-protocol* version, distinct
 *     from `ENGINE_API_VERSION` and `FOG_API_VERSION`. Networking can
 *     bump its own version without forcing an engine/fog rebuild, as
 *     long as payload bodies stay compatible.
 *   - Every envelope carries a `version` field (matches engine's
 *     `ProtocolEnvelope.version`). Server rejects mismatched major versions
 *     per feature 004 FR-004.
 */
export const NETWORK_API_VERSION = '0.1.0' as const;

// ----------------------------------------------------------------------------
// Branded primitives
// ----------------------------------------------------------------------------

/**
 * Opaque session token issued at `joinMatch` time. Used to reclaim a
 * seat on reconnect (feature 004 FR-007).
 *
 * 36-character v4 UUID string (minted by the platform CSPRNG via
 * `crypto.randomUUID()`). Branded as a nominal type so it cannot be
 * confused with arbitrary strings.
 */
export type SessionToken = string & { readonly __brand: 'SessionToken' };

/**
 * Match identifier (matches the matchmaking-issued id; networking uses
 * it only as a routing key).
 */
export type MatchId = string & { readonly __brand: 'MatchId' };

/**
 * Connection identifier. Assigned by the server when a WebSocket
 * connects; distinct from `SessionToken` (a connection id is the
 * transport handle, a session token is the seat claim).
 */
export type ConnectionId = string & { readonly __brand: 'ConnectionId' };

/**
 * Per-session sequence number. Monotonic per (session, direction).
 * `clientSeq` is stamped by the client on outbound messages (orders);
 * `serverSeq` is stamped by the server on outbound messages (acks,
 * ticks, snapshots). Used for:
 *   - order ack correlation (`OrderAckPayload.seq` ↔ `OrderSubmissionPayload.seq`)
 *   - detecting duplicate orders on reconnect
 *   - detecting dropped ticks on the client (client tracks last seen seq)
 *
 * Integer (uint32 — but JS `number` is the wire representation per spec
 * FR-001 JSON). Replay-safe: starts at 1 per session.
 */
export type SequenceNumber = number & { readonly __brand: 'SequenceNumber' };

// ----------------------------------------------------------------------------
// Connection role
// ----------------------------------------------------------------------------

/**
 * What kind of presence a connection has bound itself to.
 *
 * - `player`: claimed a player seat in a match; can submit orders for
 *   that player; receives per-tick `PlayerView` filtered to their horizon.
 * - `spectator`: attached to a running match without a seat; receives
 *   full-board per-tick view; cannot submit orders (feature 004 FR
 *   rejection rule, see spec US3 AC-1 + fog-to-networking.ts).
 *
 * Note: matchmaking-issued session is the *matchmaking* presence. A
 * match session can have multiple connections (one player + zero or
 * more spectators bound to the same match id). The role distinction
 * is per-connection, not per-match.
 */
export type ConnectionRole = 'player' | 'spectator';

// ----------------------------------------------------------------------------
// Connection state machine
// ----------------------------------------------------------------------------

/**
 * Lifecycle states a connection traverses. Transitions are server-side
 * only; the client never declares its own state.
 *
 * ```
 *   ┌──────────┐  hello(version)        ┌───────────┐
 *   │ pending  │ ─────────────────────▶ │  greeted  │
 *   └──────────┘                        └─────┬─────┘
 *                                              │ joinMatch(token?|new)
 *                                              ▼
 *                                        ┌──────────┐
 *                                        │  joined  │  (session token issued)
 *                                        └────┬─────┘
 *                  ws disconnect              │   reconnect(token)
 *                  ┌───────────────────────────┘
 *                  ▼
 *   ┌──────────────────────┐  reconnect within window  ┌─────────────┐
 *   │ disconnected         │ ────────────────────────▶ │ rejoined    │
 *   │  (token still valid) │                           └─────────────┘
 *   └──────────┬───────────┘
 *              │ grace window expired
 *              ▼
 *   ┌──────────────────────┐
 *   │ expired              │  → matchmaking marks seat forfeit
 *   └──────────────────────┘
 *
 *   Terminal transitions (always end a connection):
 *   - any state → `closed` on explicit close
 *   - `joined`/`rejoined` → `terminal` on match end
 * ```
 */
export type ConnectionState =
  /** WebSocket open, no hello yet. Server holds the connection but does nothing with inbound messages. */
  | 'pending'
  /** Hello received, version accepted, awaiting `joinMatch` or `reconnect`. */
  | 'greeted'
  /** Session token issued; receiving ticks; may submit orders (player role). */
  | 'joined'
  /** Reconnected with valid token; resyncing snapshot then receiving ticks. */
  | 'rejoined'
  /** WebSocket lost; server retains token until grace window expires. */
  | 'disconnected'
  /** Grace window expired; matchmaking has been notified to apply forfeit policy. */
  | 'expired'
  /** Match ended; `TerminalPayload` already delivered; awaiting close. */
  | 'terminal'
  /** Closed explicitly (client or server); no further messages. */
  | 'closed';

// ----------------------------------------------------------------------------
// Per-connection state (server-side; not on the wire)
// ----------------------------------------------------------------------------

/**
 * Server's view of one WebSocket connection. NOT on the wire —
 * declared here for type-safety in `Server`/`Session` implementations
 * and tests.
 *
 * Note: this is the *networking* layer's connection record. It is
 * separate from matchmaking's `Seat` record (which holds the durable
 * seat→player binding across disconnect) and from the engine's
 * `EngineSession` (which holds the `World`). Three layers, three
 * records, linked by `MatchId` and `PlayerId`.
 */
export interface ServerConnection {
  readonly id: ConnectionId;
  readonly matchId: MatchId;
  readonly role: ConnectionRole;
  readonly playerId: PlayerId | null; // null for spectators
  readonly state: ConnectionState;
  readonly sessionToken: SessionToken | null; // null until joined
  readonly clientSeq: SequenceNumber; // last seen client seq
  readonly serverSeq: SequenceNumber; // last sent server seq
  /** Epoch ms of last inbound message (heartbeat / order / ping). */
  readonly lastSeenAtMs: number;
  /** Epoch ms of last outbound message (any kind). */
  readonly lastSentAtMs: number;
  /** Connection-scoped rate-limit bucket (orders only). */
  readonly rateBucket: RateLimitBucket;
}

// ----------------------------------------------------------------------------
// Rate limiting (FR-010)
// ----------------------------------------------------------------------------

/**
 * Per-connection order rate-limit state. Token-bucket algorithm:
 *   - Bucket capacity = `maxOrdersPerSecond * burstFactor`.
 *   - Refill rate = `maxOrdersPerSecond` tokens per second.
 *   - Each accepted order consumes 1 token.
 *   - Excess orders are dropped with an `ErrorPayload` of code
 *     `'rate_limited'` and do not advance the world's pending-order queue.
 *
 * Networking-side only. Heartbeats and snapshots do NOT consume tokens.
 */
export interface RateLimitBucket {
  readonly capacity: number;
  readonly refillPerSec: number;
  /** Tokens currently available (float; refilled lazily on each check). */
  readonly tokens: number;
  /** Epoch ms of last refill calculation. */
  readonly lastRefillAtMs: number;
}

// ----------------------------------------------------------------------------
// Wire envelope (the universal frame on the wire)
// ----------------------------------------------------------------------------

/**
 * Every WebSocket frame carries one of these. Spec FR-003 lists the
 * message kinds (hello, join, order, tick delta, snapshot, ack, error,
 * terminal, ping/pong); spec FR-004 mandates a schema version field.
 *
 * `type` is a string discriminator (not a numeric tag) so that adding
 * new message kinds is non-breaking for old clients that ignore them.
 *
 * `version` mirrors engine's `ProtocolEnvelope.version` field semantics
 * (monotonic per `type`; major-version mismatch → server rejects
 * gracefully per FR-004). For v1, every message kind shares the same
 * `NETWORK_API_VERSION`; per-`type` versioning is reserved for future
 * evolution.
 *
 * `seq` is per-direction: client→server seqs on inbound messages,
 * server→client seqs on outbound messages. Both monotonic, both
 * starting at 1 per session.
 *
 * `payload` is the discriminated body; see `NetworkPayload`.
 */
export interface ProtocolEnvelope<TPayload extends NetworkPayload> {
  readonly type: MessageKind;
  readonly version: string; // matches NETWORK_API_VERSION at send time
  readonly seq: SequenceNumber;
  readonly payload: TPayload;
}

/**
 * The full set of message kinds the wire protocol supports. Adding a
 * kind = additive change; bumping the protocol version is required only
 * when an existing kind's payload shape changes.
 *
 * Feature 010 adds the closed `lobby*` family additively (no version
 * bump — see the feature-010 section below). Recipients MUST ignore
 * unrecognized kinds instead of failing: `type` is a string discriminator
 * precisely so new kinds stay non-breaking for old clients that ignore
 * them, and the server delivers lobby frames only to lobby-subscribed
 * connections so gameplay-only peers never observe them.
 *
 * Discriminator for `ProtocolEnvelope<TPayload>['type']`. Server
 * narrows `NetworkPayload` on this.
 */
export type MessageKind =
  // Client → Server
  | 'hello' // initial handshake: protocol version + client identity claim
  | 'joinMatch' // request seat (new) or claim existing seat (with token)
  | 'order' // submit Order (wraps engine Order)
  | 'ping' // heartbeat (client-driven)
  | 'lobbyIdentity' // feature 010: establish/restore this connection's guest identity
  | 'lobbySetHandle' // feature 010: claim or rename the identity's public handle
  | 'lobbySubscribe' // feature 010: request the LobbySnapshot and lobby updates
  | 'lobbyCreate' // feature 010: create a public match; creator's seat reserved
  | 'lobbyJoin' // feature 010: join a listed public match by id
  | 'lobbySpectate' // feature 010: attach read-only to a running public match
  | 'lobbyLeave' // feature 010: release the match association / return to lobby
  // Server → Client
  | 'helloAck' // hello accepted, connection established at protocol layer
  | 'joinAck' // seat claimed / matched; carries session token + PlayerView snapshot
  | 'snapshot' // full PlayerView (resync; sent on reconnect)
  | 'tick' // per-tick delta PlayerView
  | 'orderAck' // result of an order submission (engine's CommandResult)
  | 'terminal' // match ended (engine's MatchResult)
  | 'pong' // heartbeat ack
  | 'error' // protocol-level rejection (version mismatch, auth fail, rate limit, etc.)
  | 'lobbyEvent'; // feature 010: identity/snapshot/action/error events for subscribers

/**
 * The discriminated union of all payload bodies that ride inside a
 * `ProtocolEnvelope`. The engine declares a SUBset of this union
 * (`engine-to-networking.ts`'s `NetworkPayload`); networking owns the
 * transport-layer additions (hello, joinMatch, ping, etc.).
 *
 * Why two unions? The engine's `NetworkPayload` describes payloads
 * that mirror engine concepts (ticks, snapshots, order acks, terminal
 * results, errors that wrap engine `ValidationError`). Networking
 * extends it with payloads that have no engine equivalent (session
 * lifecycle, heartbeat). Code that consumes engine payloads can
 * import the engine union; code that handles the wire envelope
 * imports the full networking union.
 */
export type NetworkPayload =
  // --- Transport-layer payloads (networking-owned) ---
  | HelloPayload
  | HelloAckPayload
  | JoinMatchPayload
  | JoinAckPayload
  | PingPayload
  | PongPayload
  // --- Engine-mirrored payloads (conformed to engine-to-networking.ts) ---
  | TickBroadcastPayload
  | SnapshotPayload
  | OrderSubmissionPayload
  | OrderAckPayload
  | TerminalPayload
  | ErrorPayload
  // --- Feature 010 lobby payloads (additive; see the lobby section) ---
  | LobbyIdentityPayload
  | LobbySetHandlePayload
  | LobbySubscribePayload
  | LobbyCreatePayload
  | LobbyJoinPayload
  | LobbySpectatePayload
  | LobbyLeavePayload
  | LobbyEventPayload;

// ----------------------------------------------------------------------------
// Transport-layer payloads (networking-owned; not in engine contract)
// ----------------------------------------------------------------------------

/**
 * Client → Server initial handshake. First message sent on every new
 * WebSocket connection.
 *
 * `protocolVersion` MUST match `NETWORK_API_VERSION`. Mismatch → server
 * sends `ErrorPayload` with code `'version_mismatch'` and closes the
 * connection (per FR-004).
 */
export interface HelloPayload {
  readonly protocolVersion: string;
  /**
   * Optional client identification for logs (no auth in v1). Server
   * logs it but does not authenticate.
   */
  readonly clientInfo?: { readonly name?: string; readonly version?: string };
}

/**
 * Server → Client hello acknowledgment. Issued once per connection,
 * transitions state `pending` → `greeted`.
 *
 * Carries the server's current `NETWORK_API_VERSION` so the client
 * can detect version skew even if the initial `HelloPayload` was
 * accepted (forward-compat: client may continue if its major version
 * matches even on minor drift).
 */
export interface HelloAckPayload {
  readonly protocolVersion: string;
  readonly connectionId: ConnectionId;
  /** Heartbeat interval the server expects (ms). Tunable; see `ServerConfig`. */
  readonly heartbeatIntervalMs: number;
  /**
   * Additive release identity (feature 009): presence = server of
   * feature-009 generation or later; clients MUST tolerate absence.
   * Never derived from or related to `protocolVersion`.
   */
  readonly appVersion?: string;
}

/**
 * Client → Server seat claim. Two modes:
 *
 * - **New session** (no `reconnectToken`): server assigns a new
 *   `PlayerId` seat in the requested match. Subject to match capacity
 *   (2–4 per engine contract; v1 ships 2). Fails with
 *   `ErrorPayload` codes `'match_full'` / `'match_not_found'` /
 *   `'match_not_joinable'`.
 *
 * - **Reconnect** (with `reconnectToken`): server validates the token,
 *   restores the seat, sends a fresh `SnapshotPayload`. Fails with
 *   `'token_invalid'` / `'token_expired'` / `'token_mismatch'`.
 *
 * `role` distinguishes player (claim a seat) from spectator (attach
 * without a seat). Spectator attach uses the same payload without a
 * `reconnectToken` and without `requestedSeat`.
 */
export interface JoinMatchPayload {
  readonly matchId: MatchId;
  readonly role: ConnectionRole;
  /** Opaque token from a prior `JoinAckPayload`. Absent for new sessions. */
  readonly reconnectToken?: SessionToken;
  /**
   * Requested seat (1..playerCount — the engine's 1-based `PlayerId`
   * domain, which is also the server's seat-key domain). Only honored
   * for new player sessions; matchmaking may assign differently. The
   * server picks the lowest open seat if omitted.
   */
  readonly requestedSeat?: number;
  /** Cosmetic display name for the session (matchmaking spec FR-001). */
  readonly displayName: string;
}

/**
 * Server → Client join acknowledgment. Issued exactly once per
 * successful join. Transitions state `greeted` → `joined` (or
 * `rejoined`).
 *
 * `sessionToken` is the value the client must present to reconnect.
 * `playerId` is the assigned seat (null for spectators). `snapshot`
 * is the initial full-state PlayerView (or full-board view for
 * spectators), per FR-006.
 */
export interface JoinAckPayload {
  readonly sessionToken: SessionToken;
  readonly playerId: PlayerId | null; // null for spectators
  readonly view: import('@europa/fog').PlayerView; // full PlayerView
  readonly tick: number; // current match tick
  readonly players: ReadonlyArray<import('@europa/engine').Player>; // for the lobby strip
}

/**
 * Client → Server heartbeat. Optional — server also infers liveness
 * from any inbound message. The ping exists primarily so clients
 * behind NATs can keep the connection alive without spamming orders.
 */
export interface PingPayload {
  readonly clientTimeMs: number; // wall-clock at sender; informational only
}

/**
 * Server → Client heartbeat acknowledgment.
 */
export interface PongPayload {
  readonly clientTimeMs: number; // echoed from PingPayload
  readonly serverTimeMs: number; // wall-clock at server; informational only
}

// ----------------------------------------------------------------------------
// Engine-mirrored payloads (conformed to engine-to-networking.ts)
// ----------------------------------------------------------------------------
//
// These shapes are DECLARED by feature 001's `engine-to-networking.ts`.
// Networking imports them from there rather than re-defining. The
// imports are re-exported below for one-stop convenience.
//
// (Note: in the actual contract file we `import type` from the engine
// boundary file. The interfaces listed here are documentation aliases
// for what the wire carries — the runtime types come from the engine.)
// ----------------------------------------------------------------------------

/**
 * Per-tick broadcast to a recipient. Engine declares the analogous shape
 * in `engine-to-networking.ts` (with `changedCells: ReadonlyArray<CellView>`
 * + `events: TickEvents`). Networking *re-projects* that onto the
 * fog-owned `PlayerView` because the spec mandates fog-filtered
 * broadcasts (FR-005) and deltas (FR-006).
 *
 * The `payload` body here carries the *full* PlayerView for this tick —
 * not the engine's `changedCells`. Networking computes the delta against
 * the recipient's last-known state at *send time* (network-layer
 * concern). The recipient applies the delta to its local cache.
 *
 * Spec FR-005: server-side fog enforcement. Networking does NOT inspect
 * `view.visibleCells`; it trusts fog's output and serializes it
 * verbatim. Verification: spec SC-004 zero-violation audit.
 */
export type TickBroadcastPayload = {
  readonly tick: number;
  /** Fog-filtered view for the recipient (full-board for spectators). */
  readonly view: import('@europa/fog').PlayerView;
};

/**
 * Full PlayerView snapshot. Sent on resync (standalone `snapshot`
 * envelope) when a reconnecting client reclaims its seat (US2).
 *
 * Spec FR-006: deltas are the default; full snapshots occur only on
 * join/resync. The join-time snapshot rides `JoinAckPayload.view`.
 *
 * **US2 correction (T039)**: this payload was originally declared as
 * `{ world }` — but shipping a raw World to one player would leak every
 * other seat's fog-hidden state (FR-005 / SC-004 violation), and the
 * prose here already called it a "Full PlayerView snapshot". The body
 * now mirrors the per-tick broadcast shape: the boundary the snapshot
 * was taken at, plus the seat's fog-filtered PlayerView.
 */
export type SnapshotPayload = {
  readonly tick: number;
  readonly view: import('@europa/fog').PlayerView;
};

/**
 * Client → Server order submission. Wire form mirrors engine `Order`
 * (feature 001's discriminated union). The `seq` field on the
 * envelope correlates the order with its `OrderAckPayload` response.
 */
export type OrderSubmissionPayload = {
  readonly order: import('@europa/engine').Order;
};

/**
 * Server → Client order acknowledgment. Returns the engine's
 * `CommandResult` (ok or `ValidationError`). Spec FR-008 determinism:
 * engine applies orders in deterministic order at tick boundaries;
 * networking surfaces the result without modifying it.
 */
export type OrderAckPayload = {
  readonly seq: SequenceNumber; // correlates to OrderSubmissionPayload.envelope.seq
  readonly result:
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: import('@europa/engine').ValidationError };
};

/**
 * Server → Client match-terminal payload. Networking relays the
 * engine's `MatchResult` (feature 001 declares). Sent exactly once
 * per match end; connection transitions to `terminal` after.
 */
export type TerminalPayload = {
  readonly result: import('@europa/engine').MatchResult;
};

/**
 * Server → Client error envelope. Used for protocol-level rejections
 * (version mismatch, rate limit, token invalid, malformed payload).
 * Distinct from `OrderAckPayload.ok: false` which carries engine
 * `ValidationError` for valid-protocol-but-invalid-gameplay orders.
 */
export interface ErrorPayload {
  readonly code: ErrorCode;
  readonly message: string;
  /** Optional machine-readable detail (e.g., expected vs actual version). */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Stable error codes. Closed union so clients can switch on `code`
 * without stringly-typed comparisons. Adding a code = minor version
 * bump of `NETWORK_API_VERSION` (additive but documented).
 *
 * Addition trail (review 6C-3): `token_mismatch` added while the
 * protocol is still pre-release `0.x` — the server already emitted
 * this condition and the `JoinMatchPayload` doc cited the code, so
 * the union now names it. No version bump: under pre-1.0 semver a
 * minor bump is wire-breaking, and additive error codes are safely
 * ignored by clients' default error branches.
 */
export type ErrorCode =
  | 'version_mismatch' // FR-004
  | 'malformed_payload' // JSON parse / schema validation failed
  | 'unknown_message_kind' // envelope.type not in MessageKind
  | 'protocol_sequence_error' // e.g., order before joinMatch
  | 'match_not_found' // private-match lookup miss (US3 FR-006)
  | 'match_full' // all seats taken
  | 'match_not_joinable' // already running without open seats
  | 'token_invalid' // reconnect token unknown
  | 'token_expired' // reconnect window elapsed
  | 'token_mismatch' // reconnect token valid but bound to a different match
  | 'seat_taken' // another connection claimed this seat first
  | 'rate_limited' // FR-010
  | 'spectator_readonly' // spectator tried to submit an order
  | 'internal_error'; // catch-all; logged on the server

// ----------------------------------------------------------------------------
// Feature 010 — Public lobby & match browser (additive wire family)
// ----------------------------------------------------------------------------
//
// Design source of truth:
//   - specs/010-public-lobby-match-browser/contracts/lobby-wire.md
//     (message kinds + payload shapes — mirrored verbatim below)
//   - specs/010-public-lobby-match-browser/contracts/lobby-types.md
//     (domain shapes — wire-mirrored below)
//
// The lobby family rides the existing `ProtocolEnvelope` and extends the
// closed unions above. It is ADDITIVE: every gameplay payload declared
// earlier in this file is untouched. The domain shapes are restated here
// instead of imported from `@europa/matchmaking` because matchmaking
// depends on networking — importing would invert the dependency arrow.
// Matchmaking's implementation contracts (feature 010) MUST remain
// mutually assignable with these declarations; drift in either direction
// is a conformance bug (pinned by tests/contracts-conformance.test.ts).
//
// Version policy (normative):
//   - Introducing this family does NOT bump `NETWORK_API_VERSION`.
//     Additive message kinds never change an existing kind's payload
//     shape, so the FR-004 breaking boundary does not move and old
//     gameplay clients keep interoperating with the match endpoint
//     unchanged (feature 010 plan, "Compatibility and migration").
//   - Incompatible edits — changing or removing any shape declared in
//     this file — DO require the FR-004 version policy (graceful
//     rejection across the breaking boundary) plus conformance fixture
//     updates in BOTH canonical copies of this file in the same change
//     set.
//
// Unknown-message behavior (normative):
//   - Recipients MUST ignore envelopes whose `type` they do not
//     recognize rather than treat them as fatal. A lobby frame reaching
//     a peer without lobby support is answered with a graceful,
//     actionable error (the existing `unknown_message_kind` /
//     protocol-sequence rejections) while the connection stays open —
//     errors never close a healthy connection unless existing policy
//     (version drift, transport failure) requires it.
//   - Clients additionally ignore unrecognized additive variants inside
//     `LobbyEvent`, so newer servers may introduce event kinds an older
//     client has never seen.
//   - The server delivers `lobbyEvent` frames ONLY to connections that
//     opted in via `lobbySubscribe`; gameplay-only clients therefore
//     never observe lobby traffic.

/**
 * Opaque guest player identifier (feature 010). Server-issued, unique
 * among active identities, non-semantic, and NEVER a display name: it
 * must not appear in public lobby entries, participant labels, player/
 * spectator views, URLs, or documentation examples (spec FR-024). The
 * browser may store it locally and present it back as a
 * `GuestIdentityClaim`; the server honors that claim only while its own
 * registry still holds the identity.
 *
 * Wire form: plain string (brands are compile-time only).
 */
export type GuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };

/**
 * Monotonic lobby-snapshot revision (feature 010). Strictly increasing
 * per server process; clients apply a snapshot only when its revision is
 * newer than the last one they applied.
 *
 * Wire form: plain number.
 */
export type LobbyRevision = number & { readonly __brand: 'LobbyRevision' };

/**
 * Client-generated correlation id for one lobby action (feature 010).
 * Stamped on every lobby request; the server echoes it on the matching
 * `actionAccepted` / `error` lobby event so outcomes can be correlated
 * (mirrors the order seq ↔ orderAck correlation discipline).
 *
 * Wire form: plain number.
 */
export type LobbyActionId = number & { readonly __brand: 'LobbyActionId' };

/**
 * Lifecycle status of a public match entry as projected to the lobby
 * (feature 010 FR-007): `'waiting'` entries offer Join while capacity
 * remains; `'in_progress'` entries offer Spectate only.
 */
export type LobbyStatus = 'waiting' | 'in_progress';

/**
 * Client-presentable identity claim (feature 010). The browser stores
 * the opaque id + handle locally and MAY present them via
 * `LobbyIdentityPayload` to restore a previous session's identity. The
 * server accepts the claim only when its registry still holds that
 * identity; otherwise it issues a fresh one. Purely advisory input —
 * never authority (spec FR-002/FR-021).
 */
export interface GuestIdentityClaim {
  readonly guestPlayerId?: GuestPlayerId;
  readonly handle?: string;
}

/**
 * Server-confirmed identity projection (feature 010). `handle` is null
 * until the player submits a valid handle; `hasIdentity` is always true
 * on a wire-delivered identity event. Contains NO opaque guest id — the
 * identifier never leaves the server (spec FR-024).
 */
export interface IdentityState {
  readonly handle: string | null;
  readonly hasIdentity: true;
}

/**
 * Safe public projection of one listed match (feature 010 FR-006).
 * Carries discovery data only: no participant list, no seat tokens, no
 * opaque guest ids, and never a private or finished match.
 */
export interface PublicLobbyEntry {
  readonly matchId: MatchId;
  /** Seats currently claimed (players only; spectators excluded). */
  readonly seatsFilled: number;
  /** Configured capacity (engine contract: 2–4 players). */
  readonly capacity: 2 | 3 | 4;
  readonly status: LobbyStatus;
  /** Settings summary shown in the browse list (spec FR-006). */
  readonly boardSize: number;
  readonly tickIntervalMs: number;
}

/**
 * Complete lobby state sent on subscribe and after every mutation or
 * lifecycle event (feature 010). Full snapshots (not row patches) keep
 * stale rows impossible; clients apply a snapshot only when `revision`
 * is strictly newer than the last applied one.
 */
export interface LobbySnapshot {
  readonly revision: LobbyRevision;
  readonly entries: ReadonlyArray<PublicLobbyEntry>;
  /** The identity's current match, if any (drives return-to-match UI). */
  readonly activeMatchId: MatchId | null;
}

/**
 * Lobby-scoped error codes (feature 010). Delivered as an actionable
 * `LobbyEvent` of kind `'error'` — distinct from the transport-level
 * `ErrorCode` union above, which keeps meaning gameplay/protocol
 * failures. Receiving one never closes the connection.
 */
export type LobbyErrorCode =
  | 'identity_invalid'
  | 'handle_invalid'
  | 'handle_taken'
  | 'match_not_found'
  | 'match_full'
  | 'match_not_joinable'
  | 'identity_in_match'
  | 'identity_expired'
  | 'server_restarted'
  | 'internal_error';

/**
 * Server → client lobby events (feature 010). Closed discriminated
 * union on `kind`. Additive variants may be introduced (clients MUST
 * ignore unrecognized kinds per the unknown-message policy above);
 * changing or removing an existing variant is an incompatible edit
 * requiring the version policy above.
 *
 * Error events are actionable: clients render user-facing text from
 * `code` plus the optional machine-readable `detail` record on the
 * `'error'` variant (field-specific feedback), and MUST tolerate
 * `detail` being absent.
 */
export type LobbyEvent =
  | { readonly kind: 'identity'; readonly identity: IdentityState }
  | { readonly kind: 'snapshot'; readonly snapshot: LobbySnapshot }
  | {
      readonly kind: 'actionAccepted';
      readonly actionId: LobbyActionId;
      readonly transition: 'waiting' | 'match';
    }
  | {
      readonly kind: 'error';
      readonly actionId?: LobbyActionId;
      readonly code: LobbyErrorCode;
      readonly message: string;
      /**
       * Optional machine-readable detail mirroring matchmaking's
       * `LobbyError.detail` (field name → message/value). Lets clients
       * render field-specific, actionable text (e.g., naming the
       * rejected create-form settings fields); absent when the code
       * needs no specifics or an older server sent none.
       */
      readonly detail?: Readonly<Record<string, string | number | boolean>>;
    };

/**
 * Wire mirror of `@europa/terrain`'s `GenerationSettings` (feature 010):
 * the terrain knobs a lobby create request MAY preset. Structural mirror
 * only — terrain owns the authoritative declaration and clamps
 * out-of-range values at generation time; matchmaking (feature 006)
 * validates what the lobby passes through (spec FR-008).
 */
export interface LobbyTerrainSettings {
  /** Fraction of cells classified as water. Default 0.10; range [0.02, 0.25]. */
  readonly waterRatio: number;
  /** fBm noise persistence. Default 0.5; range [0.1, 0.9]. */
  readonly roughness: number;
  /** fBm octave count. Default 4; range [1, 6]. */
  readonly octaves: number;
  /** Per-player starting city count. Default 1; range [1, 4]. */
  readonly citiesPerPlayer: number;
  /** Symmetry strategy. v1 supports point symmetry only (terrain contract). */
  readonly symmetryStrategy: 'point';
  /** Minimum Chebyshev distance from a city to any water cell. Default 3. */
  readonly minCityWaterDistance: number;
  /** Minimum Chebyshev distance between any two cities. Default 5. */
  readonly minCityCityDistance: number;
  /** Maximum regeneration attempts on validation failure. Default 5. */
  readonly maxRegenAttempts: number;
}

/**
 * Wire mirror of `@europa/matchmaking`'s `MatchSettings` (feature 010):
 * the supported settings a `lobbyCreate` request MAY preset. Structurally
 * identical to the matchmaking declaration; omitted fields are merged
 * with matchmaking defaults and validated there (spec FR-008) — the wire
 * layer neither defaults nor clamps them.
 */
export interface LobbyMatchSettings {
  /** Player count (engine FR-019: 2..4). v1 ships 2 end-to-end. */
  readonly playerCount: 2 | 3 | 4;
  /** Square board dimension. Clamped to `[8, 128]`. */
  readonly boardSize: number;
  /** Tick interval in ms (engine default 250). */
  readonly tickIntervalMs: number;
  readonly terrainSettings: LobbyTerrainSettings;
}

/**
 * Client → Server: establish or restore the connection's guest identity.
 * Sent after hello, before any mutating lobby action (identity is
 * established first per lobby-wire.md). The optional claim is advisory:
 * the server resolves the active identity from connection/session state
 * and honors the stored claim only while its registry still holds it.
 */
export interface LobbyIdentityPayload {
  readonly claim?: GuestIdentityClaim;
}

/**
 * Client → Server: claim or rename the identity's public handle.
 * Validation (1–24 Unicode code points after trimming, no control
 * characters) and trimmed case-insensitive uniqueness among active
 * identities are server-side (spec FR-004/FR-005); rejection arrives as
 * an actionable `handle_invalid` / `handle_taken` lobby error without
 * displacing the incumbent holder.
 */
export interface LobbySetHandlePayload {
  readonly handle: string;
  readonly actionId: LobbyActionId;
}

/**
 * Client → Server: opt this connection into lobby updates. The server
 * answers with a complete `snapshot` lobby event and keeps sending a
 * fresh one after every mutation/lifecycle event until unsubscribe/
 * disconnect (feature 010 FR-013).
 */
export interface LobbySubscribePayload {
  readonly actionId: LobbyActionId;
}

/**
 * Client → Server: create a public match and reserve the creator's seat
 * (feature 010 FR-008/FR-009). Settings are optional presets merged and
 * validated by matchmaking; success returns the existing session
 * assignment through the existing match join flow (`actionAccepted`
 * with transition `'match'`), never a client-selected seat.
 */
export interface LobbyCreatePayload {
  readonly actionId: LobbyActionId;
  readonly settings?: Partial<LobbyMatchSettings>;
}

/**
 * Client → Server: join a listed public waiting match by id (feature
 * 010 FR-010). Atomic and server-authoritative: at most one request
 * wins the final seat; losers receive an actionable lobby error
 * (`match_full` / `match_not_joinable` / `match_not_found`) and the
 * lobby refreshes the entry.
 */
export interface LobbyJoinPayload {
  readonly actionId: LobbyActionId;
  readonly matchId: MatchId;
}

/**
 * Client → Server: attach read-only to a running public match (feature
 * 010 FR-012). Uses the existing spectator path: no seat, no token, no
 * order permissions — the full-visibility spectator view only.
 */
export interface LobbySpectatePayload {
  readonly actionId: LobbyActionId;
  readonly matchId: MatchId;
}

/**
 * Client → Server: release this identity's match association and return
 * to the lobby (feature 010). Releases only the requesting identity's
 * association; cleanup policy stays with the existing lifecycle rules.
 */
export interface LobbyLeavePayload {
  readonly actionId: LobbyActionId;
}

/**
 * Server → Client: one lobby event for subscribed connections (feature
 * 010). Carries identity confirmations, complete snapshots, action
 * outcomes, and actionable errors. See `LobbyEvent` for the variant set
 * and the unknown-variant tolerance rule.
 */
export interface LobbyEventPayload {
  readonly event: LobbyEvent;
}

// ----------------------------------------------------------------------------
// Re-exports for convenience
// ----------------------------------------------------------------------------

/**
 * Re-export the engine types networking depends on, so consumers of
 * `@europa/networking` can import everything from one place.
 *
 * Drift between these and engine's declarations = bug (caught by
 * TypeScript build).
 *
 * Import paths follow the engine/fog boundary rule:
 *   - Engine core types → `@europa/engine`
 *   - Fog-derived types (`PlayerView`, `VisibleSet`) → `@europa/fog`
 *     (which re-exports them from the engine's `engine-to-fog.ts`).
 */
export type {
  // engine core
  CellView,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
} from '@europa/engine';

export type {
  // fog-derived (re-exported by @europa/fog per fog-to-networking.ts)
  PlayerView,
  VisibleSet,
} from '@europa/fog';
