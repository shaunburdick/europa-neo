/**
 * Unit tests for join URL generation — Feature 006 (T040)
 *
 * Covers FR-003 + spec Q3 clarification: every created match returns a
 * relative `joinPath` of exactly `/join/<matchId>` (UUID v4), plus an
 * absolute `joinUrl` composed from `MatchmakerConfig.publicBaseUrl`
 * when configured — or `null` when it is not. The same link pair rides
 * on every `joinMatch` result too (contract: `SeatAssignedResult`
 * extends `JoinUrlResult`).
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** FR-003/Q3: the joinPath shape — slash, literal, slash, 36-char UUID. */
const JOIN_PATH_PATTERN = /^\/join\/[0-9a-f-]{36}$/;
/** Strict UUID v4 shape for the underlying matchId. */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createMatch — shareable link pair (FR-003 / Q3)', () => {
    it('FR-003: composes joinUrl from publicBaseUrl and embeds the matchId', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(
            { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
            { server },
        );

        const created = matchmaker.createMatch({ visibility: 'private', displayName: 'Alice' });

        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const { matchId, joinPath, joinUrl } = created.data;
        expect(matchId).toMatch(UUID_V4_PATTERN);
        expect(joinPath).toBe(`/join/${matchId}`);
        expect(joinPath).toMatch(JOIN_PATH_PATTERN);
        expect(joinUrl).toBe(`https://europa.example.com/join/${matchId}`);
        matchmaker.close();
    });

    it('FR-003: joinUrl is null when no publicBaseUrl is configured', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });

        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const { matchId, joinPath, joinUrl } = created.data;
        expect(joinPath).toBe(`/join/${matchId}`);
        expect(joinPath).toMatch(JOIN_PATH_PATTERN);
        expect(joinUrl).toBeNull();
        matchmaker.close();
    });

    it('FR-003: every match gets a distinct joinPath (unique server-assigned ids)', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(
            { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
            { server },
        );

        const first = matchmaker.createMatch({ visibility: 'public', displayName: 'A' });
        const second = matchmaker.createMatch({ visibility: 'public', displayName: 'B' });
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) {
            return;
        }

        expect(first.data.joinPath).not.toBe(second.data.joinPath);
        expect(first.data.joinUrl).not.toBe(second.data.joinUrl);
        matchmaker.close();
    });
});

describe('joinMatch — shareable link pair (JoinUrlResult contract)', () => {
    it('FR-003: a joiner receives the same link pair as the creator', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(
            { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
            { server },
        );
        const created = matchmaker.createMatch({ visibility: 'private', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        const { matchId, joinPath, joinUrl } = created.data;

        const joined = matchmaker.joinMatch({ matchId, displayName: 'Bob' });

        expect(joined.ok).toBe(true);
        if (!joined.ok) {
            return;
        }
        expect(joined.data.joinPath).toBe(joinPath);
        expect(joined.data.joinUrl).toBe(joinUrl);
        matchmaker.close();
    });
});
