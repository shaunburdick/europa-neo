/**
 * PlayerRegistry — the engine's only ID ↔ dense-index mapping (issue #74)
 *
 * The engine's hot-path state (`WorldState.troopOwners` and
 * `WorldState.cityOwners`) is stored as one byte per cell for tick
 * performance on 32×32+ boards. A 12-character branded `PlayerId`
 * cannot fit in that byte, so the engine keeps a private dense numeric
 * coordinate internally and maps it back to the canonical public ID at
 * every public boundary.
 *
 * This module is the **single supported conversion** between the two
 * representations:
 *
 * ```text
 * PlayerId (public, canonical 12-char string) <-> DensePlayerIndex (0..N-1)
 * ```
 *
 * ## Byte encoding invariant
 *
 * Typed-array owner slots use a **1-based** dense encoding so that `0`
 * can remain the neutral/no-owner sentinel:
 *
 * ```text
 * byte 0            => no owner (neutral cell / no city)
 * byte k (1..N)     => the player at DensePlayerIndex k - 1
 * ```
 *
 * i.e. `denseIndex === byte - 1`. Resolution modules therefore still
 * read/write plain bytes; only event and view payloads cross back to
 * `PlayerId` via {@link PlayerRegistry.requireIdAt} /
 * {@link PlayerRegistry.idAt}.
 *
 * ## Determinism
 *
 * Registry construction sorts a copy of the validated IDs with
 * {@link compareUtf16} — an explicit UTF-16 code-unit comparator. It
 * never uses `localeCompare`, locale-sensitive collation, numeric
 * coercion, or seat arithmetic, so the dense ordering is identical on
 * every host locale and independent of the caller's insertion order.
 *
 * The registry is immutable after construction (frozen array + private
 * `Map`); later seat or index reassignment rebuilds a new registry
 * rather than mutating this one.
 */

import type { PlayerId } from '@europa/core';
import { isPlayerId } from '@europa/core';

/**
 * Private dense player coordinate, `0..N-1`, valid only through a
 * {@link PlayerRegistry}. This is not a public identity and is never
 * serialized, sorted, or compared lexically.
 */
export type DensePlayerIndex = number;

/** Minimum players in a match (spec FR-019). */
export const MIN_PLAYERS_PER_MATCH = 2;

/** Maximum players in a match (spec FR-019). */
export const MAX_PLAYERS_PER_MATCH = 4;

/**
 * Explicit UTF-16 code-unit comparator (issue #74, engine contract).
 *
 * Compares `a` and `b` code unit by code unit via
 * `String.prototype.charCodeAt`; at the first differing index the
 * lower code unit sorts first. If one string is a prefix of the other,
 * the shorter string sorts first. Equal strings return `0`.
 *
 * This is intentionally not `localeCompare`: locale-sensitive
 * collation can order `Z`/`a`/`_`/`-` differently per host, which would
 * make authoritative ordering non-deterministic (spec FR-021). The
 * comparator does not coerce either argument and does not read locale
 * or environment state.
 *
 * @param a - Left-hand string (typically a canonical `PlayerId`).
 * @param b - Right-hand string (typically a canonical `PlayerId`).
 * @returns A negative number if `a < b`, a positive number if `a > b`,
 *          or `0` when the strings are identical.
 */
export function compareUtf16(a: string, b: string): number {
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) {
        const diff = a.charCodeAt(i) - b.charCodeAt(i);
        if (diff !== 0) {
            return diff;
        }
    }
    return a.length - b.length;
}

/**
 * Immutable bidirectional mapping between canonical string `PlayerId`s
 * and private dense indexes.
 *
 * All lookups are checked: unknown, forged, malformed, or out-of-range
 * values yield `null` (or throw from {@link requireIdAt}) rather than
 * being coerced.
 */
export interface PlayerRegistry {
    /**
     * All player IDs in canonical UTF-16 order (index `i` is the ID for
     * {@link DensePlayerIndex} `i`). Frozen.
     */
    readonly ids: readonly PlayerId[];

    /** Number of players in the registry (2–4). */
    readonly count: number;

    /**
     * Checked ID → dense index lookup.
     *
     * @param id - Candidate ID (must be canonical to resolve).
     * @returns The 0-based dense index, or `null` when `id` is
     *          malformed, numeric, forged, or not registered.
     */
    indexOfId(id: PlayerId): DensePlayerIndex | null;

