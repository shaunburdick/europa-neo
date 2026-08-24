/**
 * Tunable constants — Feature 006 (T011)
 *
 * The single location for every matchmaker tunable, mirroring the
 * engine's `ENGINE_CONSTANTS` discipline (feature 001 research.md §9;
 * feature 006 research.md §12): no magic numbers anywhere else in the
 * package — everything reads from here or from the caller-supplied
 * `MatchmakerConfig` overrides.
 *
 * `MATCHMAKING_CONSTANTS` is the frozen default set documented in
 * `contracts/match-types.ts`. `MATCHMAKING_DEFAULT_CONFIG` mirrors it
 * field-for-field as a `MatchmakerConfig` so tests and the host binary
 * can spread one object and override individual knobs.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { MatchmakerConstants } from '../contracts/match-types';
import type { MatchmakerConfig } from '../contracts/matchmaking-api';

/**
 * Default matchmaker constants (single source of truth).
 *
 * Values per `contracts/match-types.ts`: 64 concurrent matches,
 * 5-minute empty-match TTL, 60-second results TTL, 60-second rematch
 * window, display names 1..32 chars, 30-second sweep interval.
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

const {
    emptyMatchTtlMs,
    maxConcurrentMatches,
    maxDisplayNameLength,
    minDisplayNameLength,
    rematchWindowMs,
    resultsTtlMs,
    sweepIntervalMs,
} = MATCHMAKING_CONSTANTS;

/**
 * Default `MatchmakerConfig` — every knob mirrors
 * `MATCHMAKING_CONSTANTS`; `publicBaseUrl` is left unset (callers opt
 * in to full shareable URLs). Used by tests and as the base for the
 * host binary's configuration.
 */
export const MATCHMAKING_DEFAULT_CONFIG: MatchmakerConfig = {
    emptyMatchTtlMs,
    maxConcurrentMatches,
    maxDisplayNameLength,
    minDisplayNameLength,
    rematchWindowMs,
    resultsTtlMs,
    sweepIntervalMs,
} as const;
