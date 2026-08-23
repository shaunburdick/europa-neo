/**
 * Public surface of the `@europa/matchmaking` package (feature 006).
 *
 * **Phase 2 (Foundational) barrel** — exposes the tunable constants,
 * the error factory, the identity generators/validators, the in-memory
 * store, and the full public type surface (re-exported from the
 * byte-identical contract mirror at `../contracts/match-types.ts`, so
 * the host binary has one import path).
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

export { makeError } from './errors';

export { isValidMatchId, newMatchId, newPlayerSessionId } from './idGen';

export { isValidSessionToken, newSessionToken } from './sessionToken';

export { createStore } from './store';
