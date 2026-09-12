/**
 * Canonical Player ID Fixtures — issue #74
 *
 * Test-only canonical identities for engine tests. Every value is a real
 * 12-character canonical `PlayerId` (validated by `parsePlayerId`), so
 * the engine's registry accepts them and no test needs an `as PlayerId`
 * escape hatch.
 *
 * The IDs are chosen so their UTF-16 code-unit order matches the
 * `PLAYER_1..4` naming order, keeping the dense indexes in fixtures easy
 * to reason about. Registry ordering tests use deliberately out-of-order
 * edge IDs defined inline in `playerRegistry.test.ts`.
 */

import { parsePlayerId } from '@europa/core';
import { createPlayerRegistry } from '../../src/playerRegistry';
import type { PlayerId } from '../../src/types';

/** Slot-1 canonical identity. */
export const PLAYER_1: PlayerId = parsePlayerId('PLAYER000001');

/** Slot-2 canonical identity. */
export const PLAYER_2: PlayerId = parsePlayerId('PLAYER000002');

/** Slot-3 canonical identity. */
export const PLAYER_3: PlayerId = parsePlayerId('PLAYER000003');

/** Slot-4 canonical identity. */
export const PLAYER_4: PlayerId = parsePlayerId('PLAYER000004');

/**
 * A fifth canonical identity, used only by negative tests that must
 * exceed the engine's 2–4 player bound.
 */
export const PLAYER_5: PlayerId = parsePlayerId('PLAYER000005');

/**
 * A canonical but deliberately unregistered identity, used by tests that
 * must prove unknown/forged IDs fail closed.
 */
export const UNKNOWN_PLAYER: PlayerId = parsePlayerId('ZZZZZZZZZZZZ');

/** All four canonical fixture identities in slot order. */
export const ALL_PLAYERS: readonly PlayerId[] = Object.freeze([PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4]);

/**
 * Build the explicit `playerIds` list for a 2–4 player fixture.
 *
 * @param count - Player count (2, 3, or 4).
 * @returns A frozen array of canonical IDs in slot order.
 */
export function playerIds(count: 2 | 3 | 4): readonly PlayerId[] {
    return ALL_PLAYERS.slice(0, count);
}

/**
 * A 4-player registry matching the dense owner bytes `1..4` used by
 * hand-built `WorldState` fixtures in resolver unit tests. `idAt(byte - 1)`
 * therefore resolves to `PLAYER_1..PLAYER_4`.
 */
export const TEST_REGISTRY = createPlayerRegistry(playerIds(4));
