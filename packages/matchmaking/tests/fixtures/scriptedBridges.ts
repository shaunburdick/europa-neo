/**
 * Scripted bridge payload builders — Feature 006 test fixture (T030)
 *
 * Pure, frozen constructors for `MatchmakerBridge` event payloads
 * (`contracts/matchmaking-api.ts` §"MatchmakerBridge"; canonical
 * shapes from networking's `network-api.ts`). Used with the
 * `FakeServer.fireOn*` triggers so tests fire bridge events with
 * well-typed payloads instead of hand-built object literals.
 *
 * **Deviation note (documented per dispatch)**: T030's prose lists an
 * `expiredAtMs` field on the seat-expired payload; networking's
 * actual `onSeatExpired` event carries only
 * `{ matchId, sessionToken, playerId }` — contracts win over task
 * prose, so the builder matches the real shape.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { PlayerId } from '@europa/engine';
import type {
  ConnectionId,
  ConnectionRole,
  MatchId,
  MatchResult,
  SessionToken,
} from '@europa/networking';

/**
 * Assert a plain string into a branded string type (mirrors
 * networking's `toBranded`; brands prevent accidental interchange of
 * distinct id kinds in user code).
 */
function toBranded<T extends string>(value: string): T {
  return value as T;
}

/** Args for {@linkcode buildSeatClaimedPayload}. */
export interface SeatClaimedArgs {
  readonly matchId: MatchId;
  /** Plain connection handle; branded here. */
  readonly connectionId: string;
  readonly sessionToken: SessionToken;
  /** Engine player id, or `null` for spectators. */
  readonly playerId: PlayerId | null;
  readonly role: ConnectionRole;
}

/** Build an `onSeatClaimed` payload. */
export function buildSeatClaimedPayload(args: SeatClaimedArgs): {
  matchId: MatchId;
  connectionId: ConnectionId;
  sessionToken: SessionToken;
  playerId: PlayerId | null;
  role: ConnectionRole;
} {
  return Object.freeze({
    matchId: args.matchId,
    connectionId: toBranded<ConnectionId>(args.connectionId),
    sessionToken: args.sessionToken,
    playerId: args.playerId,
    role: args.role,
  });
}

/** Args for {@linkcode buildSeatDisconnectedPayload}. */
export interface SeatConnectionArgs {
  readonly matchId: MatchId;
  readonly connectionId: string;
  readonly sessionToken: SessionToken;
}

/** Build an `onSeatDisconnected` payload. */
export function buildSeatDisconnectedPayload(args: SeatConnectionArgs): {
  matchId: MatchId;
  connectionId: ConnectionId;
  sessionToken: SessionToken;
} {
  return Object.freeze({
    matchId: args.matchId,
    connectionId: toBranded<ConnectionId>(args.connectionId),
    sessionToken: args.sessionToken,
  });
}

/** Build an `onSeatReconnected` payload. */
export function buildSeatReconnectedPayload(args: SeatConnectionArgs): {
  matchId: MatchId;
  connectionId: ConnectionId;
  sessionToken: SessionToken;
} {
  return Object.freeze({
    matchId: args.matchId,
    connectionId: toBranded<ConnectionId>(args.connectionId),
    sessionToken: args.sessionToken,
  });
}

/** Args for {@linkcode buildSeatExpiredPayload}. */
export interface SeatExpiredArgs {
  readonly matchId: MatchId;
  readonly sessionToken: SessionToken;
  /** Engine player id, or `null` for spectators. */
  readonly playerId: PlayerId | null;
}

/**
 * Build an `onSeatExpired` payload. Matches networking's real event
 * shape exactly — no `expiredAtMs` (see module doc deviation note).
 */
export function buildSeatExpiredPayload(args: SeatExpiredArgs): {
  matchId: MatchId;
  sessionToken: SessionToken;
  playerId: PlayerId | null;
} {
  return Object.freeze({
    matchId: args.matchId,
    sessionToken: args.sessionToken,
    playerId: args.playerId,
  });
}

/** Args for {@linkcode buildMatchTerminalPayload}. */
export interface MatchTerminalArgs {
  readonly matchId: MatchId;
  /** The engine's terminal result for the match. */
  readonly result: MatchResult;
  /** Tick at which the terminal condition was reached. */
  readonly tick: number;
}

/** Build an `onMatchTerminal` payload. */
export function buildMatchTerminalPayload(args: MatchTerminalArgs): {
  matchId: MatchId;
  result: MatchResult;
  tick: number;
} {
  return Object.freeze({
    matchId: args.matchId,
    result: args.result,
    tick: args.tick,
  });
}
