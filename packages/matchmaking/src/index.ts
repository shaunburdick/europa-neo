/**
 * Public surface of the `@europa/matchmaking` package (feature 006;
 * feature 010 contract artifacts since T-003).
 *
 * **Phase 2 (Foundational) barrel** — exposes the tunable constants,
 * the error factory, the identity generators/validators, the in-memory
 * store, and the full public type surface (re-exported from the
 * contract module at `src/contracts/match-types.ts`, so the host
 * binary has one import path).
 *
 * Feature 010 (Public Lobby & Match Browser) adds its server API/event
 * contract artifacts under the same type-only discipline: the lobby
 * identity/projection/error/event shapes
 * (`src/contracts/lobby-types.ts`) and the `LobbyService` facade with
 * its `Result` union and hand-off targets
 * (`src/contracts/lobby-api.ts`). The lobby RUNTIME ships in two
 * halves: T-005's guest-identity registry and T-007's
 * `createLobbyService` facade are exported below; transport wiring
 * (networking dispatcher, browser client) lands with later tasks.
 *
 * `createMatchmaker` and the `Matchmaker` runtime land in Phase 3
 * (US1 Quick Match); this intermediate barrel compiles standalone.
 *
 * Contract re-exports: the barrel deliberately re-exports no
 * *runtime-bearing* values from `./contracts/` — that keeps the
 * compiled bundle free of any runtime import of `@europa/engine` /
 * `@europa/terrain` / `@europa/networking` (research.md §9: zero
 * runtime deps). The ONE exception is `MATCHMAKING_API_VERSION`, a
 * pure local `const` with no upstream imports — it is re-exported so
 * in-repo consumers pin the shipped value through the public surface
 * (spec 008 v1.4 plan-gate-parity §5.2; the dist grep drill keeps the
 * zero-runtime-import claim honest). Other contract constants
 * (`DEFAULT_MATCH_SETTINGS`, `DEFAULT_GENERATION_SETTINGS`) stay
 * type/module-internal and are imported from the package source by
 * in-repo callers.
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

export {
    BOARD_SIZE_DEFAULTS,
    MATCHMAKING_CONSTANTS,
    MATCHMAKING_DEFAULT_CONFIG,
} from './constants';
/**
 * Feature 010 (Public Lobby & Match Browser): the server API/event
 * contract artifacts, exported from `src/contracts/` per plan.md §1
 * (the package's ONE contract directory since issue #145's unification
 * — spec 006 v1.10 FR-027). Type-only like every contract re-export
 * above — the barrel deliberately re-exports no runtime-bearing
 * *values* from contract modules, keeping the compiled bundle free of
 * runtime upstream imports (research.md §9: zero runtime deps). The
 * lobby shapes are the canonical source of truth, documented in
 * `specs/010-public-lobby-match-browser/spec.md`.
 * Networking's wire mirrors are structurally compatible by design, but
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
    RosterChange,
    RosterDelta,
    RosterEntry,
    RosterRevision,
    RosterSnapshot,
    RosterStatus,
} from './contracts/lobby-types';
export type {
    AcceptRematchRequest,
    AcceptRematchResult,
    Board,
    BoardSizeDefault,
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
    PlayerCount,
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
    UiBoardSize,
    ValidationError,
    World,
} from './contracts/match-types';
/**
 * The single additive value export from the contract modules: a pure
 * local `const` (no upstream imports), re-exported so consumers pin
 * the shipped API version through the public barrel. Everything else
 * from `./contracts/` stays type-only (see the header note).
 */
export { MATCHMAKING_API_VERSION } from './contracts/match-types';
export type {
    Matchmaker,
    MatchmakerConfig,
    MatchmakerDeps,
} from './contracts/matchmaking-api';

export { makeError } from './errors';

export { isValidMatchId, newMatchId, newMatchSeed, newPlayerSessionId } from './idGen';
export type {
    IdentityRegistry,
    IdentityRegistryDeps,
    IdentityRegistryStats,
    IdentityRestoreOutcome,
} from './internal/identityRegistry';
/**
 * Feature 010 runtime, part 1 of 2 (T-005): the in-memory guest-identity
 * registry behind the lobby facade — atomic identity mint/restore,
 * FR-004/FR-005 handle reservation with grace-window semantics, and
 * `close()` teardown. The re-export was flagged as outstanding by the
 * T-003 barrel work ("the lobby RUNTIME … will be exported here when it
 * exists"); the registry itself stays `@internal`-documented in
 * `src/internal/`, so consumers should treat this surface as the server
 * hosting seam (host wiring + tests), not a client API.
 */
export { createIdentityRegistry, IDENTITY_GRACE_MS_DEFAULT } from './internal/identityRegistry';
/**
 * Transport-facing teardown surface returned by {@linkcode createLobbyService}
 * alongside `LobbyService` (feature 010 remediation R-006): the networking
 * dispatcher MUST call `connectionClosed(connectionId)` when a socket closes,
 * or a lost connection keeps its identity active forever, squatting the
 * reserved handle.
 */
export type { LobbyConnectionTeardown, LobbyServiceDeps } from './internal/lobbyService';
/**
 * Feature 010 runtime, part 2 of 2 (T-007): the server lobby facade —
 * identity setup, subscription + revisioned snapshot delivery, the
 * privacy-safe public projection, and create/join/spectate/leave
 * orchestration delegating settings/capacity/start/cleanup to feature
 * 006's matchmaker (see `src/internal/lobbyService.ts` for the full
 * error-mapping table and delegation boundary).
 */
export { createLobbyService } from './internal/lobbyService';
/**
 * Phase 3 (US1): the runtime matchmaker. Re-exported here so the host
 * binary has one import path, per the Phase 2 barrel plan (T019).
 */
export { createMatchmaker } from './matchmaker';
export { isValidSessionToken, newSessionToken } from './sessionToken';
export { createStore } from './store';
