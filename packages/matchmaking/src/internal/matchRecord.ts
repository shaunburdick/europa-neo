/**
 * MatchRecord + RematchOffer — server-internal record shapes
 * (Feature 006, T018)
 *
 * Per `data-model.md` §5 and §9. The `MatchRecord` is the single
 * source of truth for one match's lifecycle, driven through the FR-012
 * state machine:
 *
 *   (create) → filling → running → finished → collected
 *                  └─────────────────────────┘ (empty-match TTL /
 *                                              creator leaves)
 *
 * `engineSession` is non-null iff the status is `'running'` or
 * `'finished'`; `results` is set on `running → finished`; a
 * `RematchOffer` is attached while a rematch window is open.
 *
 * @internal Exported for testability only; not part of the public
 * surface re-exported through the package barrel.
 *
 * Pure module: no clock reads, no randomness — timestamps arrive via
 * the factory's arguments (constitution Principle II).
 */

import type { MatchConfig } from '@europa/engine';
import type { EngineSession, MatchId } from '@europa/networking';

import type {
  MatchResultsRecord,
  MatchSettings,
  MatchStatus,
  MatchVisibility,
  PlayerSessionId,
  SeatIndex,
} from '../../contracts/match-types';
import type { SeatRecord } from './seatRecord';

/**
 * A pending rematch window on a `finished` match (data-model §9).
 * Votes are tracked per `PlayerSessionId` because a forfeited
 * participant may have lost their session entirely — they are then
 * effectively absent from the vote (spec edge case "rematch
 * participant has left").
 */
export interface RematchOffer {
  /**
   * Identity of the potential new match — a freshly minted `MatchId`,
   * distinct from the original match's id (FR-009).
   */
  readonly offerId: MatchId;
  /** Epoch ms after which an unresolved window expires. */
  readonly windowExpiresAtMs: number;
  /** Original participants who voted accept. */
  readonly acceptedBy: Set<PlayerSessionId>;
  /** Original participants who voted decline. */
  readonly declinedBy: Set<PlayerSessionId>;
  /** Snapshot of every original seated player's session id. */
  readonly allOriginalPlayerIds: ReadonlyArray<PlayerSessionId>;
  /** The new match once all votes accept; `null` until resolved. */
  newMatchRecord: MatchRecord | null;
}

/**
 * Server-internal lifecycle record for one match (data-model §5).
 * The public surface never exposes this shape directly — clients see
 * projections (`LobbyEntry`, `SeatAssignment`, results payloads).
 */
export interface MatchRecord {
  /** Unique server-issued id (UUID v4). */
  readonly matchId: MatchId;
  /** Lobby visibility; fixed at creation (no mutation API). */
  readonly visibility: MatchVisibility;
  /** Lifecycle state (FR-012 state machine); starts as `'filling'`. */
  status: MatchStatus;
  /** Immutable player-facing settings captured at creation. */
  readonly settings: MatchSettings;
  /** Engine config; frozen when the match transitions to `running`. */
  engineConfig: MatchConfig | null;
  /** Occupied seats keyed by seat index; size ≤ `settings.playerCount`. */
  readonly seats: Map<SeatIndex, SeatRecord>;
  /** Epoch ms of creation. */
  readonly createdAtMs: number;
  /** Epoch ms of the atomic `filling → running` transition. */
  startedAtMs: number | null;
  /** Epoch ms of the `running → finished` transition. */
  finishedAtMs: number | null;
  /** Terminal results; set on `running → finished`. */
  results: MatchResultsRecord | null;
  /** Open rematch offer, or `null` when no window is open. */
  rematch: RematchOffer | null;
  /** Live engine session; non-null iff `running` or `finished`. */
  engineSession: EngineSession | null;
  /** Epoch ms of the last state-changing op; drives empty-match TTL. */
  lastActivityAtMs: number;
  /** Stable shareable path `/join/<matchId>`; immutable. */
  readonly joinPath: string;
}

/**
 * Arguments for {@linkcode createMatchRecord}.
 */
export interface CreateMatchRecordArgs {
  /** Freshly minted unique match id. */
  readonly matchId: MatchId;
  /** Lobby visibility (FR-002); fixed for the match's lifetime. */
  readonly visibility: MatchVisibility;
  /** Validated, defaults-applied settings (FR-002). */
  readonly settings: MatchSettings;
  /** Epoch ms of creation (also seeds {@linkcode MatchRecord.lastActivityAtMs}). */
  readonly createdAtMs: number;
}

/**
 * Create a match record in the initial `'filling'` state with no
 * seats, no engine session, and no results. Seats are added by the
 * create/fill path (`addSeatToFillingMatch`, Phase 3).
 *
 * @param args - Identity, visibility, settings, and creation time.
 * @returns A fresh `MatchRecord` with `status: 'filling'`.
 */
export function createMatchRecord(args: CreateMatchRecordArgs): MatchRecord {
  const { createdAtMs, matchId, settings, visibility } = args;
  return {
    matchId,
    visibility,
    status: 'filling',
    settings,
    engineConfig: null,
    seats: new Map<SeatIndex, SeatRecord>(),
    createdAtMs,
    startedAtMs: null,
    finishedAtMs: null,
    results: null,
    rematch: null,
    engineSession: null,
    lastActivityAtMs: createdAtMs,
    joinPath: `/join/${matchId}`,
  };
}
