/**
 * Canonical Test Identities — Feature 002 (issue #74)
 *
 * Fog's tests need real, canonical 12-character `PlayerId` values —
 * the engine no longer accepts numeric identities, and the fixture
 * tier must exercise the same universal-ID boundary production does.
 *
 * `@europa/fog` intentionally does not depend on `@europa/core` (its
 * only runtime dependency is `@europa/engine`), so the canonical
 * validator is not importable here. `fixturePlayerId` is the single
 * audited seam that validates a fixture literal against the canonical
 * alphabet/length and then brands it. It **validates before branding**
 * — it is not a cast used in place of runtime validation.
 *
 * Ordering note: the engine's registry sorts IDs with the explicit
 * UTF-16 code-unit comparator, so `Player000001 < Player000002 < …`.
 * The named constants below therefore appear in the same order as the
 * dense owner bytes (`P1` → byte 1, `P2` → byte 2, …), which keeps the
 * raw-byte assertions in tests easy to reason about. Fixture code
 * still resolves IDs through the world registry rather than assuming
 * that coincidence.
 */

import type { PlayerId } from '@europa/engine';

/** Canonical identity shape: exactly 12 characters from `A-Za-z0-9_-`. */
const CANONICAL_PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

/**
 * Validate a fixture literal against the canonical identity shape and
 * return it branded as a `PlayerId`.
 *
 * @param value - A fixture literal that MUST already be canonical.
 * @returns The same string, branded as a `PlayerId`.
 * @throws {Error} When `value` is not exactly 12 canonical characters
 *         (a test-author bug — fixtures must use valid identities).
 */
export function fixturePlayerId(value: string): PlayerId {
    if (!CANONICAL_PLAYER_ID_PATTERN.test(value)) {
        throw new Error(`fixturePlayerId: "${value}" is not a canonical 12-character player id`);
    }
    return value as PlayerId;
}

/**
 * Present a raw adversarial value as a `PlayerId` for negative tests.
 *
 * The fog API declares `player: PlayerId`, but at the runtime boundary
 * a forged, malformed, or numeric value can be anything. This helper
 * models that adversarial input at the type level; it is used **only**
 * to prove that unregistered values fail closed.
 *
 * @param value - Any raw value an attacker could supply.
 * @returns The same value, branded as a `PlayerId` for the negative
 *          test call site.
 */
export function untrustedPlayerId(value: unknown): PlayerId {
    return value as PlayerId;
}

/**
 * An identity that sorts **before** `P1` in UTF-16 order (`A…` < `P…`).
 * Used to force a real dense-seat/index reassignment: including this
 * ID in a match's `playerIds` set shifts `P1` from dense index 0 to 1
 * without changing `P1` itself.
 */
export const A0 = fixturePlayerId('A00000000001');

/** First canonical fixture identity (dense owner byte 1). */
export const P1 = fixturePlayerId('Player000001');

/** Second canonical fixture identity (dense owner byte 2). */
export const P2 = fixturePlayerId('Player000002');

/** Third canonical fixture identity (dense owner byte 3). */
export const P3 = fixturePlayerId('Player000003');

/** Fourth canonical fixture identity (dense owner byte 4). */
export const P4 = fixturePlayerId('Player000004');

/**
 * Ordered canonical fixture identities in registry (UTF-16) order.
 * Slices of length 2–4 are the `MatchConfig.playerIds` lists.
 */
export const PLAYER_IDS: readonly PlayerId[] = Object.freeze([P1, P2, P3, P4]);

/**
 * A well-formed but deliberately **unregistered** identity, used to
 * prove that a forged ID cannot select a viewer or disclose state.
 */
export const FORGED_ID = fixturePlayerId('F0rged000001');

/** A non-canonical identity (wrong length) for failure tests. */
export const MALFORMED_ID = untrustedPlayerId('short-id');

/** A numeric identity for failure tests (`1` is never coerced). */
export const NUMERIC_ID = untrustedPlayerId(1);
