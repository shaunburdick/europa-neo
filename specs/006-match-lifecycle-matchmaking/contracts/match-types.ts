/**
 * Matchmaking Type Contracts — Feature 006
 *
 * The public type surface of `@europa/matchmaking`. Re-exported via
 * `packages/matchmaking/src/index.ts`.
 *
 * Source-of-truth types for the engine / terrain / networking dependencies
 * are imported **type-only** from those packages — they are not duplicated
 * here. The matchmaker re-uses:
 *
 *   - `@europa/engine`        → `MatchConfig`, `MatchResult`, `PlayerId`,
 *                                 `Board`, `Rng`, `EngineSession`, ...
 *   - `@europa/terrain`       → `GenerationSettings`,
 *                                 `DEFAULT_GENERATION_SETTINGS`, `Rng`
 *                                 (re-exported from engine)
 *   - `@europa/networking`    → `Server`, `MatchmakerBridge`, `MatchId`,
 *                                 `SessionToken`, `ConnectionId`, `Logger`
 *
 * Consumers (downstream):
 *   - `packages/server` binary (host) — calls `createMatchmaker`, wires
 *                                       the HTTP lobby API on top of it.
 *   - `packages/console` (feature 005, client) — imports the *types*
 *       (`LobbyEntry`, `MatchVisibility`, `SeatAssignment`) via the
 *       server's HTTP payload; the console never imports the runtime.
 *
 * Versioning: breaking changes bump `MATCHMAKING_API_VERSION` and update
 * downstream consumers in the same change set (constitution Principle IV:
 * specs as documentation; stale contracts are bugs).
 *
 * Rules for this file:
 *   - All types are `Readonly` outside matchmaker internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Integer-only numeric fields (counts, indices, capacities).
 *   - Branded primitives prevent type confusion with networking's tokens.
 */

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

