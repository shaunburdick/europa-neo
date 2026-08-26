/**
 * Public surface of the `@europa/matchmaking` package (feature 006;
 * feature 010 contract artifacts since T-003).
 *
 * **Phase 2 (Foundational) barrel** — exposes the tunable constants,
 * the error factory, the identity generators/validators, the in-memory
 * store, and the full public type surface (re-exported from the
 * byte-identical contract mirror at `../contracts/match-types.ts`, so
 * the host binary has one import path).
 *
 * Feature 010 (Public Lobby & Match Browser) adds its server API/event
 * contract artifacts under the same type-only discipline: the lobby
 * identity/projection/error/event shapes
 * (`src/contracts/lobby-types.ts`) and the `LobbyService` facade with
 * its `Result` union and hand-off targets
 * (`src/contracts/lobby-api.ts`). The lobby RUNTIME (identity registry,
 * facade implementation, transport wiring) lands with later tasks and
 * will be exported here when it exists.
 *
 * `createMatchmaker` and the `Matchmaker` runtime land in Phase 3
 * (US1 Quick Match); this intermediate barrel compiles standalone.
 *
 * Type-only contract re-exports: the barrel deliberately re-exports no
 * *values* from `../contracts/` — that keeps the compiled bundle free
 * of any runtime import of `@europa/engine` / `@europa/terrain` /
 * `@europa/networking` (research.md §9: zero runtime deps). Contract
 * constants (`MATCHMAKING_API_VERSION`, `DEFAULT_MATCH_SETTINGS`,
 * `DEFAULT_GENERATION_SETTINGS`) remain available via the
 * `@europa/matchmaking/contracts/*` export path.
 *
 * Consumers:
 *   - `packages/server` (host)  → wires the matchmaker against
 *     networking's `Server`.
 *   - feature 005 (console)     → reads lobby/seat types only; never
 *     imports the runtime.
 *
 * Determinism discipline (constitution Principle II): everything here
 * is pure or identity-only; no wall-clock, no unseeded randomness.
 */

export type {
    AcceptRematchRequest,
    AcceptRematchResult,
    Board,
    Cell,
    CellView,
    CityPlacement,
    CommandResult,
    ConnectionId,
    Coord,
    CreateMatchRequest,
    CreateMatchResult,
    DeclineRematchRequest,
    DeclineRematchResult,
    Direction,
    EngineSession,
    GenerationSettings,
    JoinMatchRequest,
    JoinMatchResult,
    JoinPath,
    JoinUrlResult,
    LeaveMatchRequest,
    LeaveMatchResult,
    ListPublicMatchesResult,
    LobbyEntry,
    MatchConfig,
    MatchId,
    MatchInitRequest,
    MatchmakerConstants,
    MatchmakerError,
    MatchmakerErrorCode,
    MatchmakerStats,
    MatchResult,
    MatchResultsRecord,
    MatchSettings,
    MatchStatus,
    MatchVisibility,
    Order,
    Player,
    PlayerId,
    PlayerSessionId,
    PlayerStatus,
    RequestRematchRequest,
    RequestRematchResult,
    ReservesPct,
    Rng,
    SeatAssignedResult,
    SeatAssignment,
    SeatIndex,
    SessionToken,
    TickEvents,
    TickResult,
    ValidationError,
    World,
} from '../contracts/match-types';
export type {
    Matchmaker,
    MatchmakerConfig,
    MatchmakerDeps,
} from '../contracts/matchmaking-api';

export {
    MATCHMAKING_CONSTANTS,
    MATCHMAKING_DEFAULT_CONFIG,
} from './constants';

/**
 * Feature 010 (Public Lobby & Match Browser): the server API/event
 * contract artifacts, exported from `src/contracts/` per plan.md §1
 * (the package-root `contracts/` directory remains the feature-006
 * spec-mirror surface exposed via the
 * `@europa/matchmaking/contracts/*` export path). Type-only like every
 * contract re-export above — the barrel deliberately re-exports no
 * *values* from contract modules, keeping the compiled bundle free of
 * runtime upstream imports (research.md §9: zero runtime deps). The
 * lobby shapes mirror
 * `specs/010-public-lobby-match-browser/contracts/` shape-for-shape;
 * networking's wire mirrors are structurally compatible by design, but
 * THESE declarations are the server-side source of truth consumers
 * should import. The lobby RUNTIME (identity registry, facade
 * implementation, transport wiring) lands with later tasks and will be
 * exported here when it exists.
 */
export type {
    LobbyService,
    MatchJoinTarget,
    Result,
    SpectatorTarget,
} from './contracts/lobby-api';
export type {
    GuestIdentityClaim,
    GuestPlayerId,
    IdentityState,
    LobbyActionId,
    LobbyError,
    LobbyErrorCode,
    LobbyEvent,
    LobbyRevision,
    LobbySnapshot,
    LobbyStatus,
    PublicLobbyEntry,
} from './contracts/lobby-types';

export { makeError } from './errors';

export { isValidMatchId, newMatchId, newMatchSeed, newPlayerSessionId } from './idGen';
/**
 * Phase 3 (US1): the runtime matchmaker. Re-exported here so the host
 * binary has one import path, per the Phase 2 barrel plan (T019).
 */
export { createMatchmaker } from './matchmaker';
export { isValidSessionToken, newSessionToken } from './sessionToken';
export { createStore } from './store';
