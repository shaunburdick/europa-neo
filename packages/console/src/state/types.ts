/**
 * Console-internal state-type surface — Feature 005 (T018).
 *
 * The single module every console implementation file imports its
 * types from. Two responsibilities:
 *
 *  1. Re-export everything declared in the console's own contract
 *     mirror (`contracts/console-types.ts`) — both the types and the
 *     runtime constants (`CONSOLE_API_VERSION`, `SUBCELL_RANGE`,
 *     `DEFAULT_CAMERA`, `DEFAULT_PLAYER_COLORS`, `DEFAULT_QOL_SETTINGS`,
 *     `DEFAULT_INPUT_MAPPING`). The contracts directory is the source
 *     of truth; this file never re-declares.
 *
 *  2. Re-export the upstream engine / fog / networking types the
 *     console consumes, strictly via `import type`/`export type` so
 *     no runtime dependency on `@europa/engine` or `@europa/fog`
 *     enters the console's src graph (the engine-to-networking
 *     boundary rule from features 001/004). Networking runtime
 *     imports are allowed only inside `src/net/client.ts`.
 *
 * The declare-function names in the contract files
 * (`regionFromSubcell`, `subcellToTargetOffset`, …) are intentionally
 * NOT re-exported as values here — they are implemented by the real
 * modules (`src/input/hit-test.ts`, `src/input/subcell.ts`,
 * `src/net/connection.ts`, `src/net/envelope-to-event.ts`) and
 * exported through the package barrel.
 *
 * Completeness rule (conformance-tested, T089): every TYPE and CONST
 * name exported by any of the four contract mirrors must be reachable
 * from this module or the package barrel, so `dist/index.d.ts`
 * exposes the full contractual surface.
 */

// ----------------------------------------------------------------------------
// Console-owned types + constants (from the contract mirror)
// ----------------------------------------------------------------------------

export type {
    ActionId,
    CameraState,
    CellRegion,
    CellRenderInfo,
    ConsoleConnectionStatus,
    ConsoleSession,
    ConsoleState,
    CursorTarget,
    FeedbackMessage,
    InputMapping,
    MapEffect,
    MapLabel,
    MapView,
    MapViewId,
    PlayerAction,
    PointerBinding,
    QoLSettings,
    RejectedOrder,
    RenderFeedback,
    ScreenPoint,
    SubcellPosition,
} from '../../contracts/console-types';

export {
    CONSOLE_API_VERSION,
    DEFAULT_CAMERA,
    DEFAULT_INPUT_MAPPING,
    DEFAULT_PLAYER_COLORS,
    DEFAULT_QOL_SETTINGS,
    SUBCELL_RANGE,
} from '../../contracts/console-types';

// ----------------------------------------------------------------------------
// Reducer-surface types (from the state contract mirror)
// ----------------------------------------------------------------------------

export type { ConsoleLogger } from '../../contracts/console-api';
export { CONSOLE_CONSTANTS, NULL_LOGGER } from '../../contracts/console-api';
export type {
    ConsoleAction,
    NetEvent,
    ReduceOptions,
    ReducerEffect,
    SoundClip,
} from '../../contracts/console-state';
export type {
    ConsoleClient,
    ConsoleClientConfig,
    ConsoleClientDeps,
    ConsoleClientState,
    EnvelopeContext,
} from '../../contracts/console-to-networking';
export { DEFAULT_CONSOLE_CLIENT_CONFIG } from '../../contracts/console-to-networking';

// ----------------------------------------------------------------------------
// Engine types (type-only — NO runtime import of @europa/engine)
// ----------------------------------------------------------------------------

export type {
    CellView,
    CommandResult,
    Coord,
    Direction,
    MatchConfig,
    MatchResult,
    Order,
    OrderClearAllPipes,
    OrderClearPipe,
    OrderGun,
    OrderParatroop,
    OrderSetPipe,
    OrderSetPipesExclusive,
    OrderSetReserves,
    OrderSurrender,
    Player,
    PlayerId,
    ReservesPct,
    TickEvents,
    ValidationError,
    World,
} from '@europa/engine';

// ----------------------------------------------------------------------------
// Fog types (type-only — NO runtime import of @europa/fog)
// ----------------------------------------------------------------------------

export type { PlayerView } from '@europa/fog';

// ----------------------------------------------------------------------------
// Matchmaking lobby types (feature 010 — type-only)
// ----------------------------------------------------------------------------

/**
 * The lobby wire shapes the console's lobby state layer consumes
 * (feature 010). Type-only, like every upstream re-export above.
 *
 * `GuestPlayerId` is absent from this projection because the current lobby
 * state does not need the correlation ID. IDs are non-secret and may be
 * carried or displayed where useful; handles are preferred for user-facing
 * labels. Bearer credentials must still stay out of DOM, URLs, and logs,
 * while identity and authority remain server-resolved.
 */
export type {
    IdentityState,
    LobbyErrorCode,
    LobbyRevision,
    LobbySnapshot,
    LobbyStatus,
    PublicLobbyEntry,
} from '@europa/matchmaking';

// ----------------------------------------------------------------------------
// Networking types (type-only here; runtime use confined to net/client.ts)
// ----------------------------------------------------------------------------

export type {
    ConnectionId,
    ConnectionState,
    ErrorCode,
    MatchClient,
    MatchId,
    NetworkPayload,
    OrderAckPayload,
    OrderSubmissionPayload,
    ProtocolEnvelope,
    SequenceNumber,
    SessionToken,
    TickBroadcastPayload,
} from '@europa/networking';