// Local imports for names used in the interface bodies below. A
// re-export (`export type { X } from ...`) does NOT bring `X` into this
// file's scope, so every upstream name referenced by a body must also
// be imported here.
import type {
  Board,
  MatchConfig,
  MatchResult,
  PlayerId,
  PlayerStatus,
} from '@europa/engine';
import type { MatchId, SessionToken } from '@europa/networking';
import type { GenerationSettings } from '@europa/terrain';
import { DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';

/**
 * Current matchmaking API version. Increment on any breaking change to
 * the public surface (types or functions in this file and
 * `matchmaking-api.ts`).
 *
 * Mirrors the engine's `ENGINE_API_VERSION` and networking's
 * `NETWORK_API_VERSION` discipline: every consumer pin-checks at startup.
 */
export const MATCHMAKING_API_VERSION = '0.1.0' as const;

// ----------------------------------------------------------------------------
// Re-exports (canonical types from upstream packages)
// ----------------------------------------------------------------------------
//
// The matchmaker re-uses types from the three upstream packages via
// `import type` (erased at compile time). Each upstream package re-exports
// its full public surface from its package root (`@europa/engine`,
// `@europa/terrain`, `@europa/networking`), so consumers of
// `@europa/matchmaking` can import everything from one place.
//
// Drift between these and upstream declarations = bug (caught by the
// `tests/conformance.test.ts`).
// ----------------------------------------------------------------------------

// Engine types (feature 001). The package re-exports everything from its
// `contracts/` directory via its `index.ts`.
//
// NOTE: `EngineSession`, `MatchInitRequest`, and `MatchResultsRecord`
// were originally re-exported from `@europa/engine`'s planned
// `engine-to-matchmaking.ts` boundary, but the engine package does not
// ship that module. They are declared locally below (and `EngineSession`
// is taken from networking, which already re-declares the same handle)
// so this contract compiles against the real upstream surfaces.
export type {
  // engine core
  Board,
  Cell,
  CityPlacement,
  Coord,
  CommandResult,
  Direction,
  MatchConfig,
  MatchResult,
  Order,
  PlayerId,
  Player,
  PlayerStatus,
  ReservesPct,
  Rng,
  TickEvents,
  TickResult,
  ValidationError,
  World,
  CellView,
} from '@europa/engine';

// Engine API version constant (value, not a type) — re-exported so
// consumers can pin-check at startup per the versioning note above.
export { ENGINE_API_VERSION } from '@europa/engine';

// Terrain types (feature 003). The package re-exports everything from
// `terrain-types.ts` and `terrain-api.ts`.
export type { GenerationSettings } from '@europa/terrain';
export { DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';

// Networking primitives (feature 004). `MatchId` / `SessionToken` /
// `ConnectionId` are networking-owned brands; the matchmaker re-uses them
// (rather than redefining its own) so a single branded type flows through
// both packages without conversion noise. `EngineSession` is
// networking's re-declaration of the engine session handle
// (`network-api.ts`) — the canonical available shape of the
// engine↔matchmaking boundary.
export type {
  ConnectionId,
  EngineSession,
  MatchId,
  SessionToken,
} from '@europa/networking';

// ----------------------------------------------------------------------------
// Engine ↔ matchmaking boundary types (declared here)
// ----------------------------------------------------------------------------
//
// These two shapes mirror the engine's planned `engine-to-matchmaking.ts`
// boundary (see data-model.md §10 and networking's `EngineSessionInit`
// doc comment). The engine package does not yet ship that module, so the
// declarations live here — the matchmaker owns the only consumers. When
// the engine eventually exports them, these local declarations must be
// replaced by re-exports in the same change set (specs stay truthful).

/**
 * Initialization parameters for constructing an engine session for a
 * match. Superset of networking's `EngineSessionInit` (which omits the
 * terrain half because matchmaking passes an already-constructed
 * session).
 */
export interface MatchInitRequest {
  /** The match whose engine session is being constructed. */
  readonly matchId: MatchId;
  /** Engine match configuration (players, seed, tick interval). */
  readonly config: MatchConfig;
  /** The terrain-generated board the session starts from. */
  readonly board: Board;
  /** Seat-order display names for the initial players. */
  readonly displayNames: ReadonlyArray<string>;
}

/**
 * Terminal results record handed to the matchmaker when the engine
 * reports a finished match (data-model.md §10). The `cancelled` result
 * kind is matchmaker-only: it records the all-players-forfeited teardown
 * (US5 AC-2); every other result comes verbatim from the engine.
 */
export interface MatchResultsRecord {
  /** The finished match's id. */
  readonly matchId: MatchId;
  /** Tick at which the terminal condition was reached. */
  readonly tick: number;
  /** Effective seed the engine ran with (FR-008). */
  readonly effectiveSeed: number;
  /** Engine terminal result, or the matchmaker's cancelled marker. */
  readonly result:
    | MatchResult
    | { readonly kind: 'cancelled'; readonly reason: string };
  /** Hash of the final board state. */
  readonly finalBoardHash: string;
  /** Per-player final standing, in seat order. */
  readonly finalPlayers: ReadonlyArray<{
    readonly id: PlayerId;
    readonly displayName: string;
    readonly status: PlayerStatus;
    readonly finalTroops: number;
    readonly finalCities: number;
  }>;
}

// ----------------------------------------------------------------------------
// Matchmaking-owned branded primitives
// ----------------------------------------------------------------------------

/**
 * Unique identifier for an ephemeral player session. Distinct from:
 *
 *   - `MatchId` (identifies a match, not a player)
 *   - `SessionToken` (issued by matchmaking, validated by networking
 *     on reconnect — opaque to networking)
 *   - `ConnectionId` (per-WebSocket handle, owned by networking)
 *
 * UUID v4 (36 chars, hyphenated). Branded as a nominal type so it
 * cannot be confused with arbitrary strings.
 */
export type PlayerSessionId = string & { readonly __brand: 'PlayerSessionId' };

// ----------------------------------------------------------------------------
// Match visibility
// ----------------------------------------------------------------------------

/**
 * Whether a match is publicly listed in the lobby or joinable only via
 * shareable link. Fixed at creation (spec edge case "creator wanted
 * privacy after all" → recreate the match).
 *
 *   - `'public'`  → appears in `listPublicMatches()`; joinable by anyone
 *                   who knows the `MatchId` (via the lobby or a URL).
 *   - `'private'` → does NOT appear in `listPublicMatches()`; joinable
 *                   only by someone who knows the `MatchId` (typically
 *                   delivered via shareable URL).
 *
 * The matchmaker does NOT differentiate `match_not_found` for "ID is
 * unknown" vs. "ID is private and you don't have the token" — both
 * return the same error code (FR-006).
 */
export type MatchVisibility = 'public' | 'private';

// ----------------------------------------------------------------------------
// Match lifecycle status
// ----------------------------------------------------------------------------

/**
 * Lifecycle state of a `MatchRecord`. Mirrors the spec's FR-012 state
 * machine, collapsed into four states (no separate `'created'` — creation
 * transitions to `'filling'` atomically with seating the creator).
 *
 * State transitions are server-side only; clients receive
 * `MatchStatusChanged` events over the network transport (via feature
 * 004 protocol messages, not via the matchmaker contract).
 *
 *   - `'filling'`   → accepting new seats; engine session not yet created
 *   - `'running'`   → all seats filled; engine session driving the tick
 *   - `'finished'`  → engine reported terminal; holding `MatchResultsRecord`
 *                     and rematch window
 *   - `'collected'` → torn down; no resources held
 */
export type MatchStatus = 'filling' | 'running' | 'finished' | 'collected';

// ----------------------------------------------------------------------------
// Seat
// ----------------------------------------------------------------------------

/**
 * Seat index within a match. 0..(playerCount - 1). Integer.
 *
 * Not branded (it's just a number constrained at the matchmaker's
 * boundary; no other primitive in the codebase conflicts with it).
 */
export type SeatIndex = number;

/**
 * What a seat-bound client receives upon successful createMatch /
 * joinMatch. Carries the matchmaking-issued credentials needed to
 * (a) reconnect to the same seat, and (b) submit rematch votes.
 */
export interface SeatAssignment {
  /** Matchmaking-owned identity (FR-001). */
  readonly playerSessionId: PlayerSessionId;
  /** Position in seat order (0..playerCount-1). */
  readonly seatIndex: SeatIndex;
  /**
   * Engine PlayerId (1..playerCount). Assigned once the match transitions
   * to `'running'`; for `'filling'` matches this is `seatIndex + 1`.
   */
  readonly playerId: PlayerId;
  /** Networking-bound token for reconnect. UUID v4 (feature 004 boundary). */
  readonly sessionToken: SessionToken;
  /** Cosmetic name the seat-holder chose (FR-001). */
  readonly displayName: string;
}

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------

/**
 * Player-facing tunables accepted by `createMatch`. The matchmaker fills
 * any missing field from `DEFAULT_MATCH_SETTINGS` and validates the
 * resulting shape.
 *
 * `boardSize`, `playerCount`, and `tickIntervalMs` are matchmaking-owned
 * but map 1:1 to fields in `@europa/engine`'s `MatchConfig`.
 * `terrainSettings` is owned by `@europa/terrain` and passed through.
 */
export interface MatchSettings {
  /** Player count (engine FR-019: 2..4). v1 ships 2 end-to-end. */
  readonly playerCount: 2 | 3 | 4;
  /** Square board dimension. Clamped to `[8, 128]`. */
  readonly boardSize: number;
  /** Tick interval in ms (engine default 250). */
  readonly tickIntervalMs: number;
  /** Terrain knobs (water ratio, roughness, etc.). Defaults applied if omitted. */
  readonly terrainSettings: GenerationSettings;
}

/**
 * Default settings used when `MatchSettings` fields are omitted.
 * Stored as a single constant so the matchmaker can compare
 * caller-supplied values against this reference.
 */
export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  playerCount: 2,
  boardSize: 32,
  tickIntervalMs: 250,
  terrainSettings: DEFAULT_GENERATION_SETTINGS,
} as const;

// ----------------------------------------------------------------------------
// LobbyEntry (public projection)
// ----------------------------------------------------------------------------

/**
 * What the lobby exposes to clients. Spec FR-005 mandates:
 * "id, display info, seat occupancy, settings".
 *
 * Only produced for matches with `status === 'filling'` AND
 * `visibility === 'public'`. The matchmaker rebuilds this projection
 * on every `listPublicMatches()` call (O(N) for N joinable matches;
 * acceptable at v1 scale ≤64).
 *
 * Private matches are NEVER projected here (Q1 + Q2 clarifications).
 */
export interface LobbyEntry {
  readonly matchId: MatchId;
  /** Creator's display name (the host). */
  readonly hostDisplayName: string;
  readonly playerCount: number;
  /** 1..playerCount; updated live. */
  readonly seatsFilled: number;
  readonly boardSize: number;
  /** Always `'public'` for lobby entries. */
  readonly visibility: 'public';
  readonly createdAtMs: number;
  /** Convenience: `(now - createdAtMs) / 1000`. */
  readonly ageSeconds: number;
}

// ----------------------------------------------------------------------------
// Join URL shape
// ----------------------------------------------------------------------------

/**
 * Relative path the matchmaker returns. Always `/join/<matchId>`. The
 * host server binary composes the full URL using its public base URL
 * (if known) — see `JoinUrlResult`.
 */
export type JoinPath = string;

/**
 * What the matchmaker returns from a successful `createMatch` or
 * `joinMatch`. Includes both the relative `joinPath` (always present)
 * and the full `joinUrl` (present iff `MatchmakerConfig.publicBaseUrl`
 * was supplied).
 */
export interface JoinUrlResult {
  readonly matchId: MatchId;
  readonly joinPath: JoinPath;
  /** Full shareable URL; `null` if no public base URL is configured. */
  readonly joinUrl: string | null;
}

// ----------------------------------------------------------------------------
// Error code + error shape
// ----------------------------------------------------------------------------

/**
 * Closed union of all matchmaker error codes. Clients (feature 005)
 * switch on `code` to render localized messages; the `message` field
 * is human-readable English for logs only.
 *
 * Codes mirror networking's `ErrorCode` where the semantics overlap
 * (`match_not_found`, `match_full`, etc.); they are distinct types
 * because the matchmaker is a separate API surface.
 */
export type MatchmakerErrorCode =
  /** Bad request shape (empty displayName, unknown visibility, ...). */
  | 'invalid_request'
  /**
   * Match ID unknown OR private-without-token OR expired OR collected.
   * Single code path; no existence leak (FR-006 + Q2 clarification).
   */
  | 'match_not_found'
  /** All seats taken. */
  | 'match_full'
  /** Match already running; not a reconnect. */
  | 'match_not_joinable'
  /** Reconnect race; another connection claimed the seat first. */
  | 'seat_taken'
  /** sessionToken doesn't match any seat in the match. */
  | 'session_invalid'
  /** Reconnect grace window expired. */
  | 'session_expired'
  /** Action references a player that's not seated in this match. */
  | 'player_not_in_match'
  /** Rematch request after window expired. */
  | 'rematch_window_closed'
  /** No rematch is pending for this match. */
  | 'rematch_not_offered'
  /** Double-vote (already accepted or declined). */
  | 'rematch_already_voted'
  /** (Future) per-player action rate limit. */
  | 'rate_limited'
  /** Catch-all; logged on the server, surfaced to clients as `'internal_error'`. */
  | 'internal_error';

/**
 * Error payload returned by every failing matchmaker call. Never thrown
 * for expected failures (those return a `Result`-shaped value); thrown
 * only for invariant violations, which crash the process.
 */
export interface MatchmakerError {
  readonly code: MatchmakerErrorCode;
  /** Human-readable English; localizable via `code`. */
  readonly message: string;
  /** Optional machine-readable detail (e.g., expected vs actual). */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

// ----------------------------------------------------------------------------
// Result shapes (every public method returns one of these)
// ----------------------------------------------------------------------------

/**
 * Success payload shared by both `createMatch` and `joinMatch`.
 */
export interface SeatAssignedResult extends JoinUrlResult {
  readonly seatAssignment: SeatAssignment;
}

export type CreateMatchResult =
  | { readonly ok: true; readonly data: SeatAssignedResult }
  | { readonly ok: false; readonly error: MatchmakerError };

export type JoinMatchResult =
  | { readonly ok: true; readonly data: SeatAssignedResult }
  | { readonly ok: false; readonly error: MatchmakerError };

export type LeaveMatchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: MatchmakerError };

export type RequestRematchResult =
  | { readonly ok: true; readonly rematchOfferId: MatchId }
  | { readonly ok: false; readonly error: MatchmakerError };

export type AcceptRematchResult =
  | { readonly ok: true; readonly allAccepted: boolean; readonly newMatchId?: MatchId; readonly newSeatAssignment?: SeatAssignment }
  | { readonly ok: false; readonly error: MatchmakerError };

export type DeclineRematchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: MatchmakerError };

