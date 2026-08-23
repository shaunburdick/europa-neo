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
 * 32-char hex string (16 random bytes → 32 hex chars). Branded as a
 * nominal type so it cannot be confused with arbitrary strings.
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
 * Discriminator for `ProtocolEnvelope<TPayload>['type']`. Server
 * narrows `NetworkPayload` on this.
 */
export type MessageKind =
  // Client → Server
  | 'hello' // initial handshake: protocol version + client identity claim
  | 'joinMatch' // request seat (new) or claim existing seat (with token)
  | 'order' // submit Order (wraps engine Order)
  | 'ping' // heartbeat (client-driven)
  // Server → Client
  | 'helloAck' // hello accepted, connection established at protocol layer
  | 'joinAck' // seat claimed / matched; carries session token + PlayerView snapshot
  | 'snapshot' // full PlayerView (resync; sent on reconnect)
  | 'tick' // per-tick delta PlayerView
  | 'orderAck' // result of an order submission (engine's CommandResult)
  | 'terminal' // match ended (engine's MatchResult)
  | 'pong' // heartbeat ack
  | 'error'; // protocol-level rejection (version mismatch, auth fail, rate limit, etc.)

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
  | ErrorPayload;

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
   * Requested seat index (0..playerCount-1). Only honored for new
   * player sessions; matchmaking may assign differently. Server picks
   * the lowest open seat if omitted.
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
