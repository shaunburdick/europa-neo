/**
 * Matchmaker error shapes — Feature 006 (T012)
 *
 * Implements the error half of `contracts/match-types.ts`: the closed
 * `MatchmakerErrorCode` union and the `MatchmakerError` payload, plus
 * the `makeError` factory.
 *
 * Error strategy per research.md §11 + spec FR-006: a closed string
 * union (exhaustive, switchable by clients) rather than exception
 * classes. Expected failures are **returned** as `Result`-shaped
 * values (`{ ok: false, error }`) — the matchmaker never throws for
 * them. Throwing is reserved for invariant violations, which crash the
 * process (correctness over availability).
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { MatchmakerError, MatchmakerErrorCode } from '../contracts/match-types';

/**
 * Human-readable default message for every error code. The exhaustive
 * `Record<MatchmakerErrorCode, string>` annotation makes the compiler
 * reject any future code added to the union without a message — the
 * closed union stays closed end-to-end.
 */
const DEFAULT_MESSAGES: Readonly<Record<MatchmakerErrorCode, string>> = {
    invalid_request: 'Invalid request',
    match_not_found: 'Match not found',
    match_full: 'Match is full',
    match_not_joinable: 'Match is not joinable',
    seat_taken: 'Seat already taken',
    session_invalid: 'Session token is invalid',
    session_expired: 'Session has expired',
    player_not_in_match: 'Player is not in this match',
    rematch_window_closed: 'Rematch window has closed',
    rematch_not_offered: 'No rematch is offered for this match',
    rematch_already_voted: 'Rematch vote already cast',
    rate_limited: 'Too many requests',
    internal_error: 'Internal error',
} as const;

/**
 * Construct a `MatchmakerError` payload.
 *
 * The factory exists so every failing call site produces a consistent
 * shape with a human-readable English default message (localization is
 * the client's job via the `code`; FR-006). Never throws.
 *
 * @param code - The closed-union error code.
 * @param message - Optional override for the default English message.
 * @param detail - Optional machine-readable detail (e.g., expected vs
 *   actual) for logs and tests.
 * @returns A frozen `MatchmakerError` payload.
 */
export function makeError(
    code: MatchmakerErrorCode,
    message?: string,
    detail?: Readonly<Record<string, string | number | boolean>>,
): MatchmakerError {
    const error: MatchmakerError = {
        code,
        message: message ?? DEFAULT_MESSAGES[code],
    };
    if (detail !== undefined) {
        return Object.freeze({ ...error, detail });
    }
    return Object.freeze(error);
}
