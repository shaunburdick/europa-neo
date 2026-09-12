/**
 * Terrain ID-Independence Tests — Feature 003 v1.8 / issue #74 (T020)
 *
 * FR-011: terrain MUST NOT derive, persist, serialize, or sort universal
 * IDs, and changing an ID MUST NOT change a generated board for the same
 * seed/settings/player count. The caller (engine/matchmaking) owns the
 * explicit mapping from terrain's dense numeric placement slots to
 * canonical `PlayerId` values (plan.md §3.3; engine-contract.md
 * "Determinism witness").
 *
 * These tests construct *valid* canonical IDs (via `@europa/core`'s
 * canonical validator / parser / generator) in different orderings, map
 * terrain's 1-based slots onto them at the caller boundary, and prove:
 *
 *   1. Board bytes are byte-identical across every valid-ID ordering for
 *      the same `(seed, boardSize, playerCount, settings)`.
 *   2. `board.cities[].owner` and `startingCitiesByPlayer` keys are dense
 *      numeric slots — never canonical IDs.
 *   3. No canonical ID value appears anywhere in the serialized board.
 *   4. Reordering / renaming the valid IDs changes only the caller-owned
 *      slot → ID mapping, never the board or its slots.
 *
 * If any assertion here fails, an ID has leaked into terrain's
 * deterministic output and byte-identical regeneration is at risk.
 */

import type { PlayerId } from '@europa/core';
import { generatePlayerId, isPlayerId, PLAYER_ID_LENGTH, parsePlayerId } from '@europa/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard, hashBoard } from '../../src/generate';
import { engineSfc32 } from '../fixtures/seeds';

/** Board size exercised by every ID-independence case. */
const BOARD_SIZE = 32;

interface Case {
    readonly playerCount: 2 | 3 | 4;
    readonly seed: number;
    readonly label: string;
}

/** One representative case per supported player count (32×32, defaults). */
const CASES: readonly Case[] = [
    { playerCount: 2, seed: 42, label: '2p seed=42' },
    { playerCount: 3, seed: 7, label: '3p seed=7' },
    { playerCount: 4, seed: 1234, label: '4p seed=1234' },
];

/**
 * Build a canonical {@link PLAYER_ID_LENGTH}-character identity filled
 * with a single valid alphabet symbol. Proves validity through the
 * authoritative `isPlayerId` guard before parsing.
 *
 * @param symbol One character from `PLAYER_ID_ALPHABET` (e.g. `'A'`).
 * @returns The same value branded as a canonical `PlayerId`.
 */
function idOf(symbol: string): PlayerId {
    const candidate = symbol.repeat(PLAYER_ID_LENGTH);
    expect(isPlayerId(candidate)).toBe(true);
    return parsePlayerId(candidate);
}

/** Three distinct valid-ID orderings used to prove ID independence. */
const ORDER_FORWARD: readonly PlayerId[] = [idOf('A'), idOf('B'), idOf('C'), idOf('D')];
const ORDER_REVERSED: readonly PlayerId[] = [idOf('D'), idOf('C'), idOf('B'), idOf('A')];
const ORDER_DIFFERENT: readonly PlayerId[] = [idOf('Z'), idOf('a'), idOf('0'), idOf('_')];
const ORDERINGS: readonly (readonly PlayerId[])[] = [ORDER_FORWARD, ORDER_REVERSED, ORDER_DIFFERENT];

/**
 * Generate one board for a case. The request deliberately carries no
 * identity: terrain's input type has no ID field, so ID independence is
 * guaranteed at the type boundary and asserted at runtime here.
 *
 * @param c Case to generate.
 * @returns The full terrain generation result.
 */
function generate(c: Case): ReturnType<typeof generateBoard> {
    return generateBoard({
        boardSize: BOARD_SIZE,
        playerCount: c.playerCount,
        seed: c.seed,
        rng: engineSfc32(c.seed),
        settings: DEFAULT_GENERATION_SETTINGS,
    });
}

/**
 * Caller-owned mapping: pair each city's dense placement slot with the
 * canonical ID at the same index of the caller's ID list.
 *
 * @param citySlots Terrain's 1-based numeric slots, in board order.
 * @param ids The caller's canonical IDs in slot order.
 * @returns `{ slot, id }` pairs — the caller's identity view.
 */
