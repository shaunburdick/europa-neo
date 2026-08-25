/**
 * Public surface of the `@europa/networking` package.
 *
 * This is the **US1+US2+US3-populated barrel** (T010 + T020 + T034 +
 * T041 + T046) — re-exports
 * the full type surface (wire protocol, server API, matchmaking
 * boundary), the tunable constants, the Phase 2 runtime utilities
 * (JSON framing, envelope validation, the protocol error hierarchy,
 * branded identity generation, the tick clock), the US1 runtime:
 * `createMatchServer` plus its composable parts (`Connection`,
 * `MatchChannel`, order pipeline, broadcast pipeline, stats), the
 * US2 reconnect machinery, and the US3 spectator pipeline.
 *
 * This is the final US1 deliverable: the public surface is now usable
 * by feature 005 (console) and feature 006 (matchmaking).
 *
 * Consumers:
 *   - 006 (matchmaking)  → calls `createMatchServer` (US1+) and the
 *                          `MatchmakerBridge` types.
 *   - 005 (console)      → reads the wire types; will drive a client
 *                          adapter.
 *   - 001/002/003        → do NOT import networking (downstream-only
 *                          package).
 *
 * The names in each `export { ... }` block are sorted alphabetically
 * (Biome `organizeImports` rule). The conceptual grouping lives in
 * the JSDoc above and in the source-of-truth contracts at
 * `specs/004-multiplayer-networking/contracts/`.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
//
// Re-exports of every public type from `src/types.ts` (which mirrors
// the three spec contracts plus the engine/fog boundary types). See
// that file for grouped documentation.

export type {
    AttachPlayerRequest,
    Board,
    CellView,
    ClientState,
    CommandResult,
    ConnectionId,
    ConnectionRecord,
    ConnectionRole,
    ConnectionState,
    Coord,
    DetachRequest,
    Direction,
    EngineFactory,
    EngineSession,
    EngineSessionInit,
    ErrorCode,
    ErrorPayload,
    FogFactory,
    HelloAckPayload,
    HelloPayload,
    JoinAckPayload,
    JoinMatchPayload,
    Logger,
    MatchClient,
    MatchConfig,
    MatchId,
    MatchmakerBridge,
    MatchmakingAttachPlayer,
    MatchmakingDetach,
    MatchmakingRegisterMatch,
    MatchmakingToNetworking,
    MatchResult,
    MatchTransport,
    MessageKind,
    NetworkingMatchTerminal,
    NetworkingSeatClaimed,
    NetworkingSeatDisconnected,
    NetworkingSeatExpired,
    NetworkingSeatReconnected,
    NetworkingToMatchmaking,
    NetworkPayload,
    Order,
    OrderAckPayload,
    OrderSubmissionPayload,
    PingPayload,
    Player,
    PlayerId,
    PlayerView,
    PongPayload,
    ProtocolEnvelope,
    RateLimitBucket,
    RegisterMatchRequest,
    ReservesPct,
    SeatRecord,
    SequenceNumber,
    Server,
    ServerConfig,
    ServerConnection,
    ServerDeps,
    ServerStats,
    SessionToken,
    SnapshotPayload,
    TerminalPayload,
    TickBroadcastPayload,
    TickEvents,
    ValidationError,
    VisibleSet,
    World,
} from './types';

// Single value re-exports from the contracts: default server config
// and the no-op logger. Bumped on any breaking change to their shape
// (constitution Principle IV).
export { NETWORK_DEFAULT_CONFIG, NULL_LOGGER } from './types';

// ----------------------------------------------------------------------------
// Tunable constants (single location, constitution Principle V)
// ----------------------------------------------------------------------------

export type { NetworkConstants } from './constants';
export { NETWORK_API_VERSION, NETWORK_CONSTANTS } from './constants';

// ----------------------------------------------------------------------------
// Protocol error hierarchy (Phase 2 foundational)
// ----------------------------------------------------------------------------

export type { NetworkErrorCode, NetworkErrorDetail } from './errors';
export { isNetworkError, NetworkError } from './errors';

// ----------------------------------------------------------------------------
// JSON framing (Phase 2 foundational)
// ----------------------------------------------------------------------------

export { decodeFrame, encodeFrame, tryDecodeFrame } from './frame';

// ----------------------------------------------------------------------------
// Branded identity generation (Phase 2 foundational)
// ----------------------------------------------------------------------------

export { generateConnectionId, generateSessionToken, toBranded } from './ids';

// ----------------------------------------------------------------------------
// Envelope schema validation (Phase 2 foundational)
// ----------------------------------------------------------------------------

export { validateEnvelope, validateVersion } from './validate';

// ----------------------------------------------------------------------------
// Tick clock — the sanctioned wall-clock boundary (Phase 2 foundational)
// ----------------------------------------------------------------------------

export type { TickClock } from './clock';
export { createTickClock } from './clock';

// ----------------------------------------------------------------------------
// US1 runtime: connection lifecycle, match channel, order + broadcast
// pipelines, stats, and the server orchestrator (T034)
// ----------------------------------------------------------------------------

export type { BroadcastDeps } from './broadcast';
export { buildTickBroadcast, sendTickBroadcast } from './broadcast';
export type {
    ConnectionOptions,
    ConnectionSocket,
    MutableRateBucket,
    RateLimitSettings,
} from './connection';
export { Connection } from './connection';
export type {
    AttachSeatResult,
    MatchChannelInit,
    PendingOrder,
    SeatBinding,
} from './match-channel';
export { MatchChannel } from './match-channel';
export type { AcceptOrderResult, AppliedOrderOutcome } from './orders';
export { acceptOrder, applyOrdersAtTickBoundary } from './orders';
export { createMatchServer } from './server';

// ----------------------------------------------------------------------------
// US3 runtime: late-join spectator attach/detach (T046)
// ----------------------------------------------------------------------------

export type { AttachSpectatorResult, SpectatorDeps } from './spectator';
export { attachSpectator, detachSpectator, SPECTATOR_VIEW_SEAT } from './spectator';
export { StatsCounter } from './stats';

// ----------------------------------------------------------------------------
// US2 runtime: reconnect registry + per-seat resync buffers (T041)
// ----------------------------------------------------------------------------

export type { ExpiredBinding, ReconnectBinding, ReconnectLookupResult } from './reconnect';
export { ReconnectRegistry } from './reconnect';
export type { ResyncEntry } from './resync';
export { ResyncBuffer } from './resync';