    /**
     * Checked dense index → ID lookup.
     *
     * @param index - Candidate 0-based dense index.
     * @returns The registered ID, or `null` when `index` is not an
     *          integer in `[0, count)`.
     */
    idAt(index: DensePlayerIndex): PlayerId | null;

    /**
     * Non-throwing membership test.
     *
     * @param id - Candidate ID.
     * @returns `true` iff `id` is canonical and registered.
     */
    has(id: PlayerId): boolean;

    /**
     * Fail-fast dense index → ID lookup for hot paths whose byte value
     * was itself produced by this registry (so the index is provably in
     * range). Throws rather than returning `null` to keep resolution
     * code branch-free and to surface internal corruption loudly.
     *
     * @param index - A 0-based dense index known to be in range.
     * @returns The registered ID.
     * @throws {RangeError} When `index` is not in `[0, count)`.
     */
    requireIdAt(index: DensePlayerIndex): PlayerId;
}

/**
 * Build an immutable {@link PlayerRegistry} from an explicit ID list.
 *
 * Construction validates that every entry is a canonical `PlayerId`
 * (via `@europa/core`'s `isPlayerId`), that the list holds 2–4 players
 * (FR-019), and that no ID is duplicated. It then sorts a copy with
 * {@link compareUtf16} to establish the canonical dense order.
 *
 * The function never generates, synthesizes, or coerces an ID — the
 * caller must supply explicit validated identities.
 *
 * @param ids - Explicit canonical player IDs (length 2–4, unique).
 * @returns A frozen registry whose dense order is caller-order
 *          independent.
 * @throws {RangeError} When `ids` length is outside `[2, 4]`.
 * @throws {TypeError} When an entry is missing or not a canonical
 *         `PlayerId` string.
 * @throws {Error} When the same ID appears more than once.
 */
export function createPlayerRegistry(ids: readonly PlayerId[]): PlayerRegistry {
    if (!Array.isArray(ids) || ids.length < MIN_PLAYERS_PER_MATCH || ids.length > MAX_PLAYERS_PER_MATCH) {
        throw new RangeError(
            `createPlayerRegistry: playerIds must contain ${String(MIN_PLAYERS_PER_MATCH)}–${String(MAX_PLAYERS_PER_MATCH)} entries (got ${String(Array.isArray(ids) ? ids.length : 0)})`,
        );
    }

    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
        const id: unknown = ids[i];
        if (!isPlayerId(id)) {
            throw new TypeError(
                `createPlayerRegistry: playerIds[${String(i)}] is not a canonical player id (expected exactly 12 characters from the canonical alphabet).`,
            );
        }
        if (seen.has(id)) {
            throw new Error(`createPlayerRegistry: duplicate player id "${id}"`);
        }
        seen.add(id);
    }

    // Canonical order: explicit UTF-16 code units, never localeCompare.
    const sortedIds = Object.freeze([...ids].sort(compareUtf16));

    const idToIndex = new Map<string, DensePlayerIndex>();
    for (let i = 0; i < sortedIds.length; i++) {
        const id = sortedIds[i];
        if (id !== undefined) {
            idToIndex.set(id, i);
        }
    }

    const count = sortedIds.length;

    // Plain closures (not methods relying on `this`) so a destructured
    // `requireIdAt` keeps working.
    const idAt = (index: DensePlayerIndex): PlayerId | null => {
        if (!Number.isInteger(index) || index < 0 || index >= count) {
            return null;
        }
        return sortedIds[index] ?? null;
    };

    return {
        ids: sortedIds,
        count,

        indexOfId(id: PlayerId): DensePlayerIndex | null {
            if (!isPlayerId(id)) {
                return null;
            }
            return idToIndex.get(id) ?? null;
        },

        idAt,

        has(id: PlayerId): boolean {
            return isPlayerId(id) && idToIndex.has(id);
        },

        requireIdAt(index: DensePlayerIndex): PlayerId {
            const id = idAt(index);
            if (id === null) {
                throw new RangeError(
                    `PlayerRegistry.requireIdAt: dense index ${String(index)} out of range (count ${String(count)})`,
                );
            }
            return id;
        },
    };
}