function mapSlotsToIds(
    citySlots: readonly number[],
    ids: readonly PlayerId[],
): ReadonlyArray<{ readonly slot: number; readonly id: PlayerId | undefined }> {
    return citySlots.map((slot) => ({ slot, id: ids[slot - 1] }));
}

const ROWS = CASES.map((c) => [c.label, c] as [string, Case]);

describe('terrain ID-independence (issue #74 FR-011)', () => {
    it.each(ROWS)(
        'same seed/size/playerCount/settings → byte-identical board for every valid-ID ordering (%s)',
        (_label, c) => {
            // Generate once per ordering. Terrain never receives the IDs; the
            // point is that regenerating under each caller ID list yields the
            // exact same board bytes and slots.
            const boards = ORDERINGS.map(() => generate(c));
            const hashes = new Set(boards.map((b) => hashBoard(b.board)));
            expect(hashes.size).toBe(1);

            const citySlotSequences = boards.map((b) => b.board.cities.map((city) => city.owner));
            expect(new Set(citySlotSequences.map((slots) => JSON.stringify(slots))).size).toBe(1);

            // Caller-owned mapping: identical slots, different canonical IDs.
            const slots = citySlotSequences[0] ?? [];
            const mappedForward = mapSlotsToIds(slots, ORDER_FORWARD);
            const mappedReversed = mapSlotsToIds(slots, ORDER_REVERSED);
            expect(mappedForward.map((entry) => entry.slot)).toEqual(mappedReversed.map((entry) => entry.slot));
            expect(mappedForward.map((entry) => entry.id)).not.toEqual(mappedReversed.map((entry) => entry.id));
            for (const entry of mappedForward) {
                expect(isPlayerId(entry.id)).toBe(true);
            }
        },
    );

    it('emits dense numeric placement slots, never canonical IDs', () => {
        for (const c of CASES) {
            const result = generate(c);
            for (const city of result.board.cities) {
                expect(typeof city.owner).toBe('number');
                expect(Number.isInteger(city.owner)).toBe(true);
                expect(city.owner).toBeGreaterThanOrEqual(1);
                expect(city.owner).toBeLessThanOrEqual(c.playerCount);
            }
            // `startingCitiesByPlayer` is keyed by numeric slot, not ID.
            expect(Object.keys(result.startingCitiesByPlayer).sort()).toEqual(['1', '2', '3', '4']);
            for (const id of ORDER_FORWARD) {
                expect(result.startingCitiesByPlayer).not.toHaveProperty(id);
            }
        }
    });

    it('contains no canonical ID value in the serialized board', () => {
        const allIds = new Set([...ORDER_FORWARD, ...ORDER_REVERSED, ...ORDER_DIFFERENT].map(String));
        for (const c of CASES) {
            const serialized = JSON.stringify(generate(c).board);
            for (const id of allIds) {
                expect(serialized).not.toContain(id);
            }
        }
    });

    it('mirrors board.cities into startingCitiesByPlayer by numeric slot', () => {
        for (const c of CASES) {
            const result = generate(c);
            for (const city of result.board.cities) {
                const list = result.startingCitiesByPlayer[city.owner];
                expect(list).toBeDefined();
                expect(list?.some((coord) => coord.x === city.cell.x && coord.y === city.cell.y)).toBe(true);
            }
        }
    });

    it('accepts canonical CSPRNG-minted IDs without changing the board', () => {
        // Four distinct valid IDs minted by the same canonical generator the
        // matchmaker uses (deterministic injected entropy).
        const minted: PlayerId[] = Array.from({ length: 4 }, (_, i) =>
            generatePlayerId((length) => new Uint8Array(length).fill(((i + 1) * 37) & 0xff)),
        );
        for (const id of minted) {
            expect(isPlayerId(id)).toBe(true);
        }

        const case2p: Case = { playerCount: 2, seed: 42, label: '2p' };
        const first = generate(case2p);
        const second = generate(case2p);
        expect(hashBoard(first.board)).toBe(hashBoard(second.board));

        // The minted IDs map cleanly onto the stable numeric slots.
        const mapped = mapSlotsToIds(
            first.board.cities.map((city) => city.owner),
            minted,
        );
        expect(mapped.every((entry) => entry.id !== undefined && isPlayerId(entry.id))).toBe(true);
    });
});
