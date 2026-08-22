/**
 * Public surface of the `@europa/networking` package.
 *
 * This is the **Phase 2 populated barrel** (T010 + T020) — re-exports
 * the full type surface (wire protocol, server API, matchmaking
 * boundary), the tunable constants, and the Phase 2 runtime
 * utilities: JSON framing, envelope validation, the protocol error
 * hierarchy, branded identity generation, and the tick clock.
 *
 * The `Server` factory (`createMatchServer`) and the per-module
 * algorithm re-exports land in Phase 3 after US1 ships (Wave 6B);
 * this intermediate barrel lets downstream packages import the wire
 * utilities without waiting for the orchestrator.
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
 * `.specify/features/004-multiplayer-networking/contracts/`.
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
