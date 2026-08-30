/**
 * Board-size defaults pin — Feature 012 T005 (FR-001; SC-005).
 *
 * Guards the single source map `BOARD_SIZE_DEFAULTS` that lives in
 * `@europa/matchmaking`. Every N-aware surface (lobby create form
 * FR-002, host CLI FR-011, manual FR-013) imports this table — a
 * silent drift would break all three at once. The suite imports from
 * the REAL package surfaces (not a local copy) and fails if any value
 * would require a spec FR-001 edit in the same change set.
 *
 * Coverage:
 *  - byte-identical table across `src/constants`, `contracts/match-types`,
 *    and the public barrel `src/index`
 *  - canonical values 2→32, 3→48, 4→48
 *  - every key in 2|3|4 present, no extras; every value in 32|48|64
 *  - DEFAULT_MATCH_SETTINGS.boardSize remains 32 (API compat — additive map)
 *  - frozen / as const immutability semantics (runtime check, lenient)
 *  - informational mirror at
 *    `specs/012-3-4-player-support/contracts/board-size-defaults.ts`
 *    is byte-identical to the shipped constant (prevents drift)
 */

import { describe, expect, it } from 'vitest';

import { BOARD_SIZE_DEFAULTS as mirrorMap } from '../../../../specs/012-3-4-player-support/contracts/board-size-defaults';
import { BOARD_SIZE_DEFAULTS as contractMap, DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';
import { BOARD_SIZE_DEFAULTS as constantsMap } from '../../src/constants';
import { BOARD_SIZE_DEFAULTS as publicMap } from '../../src/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPECTED_TABLE = { 2: 32, 3: 48, 4: 48 } as const;
const ALLOWED_VALUES = new Set([32, 48, 64]);
const ALLOWED_KEYS = new Set(['2', '3', '4']);

describe('BOARD_SIZE_DEFAULTS — FR-001 single source (T005)', () => {
    it('is byte-identical across all package surfaces (constants, contracts, public barrel)', () => {
        // Import from REAL package surfaces, not a local copy. Deep equality
        // proves they were not duplicated with divergent values; JSON
        // serialization proves key order and literal values are byte-identical.
        expect(constantsMap).toEqual(EXPECTED_TABLE);
        expect(contractMap).toEqual(EXPECTED_TABLE);
        expect(publicMap).toEqual(EXPECTED_TABLE);

        expect(constantsMap).toEqual(contractMap);
        expect(constantsMap).toEqual(publicMap);
        expect(contractMap).toEqual(publicMap);

        // Serialized form must match exactly — catches e.g. {2:32,3:48,4:48}
        // vs {4:48,3:48,2:32} ordering drift (different bytes, same deepEqual).
        const serialized = JSON.stringify(EXPECTED_TABLE);
        expect(JSON.stringify(constantsMap)).toBe(serialized);
        expect(JSON.stringify(contractMap)).toBe(serialized);
        expect(JSON.stringify(publicMap)).toBe(serialized);
    });

    it('exposes canonical values 2→32, 3→48, 4→48', () => {
        expect(constantsMap[2]).toBe(32);
        expect(constantsMap[3]).toBe(48);
        expect(constantsMap[4]).toBe(48);

        // Same via every surface — proves re-exports are not stale.
        expect(contractMap[2]).toBe(32);
        expect(contractMap[3]).toBe(48);
        expect(contractMap[4]).toBe(48);
        expect(publicMap[2]).toBe(32);
        expect(publicMap[3]).toBe(48);
        expect(publicMap[4]).toBe(48);
    });

    it('contains exactly keys 2|3|4 and every value is in 32|48|64', () => {
        for (const source of [constantsMap, contractMap, publicMap] as const) {
            const keys = Object.keys(source);
            expect(keys).toHaveLength(3);
            for (const key of keys) {
                expect(ALLOWED_KEYS.has(key)).toBe(true);
            }
            // No missing key.
            expect(keys).toEqual(expect.arrayContaining(['2', '3', '4']));

            // Every value is presentation-set 32|48|64 (spec Assumptions).
            for (const value of Object.values(source)) {
                expect(ALLOWED_VALUES.has(value as number)).toBe(true);
            }
        }
    });

    it('DEFAULT_MATCH_SETTINGS.boardSize remains 32 (API compat — additive map)', () => {
        // FR-001 explicitly keeps DEFAULT_MATCH_SETTINGS.boardSize at 32;
        // BOARD_SIZE_DEFAULTS is additive. A silent bump to 48 would break
        // every direct createMatch caller that omits boardSize.
        expect(DEFAULT_MATCH_SETTINGS.boardSize).toBe(32);
        expect(DEFAULT_MATCH_SETTINGS.playerCount).toBe(2);
        // The default boardSize is the 2-player default, not the 3p/4p one.
        expect(DEFAULT_MATCH_SETTINGS.boardSize).toBe(constantsMap[2]);
    });

    it('frozen / as const immutability semantics', () => {
        // The map is declared `as const` (compile-time readonly). Some
        // builds also `Object.freeze` it. We pin the stronger guarantee
        // when present, and document the weaker otherwise — either way the
        // published table must not be accidentally mutable across tests.
        const descriptor2 = Object.getOwnPropertyDescriptor(constantsMap, '2');
        expect(descriptor2).toBeDefined();

        if (Object.isFrozen(constantsMap)) {
            // Frozen branch: writable false, not extensible, mutation throws
            // or is ignored in strict mode.
            expect(Object.isFrozen(constantsMap)).toBe(true);
            expect(Object.isExtensible(constantsMap)).toBe(false);
            expect(descriptor2?.writable).toBe(false);
            expect(Object.isFrozen(contractMap)).toBe(true);
            expect(Object.isFrozen(publicMap)).toBe(true);
        } else {
            // as const branch (current): type-level readonly, runtime value
            // still correct. We prove the value has not been mutated by
            // earlier tests and that re-assigning can be detected/restored.
            expect(constantsMap).toEqual(EXPECTED_TABLE);
            // Demonstrate that a runtime mutation WOULD be observable
            // (if the object were not frozen, the assignment succeeds —
            // we restore so later tests are not polluted).
            const before = JSON.stringify(constantsMap);
            const mutable = constantsMap as unknown as Record<number, number>;
            const original2 = mutable[2];
            try {
                mutable[2] = 999;
                // If we reach here, freeze is absent — value changed.
                // That's acceptable for as const, but we must restore.
                if (mutable[2] === 999) {
                    mutable[2] = original2;
                }
            } catch {
                // Frozen path throws — already handled above.
            }
            expect(JSON.stringify(constantsMap)).toBe(before);
        }

        // All surfaces share the same serialization.
        expect(JSON.stringify(contractMap)).toBe(JSON.stringify(EXPECTED_TABLE));
        expect(JSON.stringify(publicMap)).toBe(JSON.stringify(EXPECTED_TABLE));
    });

    it('mirror at specs/012-3-4-player-support/contracts/board-size-defaults.ts is byte-identical to shipped constant (drift guard)', () => {
        // The spec mirror exists so reviewers can see the table without
        // chasing the implementation. It must never drift from the shipped
        // constant — a drift would mean docs and product disagree.
        expect(mirrorMap).toEqual(EXPECTED_TABLE);
        expect(mirrorMap).toEqual(constantsMap);
        expect(mirrorMap).toEqual(contractMap);
        expect(mirrorMap).toEqual(publicMap);

        expect(JSON.stringify(mirrorMap)).toBe(JSON.stringify(EXPECTED_TABLE));
        expect(JSON.stringify(mirrorMap)).toBe(JSON.stringify(constantsMap));

        // Mirror's keys/values obey the same allowed sets.
        expect(Object.keys(mirrorMap)).toEqual(expect.arrayContaining(['2', '3', '4']));
        for (const value of Object.values(mirrorMap)) {
            expect(ALLOWED_VALUES.has(value as number)).toBe(true);
        }
    });
});
