/**
 * Unit tests for settings-rejection detail — feature 010 US3 AC-4 via
 * remediation R-005 seam (e): `createMatch` failures for invalid
 * settings carry a field-specific `detail` (`field` + `reason`) on the
 * `invalid_request` error so the lobby facade can forward actionable
 * specifics to the client (spec 010 Clarifications v1.3 wire-detail
 * ruling consumes exactly this shape).
 *
 * Also pins the clamp/reject boundary: out-of-range but FINITE board
 * sizes are CLAMPED per `MatchSettings.boardSize`, never rejected.
 *
 * Determinism: injected sequential ids + fixed clock. No matches are
 * created on any rejection path, so no board generation runs.
 */

import { describe, expect, it } from 'vitest';

import type { CreateMatchRequest } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

/**
 * Build a deliberately-invalid settings object for the rejection table.
 * The contract's literal unions (`playerCount: 2 | 3 | 4`) exist to
 * keep VALID callers honest; these rows are ADVERSARIAL inputs whose
 * whole point is to violate them, so the test data crosses the type
 * boundary through this single audited assertion (the same sanctioned
 * pattern as the branded-id `toBranded` helpers).
 */
function badSettings(values: Record<string, unknown>): CreateMatchRequest['settings'] {
    return values as unknown as CreateMatchRequest['settings'];
}

/** Fresh matchmaker with deterministic ids and a fixed clock. */
function makeMatchmaker() {
    let seq = 0;
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
        server: new FakeServer(),
        randomId: () => {
            seq += 1;
            return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
        },
        now: () => 5_000_000,
    });
    return matchmaker;
}

/** One rejection table row: bad settings plus the expected detail. */
const REJECTIONS: ReadonlyArray<{
    readonly name: string;
    readonly settings: Record<string, unknown>;
    readonly field: string;
    readonly reason: string;
}> = [
    {
        name: 'playerCount below the supported range',
        settings: { playerCount: 1 },
        field: 'settings.playerCount',
        reason: 'must be 2, 3, or 4',
    },
    {
        name: 'playerCount above the supported range',
        settings: { playerCount: 5 },
        field: 'settings.playerCount',
        reason: 'must be 2, 3, or 4',
    },
    {
        name: 'non-integer playerCount',
        settings: { playerCount: 2.5 },
        field: 'settings.playerCount',
        reason: 'must be 2, 3, or 4',
    },
    {
        name: 'NaN boardSize',
        settings: { boardSize: Number.NaN },
        field: 'settings.boardSize',
        reason: 'must be a finite number',
    },
    {
        name: 'infinite boardSize',
        settings: { boardSize: Number.POSITIVE_INFINITY },
        field: 'settings.boardSize',
        reason: 'must be a finite number',
    },
    {
        name: 'zero tickIntervalMs',
        settings: { tickIntervalMs: 0 },
        field: 'settings.tickIntervalMs',
        reason: 'must be a positive whole number of ms',
    },
    {
        name: 'negative tickIntervalMs',
        settings: { tickIntervalMs: -250 },
        field: 'settings.tickIntervalMs',
        reason: 'must be a positive whole number of ms',
    },
    {
        name: 'fractional tickIntervalMs',
        settings: { tickIntervalMs: 250.5 },
        field: 'settings.tickIntervalMs',
        reason: 'must be a positive whole number of ms',
    },
];

describe('createMatch — field-specific settings rejection detail (US3 AC-4)', () => {
    it.each(REJECTIONS)('$name → detail { field, reason }', ({ settings, field, reason }) => {
        const matchmaker = makeMatchmaker();

        const result = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: badSettings(settings),
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error.code).toBe('invalid_request');
        // The machine-readable detail is exactly the rejected field.
        expect(result.error.detail).toEqual({ field, reason });
        // The human-readable message names the field too (log/render path).
        expect(result.error.message).toContain(field);
        // No match was created by the rejected request.
        expect(matchmaker.stats().totalCreated).toBe(0);
        matchmaker.close();
    });

    it('detail is credential-free: exactly the two keys, no token/id-shaped values', () => {
        const matchmaker = makeMatchmaker();

        const result = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: { playerCount: 7 },
        });
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(Object.keys(result.error.detail ?? {})).toEqual(['field', 'reason']);
        const values = Object.values(result.error.detail ?? {});
        for (const value of values) {
            expect(typeof value === 'string' || typeof value === 'number').toBe(true);
            if (typeof value === 'string') {
                // No UUID-shaped or token-shaped material in the detail.
                expect(value).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
            }
        }
        matchmaker.close();
    });

    it('finite out-of-range board sizes are CLAMPED, not rejected', () => {
        const matchmaker = makeMatchmaker();

        const tooSmall = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: { boardSize: 4 },
        });
        expect(tooSmall.ok).toBe(true);

        const tooLarge = matchmaker.createMatch({
            visibility: 'private',
            displayName: 'Bob',
            settings: { boardSize: 999 },
        });
        expect(tooLarge.ok).toBe(true);

        expect(matchmaker.stats().totalCreated).toBe(2);
        matchmaker.close();
    });

    it('valid settings produce no error detail at all', () => {
        const matchmaker = makeMatchmaker();

        const result = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: { playerCount: 2, boardSize: 16, tickIntervalMs: 100 },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) {
            expect(result.error.detail).toBeUndefined(); // unreachable; narrows the union
        }
        matchmaker.close();
    });
});
