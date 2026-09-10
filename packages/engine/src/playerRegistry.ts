/**
 * PlayerRegistry — Internal-index ↔ external-ID mapping (Feature 025)
 *
 * The engine's `WorldState` uses `Uint8Array` for `troopOwners` and
 * `cityOwners` (1 byte per cell — critical for tick performance on
 * 32×32+ boards). String PlayerIds cannot fit in a single byte.
 *
 * This module provides the bidirectional mapping between:
 *   - External world (public API): string PlayerId ("AbC123xYz90Q")
 *   - Internal world (WorldState): numeric index (0, 1, 2, 3)
 *
 * The registry is held by `World` and used at the boundary between
 * the public API (string IDs) and the internal typed arrays (numeric
 * indices). Resolution modules (combat, capture, flow, etc.) operate
 * on numeric indices and do NOT see string IDs.
 *
 * **Determinism**: `sortedIds` is pre-computed at construction and
 * never mutated. `indexOfId` uses a `Map<string, number>` for O(1)
 * lookup. The sort order is `localeCompare` on ASCII alphanumeric
 * strings (NanoID guarantee), which produces a stable total order
 * across JS engines (FR-017).
 */

import type { PlayerId } from '@europa/core';

/**
 * Bidirectional mapping between string PlayerIds and numeric indices.
 *
 * Constructed once per match via `createPlayerRegistry`. Immutable.
 */
export interface PlayerRegistry {
    /** String PlayerId at internal index `i` (0-based). */
    idAtIndex(i: number): PlayerId;

    /** Internal 0-based index for a given string PlayerId. */
    indexOfId(id: PlayerId): number;

    /** All IDs in deterministic order (sorted by localeCompare). */
    readonly sortedIds: readonly PlayerId[];

    /** Player count (2–4). */
    readonly size: number;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

/**
 * Create a `PlayerRegistry` from an array of string PlayerIds.
 *
 * @param ids Non-empty array of unique, non-empty string PlayerIds.
 *            Length must be ∈ [2, 4].
 * @returns A `PlayerRegistry` with pre-sorted IDs and O(1) index lookup.
 * @throws If ids length is outside [2, 4], contains duplicates, or
 *         contains empty strings.
 */
export function createPlayerRegistry(ids: readonly PlayerId[]): PlayerRegistry {
    if (!Array.isArray(ids) || ids.length < MIN_PLAYERS || ids.length > MAX_PLAYERS) {
        throw new Error(
            `createPlayerRegistry: ids length must be ${String(MIN_PLAYERS)}–${String(MAX_PLAYERS)} (got ${String(ids.length)})`,
        );
    }

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id === undefined || id === '') {
            throw new Error(`createPlayerRegistry: ids[${String(i)}] must be a non-empty string`);
        }
    }

    // Check uniqueness.
    const seen = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) {
            throw new Error(`createPlayerRegistry: duplicate id "${id}"`);
        }
        seen.add(id);
    }

    // Pre-compute sorted order (stable localeCompare on ASCII alphanumeric).
    const sortedIds = Object.freeze([...ids].sort((a, b) => a.localeCompare(b)));

    // Build index map (O(1) lookup) — positions in the SORTED array,
    // so indexOfId(i) is the inverse of idAtIndex(i): the 1-based
    // values stored in WorldState cityOwners/troopOwners match the
    // sorted order, not the original insertion order.
    const indexMap = new Map<string, number>();
    for (let i = 0; i < sortedIds.length; i++) {
        const id = sortedIds[i];
        if (id !== undefined) {
            indexMap.set(id, i);
        }
    }

    return {
        idAtIndex(i: number): PlayerId {
            const id = sortedIds[i];
            if (id === undefined) {
                throw new Error(
                    `PlayerRegistry.idAtIndex: index ${String(i)} out of range (size ${String(sortedIds.length)})`,
                );
            }
            return id;
        },

        indexOfId(id: PlayerId): number {
            const idx = indexMap.get(id);
            if (idx === undefined) {
                throw new Error(`PlayerRegistry.indexOfId: unknown player id "${id}"`);
            }
            return idx;
        },

        sortedIds,
        size: ids.length,
    };
}