export type ListPublicMatchesResult =
  | { readonly ok: true; readonly matches: ReadonlyArray<LobbyEntry> }
  | { readonly ok: false; readonly error: MatchmakerError };

// ----------------------------------------------------------------------------
// Request shapes (every public method accepts one of these)
// ----------------------------------------------------------------------------

export interface CreateMatchRequest {
  readonly visibility: MatchVisibility;
  /** FR-001: 1..32 chars; validated by the matchmaker. */
  readonly displayName: string;
  /** Partial — missing fields merged with `DEFAULT_MATCH_SETTINGS`. */
  readonly settings?: Partial<Omit<MatchSettings, 'terrainSettings'>> & {
    readonly terrainSettings?: Partial<GenerationSettings>;
  };
}

export interface JoinMatchRequest {
  readonly matchId: MatchId;
  readonly displayName: string;
  /** Absent for new joins; present for reconnects. */
  readonly reconnectToken?: SessionToken;
}

export interface LeaveMatchRequest {
  readonly matchId: MatchId;
  readonly sessionToken: SessionToken;
}

export interface RequestRematchRequest {
  /** The FINISHED match's id. */
  readonly matchId: MatchId;
  readonly sessionToken: SessionToken;
}

export interface AcceptRematchRequest {
  /** The FINISHED match's id. */
  readonly matchId: MatchId;
  /** The rematch offer's id (== new match's MatchId, distinct from the original). */
  readonly rematchOfferId: MatchId;
  readonly sessionToken: SessionToken;
}

