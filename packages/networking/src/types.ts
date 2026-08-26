/**
 * Networking Public Type Surface — Feature 004
 *
 * Thin re-export module. The contracts in `src/contracts/` are local
 * copies of the canonical spec contracts at
 * `specs/004-multiplayer-networking/contracts/`. The local
 * copies exist because `tsc`'s `rootDir: ./src` rejects imports from
 * outside the package (see fog's `src/types.ts` for the precedent and
 * rationale). The copies are byte-identical to the spec files from
 * day one; drift is a bug caught by the Polish-phase conformance test
 * (tasks.md T050).
 *
 * **No new types are invented here** — see the contracts for the
 * canonical definitions, JSDoc, and rationale. Per constitution
 * Principle IV (specs as documentation), the contract is
 * authoritative; if a type here diverges from the contract, the
 * contract wins.
 *
 * Engine types (`World`, `Order`, `PlayerId`, …) are imported
 * `import type` so networking does not take a runtime dependency on
 * the engine for type-only consumers (engine-to-networking boundary
 * rule). The same holds for fog types (`PlayerView`, `VisibleSet`),
 * imported straight from `@europa/fog`.
 */

// ----------------------------------------------------------------------------
// From the wire-protocol contract (`contracts/network-types.ts`)
// ----------------------------------------------------------------------------
//
// Every transport-layer type: branded primitives, connection role +
// state machine, server-side records, rate limiting, the wire
// envelope, message kinds, the payload union, and all twenty payload
// interfaces (twelve gameplay + feature 010's additive lobby family).
// Names alphabetical.

export type {
    // Branded primitives
    ConnectionId,
    // Connection role + state machine
    ConnectionRole,
    ConnectionState,
    // Error codes (closed union)
    ErrorCode,
    // Transport-layer payloads
    ErrorPayload,
    // Feature 010 lobby family (branded + domain + payload shapes)
    GuestIdentityClaim,
    GuestPlayerId,
    HelloAckPayload,
    HelloPayload,
    IdentityState,
    JoinAckPayload,
    JoinMatchPayload,
    LobbyActionId,
    LobbyCreatePayload,
    LobbyErrorCode,
    LobbyEvent,
    LobbyEventPayload,
    LobbyIdentityPayload,
    LobbyJoinPayload,
    LobbyLeavePayload,
    LobbyMatchSettings,
    LobbyRevision,
    LobbySetHandlePayload,
    LobbySnapshot,
    LobbySpectatePayload,
    LobbyStatus,
    LobbySubscribePayload,
    LobbyTerrainSettings,
    // Branded primitive
    MatchId,
    // Wire envelope discriminator
    MessageKind,
    // The full payload union
    NetworkPayload,
    // Engine-mirrored payloads
    OrderAckPayload,
    OrderSubmissionPayload,
    PingPayload,
    PongPayload,
    ProtocolEnvelope,
    PublicLobbyEntry,
    RateLimitBucket,
    SequenceNumber,
    ServerConnection,
    SessionToken,
    SnapshotPayload,
    TerminalPayload,
    TickBroadcastPayload,
} from './contracts/network-types';

// The wire-protocol version constant — the single runtime artifact in
// the contract. Re-exported here so consumers can do
// `import { NETWORK_API_VERSION } from '@europa/networking'`.
export { NETWORK_API_VERSION } from './contracts/network-types';

// ----------------------------------------------------------------------------
// Engine + fog types (per the boundary rules)
// ----------------------------------------------------------------------------
//
// - Most engine core types arrive via the contract's own re-export
//   block (`CellView`, `Coord`, `Direction`, `Order`, `PlayerId`,
//   `ReservesPct`, `TickEvents`, `ValidationError`, `World`) — taken
//   from there so there is exactly one re-export path per name.
// - Fog-derived view types (`PlayerView`, `VisibleSet`) come straight
//   from `@europa/fog` (which re-exports them from the engine's
//   `engine-to-fog.ts`).
// - The remaining engine types networking's surface needs (`Board`,
//   `CommandResult`, `MatchConfig`, `MatchResult`, `Player`) are not
//   in the contract's re-export block and are imported directly.

export type {
    Board,
    CommandResult,
    MatchConfig,
    MatchResult,
    Player,
} from '@europa/engine';

export type { PlayerView, VisibleSet } from '@europa/fog';
export type {
    CellView,
    Coord,
    Direction,
    Order,
    PlayerId,
    ReservesPct,
    TickEvents,
    ValidationError,
    World,
} from './contracts/network-types';

// ----------------------------------------------------------------------------
// From the server API contract (`contracts/network-api.ts`)
// ----------------------------------------------------------------------------
//
// The `Server` surface, config, deps, bridge, stats, and internal
// record types. Types only — the runtime factory (`createMatchServer`)
// lands with US1 (Wave 6B). The two runtime artifacts the contract
// declares (`NETWORK_DEFAULT_CONFIG`, `NULL_LOGGER`) are re-exported
// as values.

export type {
    AttachPlayerRequest,
    ClientState,
    ConnectionRecord,
    DetachRequest,
    EngineFactory,
    EngineSession,
    EngineSessionInit,
    FogFactory,
    Logger,
    MatchClient,
    MatchmakerBridge,
    MatchTransport,
    RegisterMatchRequest,
    SeatRecord,
    Server,
    ServerConfig,
    ServerDeps,
    ServerStats,
} from './contracts/network-api';
export { NETWORK_DEFAULT_CONFIG, NULL_LOGGER } from './contracts/network-api';

// ----------------------------------------------------------------------------
// From the matchmaking boundary contract
// (`contracts/matchmaking-to-networking.ts`)
// ----------------------------------------------------------------------------

export type {
    MatchmakingAttachPlayer,
    MatchmakingDetach,
    MatchmakingRegisterMatch,
    MatchmakingToNetworking,
    NetworkingMatchTerminal,
    NetworkingSeatClaimed,
    NetworkingSeatDisconnected,
    NetworkingSeatExpired,
    NetworkingSeatReconnected,
    NetworkingToMatchmaking,
} from './contracts/matchmaking-to-networking';