export interface DeclineRematchRequest {
  readonly matchId: MatchId;
  readonly rematchOfferId: MatchId;
  readonly sessionToken: SessionToken;
}

// ----------------------------------------------------------------------------
// Stats
// ----------------------------------------------------------------------------

/**
 * Snapshot of matchmaker internals for `/health`, metrics, and SC-005
 * soak tests. Cheap to read.
 */
export interface MatchmakerStats {
  readonly activeMatches: number;
  readonly fillingMatches: number;
  readonly runningMatches: number;
  readonly finishedMatches: number;
  readonly collectedMatches: number;
  readonly publicJoinableMatches: number;
  readonly activePlayerSessions: number;
  /** Monotonic since process start. */
  readonly totalCreated: number;
  readonly totalFinished: number;
  readonly totalCollected: number;
  readonly totalForfeits: number;
  readonly totalRematchAccepted: number;
  readonly totalRematchDeclined: number;
  /** Epoch ms of matchmaker construction. */
  readonly uptimeMs: number;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/**
 * All tunable constants for the matchmaker. Mirrors the engine's
 * `ENGINE_CONSTANTS` discipline (feature 001 research.md §9).
 *
 * Override per deployment via `MatchmakerConfig` (which mirrors this
 * shape field-for-field).
 */
export interface MatchmakerConstants {
  /** Max concurrent matches on this server (mirrors feature 004). */
  readonly maxConcurrentMatches: number;
  /** TTL for empty unstarted matches (FR-011 edge case). */
  readonly emptyMatchTtlMs: number;
  /** TTL for `finished` matches holding results before GC. */
  readonly resultsTtlMs: number;
  /** Rematch acceptance window (FR-009). */
  readonly rematchWindowMs: number;
  /** Max display name length (FR-001 cosmetic cap). */
  readonly maxDisplayNameLength: number;
  /** Min display name length. */
  readonly minDisplayNameLength: number;
  /** Sweep interval for the empty-match garbage collector. */
  readonly sweepIntervalMs: number;
}

/**
 * Default constants. Single source of truth; deployments override via
 * `MatchmakerConfig`.
 */
export const MATCHMAKING_CONSTANTS: MatchmakerConstants = {
  maxConcurrentMatches: 64,
  emptyMatchTtlMs: 5 * 60 * 1000,
  resultsTtlMs: 60 * 1000,
  rematchWindowMs: 60 * 1000,
  maxDisplayNameLength: 32,
  minDisplayNameLength: 1,
  sweepIntervalMs: 30 * 1000,
} as const;
