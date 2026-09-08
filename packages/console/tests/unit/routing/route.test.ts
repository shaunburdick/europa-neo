/**
 * Unit tests for `src/routing/route.ts` — the core routing primitives.
 *
 * Covers:
 * - `validateMatchId` direct validation (discriminated-union contract)
 * - URL builders (encode + origin-normalize)
 * - Builder error paths (invalid origins, invalid matchIds)
 * - `RouteRejection` type exhaustiveness
 *
 * Note: `route-tree.test.ts` covers route-tree structural classification,
 * redirect behavior, and match-route integration. This file is focused on
 * the pure-function public API of `route.ts` itself.
 */

import { describe, expect, it } from 'vitest';
import {
    buildJoinUrl,
    buildLobbyUrl,
    buildMatchUrl,
    buildProfileUrl,
    buildSpectateUrl,
    validateMatchId,
} from '../../../src/routing/route';

// ─── validateMatchId ────────────────────────────────────────────────────────

describe('validateMatchId', () => {
    // ── success paths ──────────────────────────────────────────────────────

    it('returns ok:true with decoded ID for a simple alphanumeric segment', () => {
        const result = validateMatchId('m-123');
        expect(result).toEqual({ ok: true, value: 'm-123' });
    });

    it('decodes URL-encoded spaces', () => {
        expect(validateMatchId('room%20alpha')).toEqual({ ok: true, value: 'room alpha' });
    });

    it('decodes URL-encoded special characters', () => {
        expect(validateMatchId('match%26id%3D1')).toEqual({ ok: true, value: 'match&id=1' });
    });

    it('accepts an empty string (empty-match-id is caught at route-tree level)', () => {
        expect(validateMatchId('')).toEqual({ ok: true, value: '' });
    });

    it('accepts a very long match ID', () => {
        const long = 'a'.repeat(1024);
        expect(validateMatchId(long)).toEqual({ ok: true, value: long });
    });

    it('accepts match IDs with alphanumeric and hyphen patterns', () => {
        expect(validateMatchId('match-abc-123-def')).toEqual({ ok: true, value: 'match-abc-123-def' });
    });

    it('accepts match IDs with underscores', () => {
        expect(validateMatchId('my_match_123')).toEqual({ ok: true, value: 'my_match_123' });
    });

    it('accepts match IDs with valid Unicode letters', () => {
        expect(validateMatchId('partie-%C3%BCbergriff')).toEqual({ ok: true, value: 'partie-übergriff' });
    });

    // ── malformed-encoding ─────────────────────────────────────────────────

    it.each(['%', '%A', '%GG', '%E0%A4%A'])('rejects malformed percent-encoding: %s', (segment) => {
        const result = validateMatchId(segment);
        expect(result).toEqual({ ok: false, reason: 'malformed-encoding' });
    });

    // ── decoded-slash ──────────────────────────────────────────────────────

    it('rejects a decoded forward slash', () => {
        expect(validateMatchId('a%2Fb')).toEqual({ ok: false, reason: 'decoded-slash' });
    });

    it('rejects a decoded backslash', () => {
        expect(validateMatchId('a%5Cb')).toEqual({ ok: false, reason: 'decoded-slash' });
    });

    it('rejects a raw forward slash', () => {
        expect(validateMatchId('/')).toEqual({ ok: false, reason: 'decoded-slash' });
    });

    it('rejects double slashes', () => {
        expect(validateMatchId('//')).toEqual({ ok: false, reason: 'decoded-slash' });
    });

    // ── unsafe-character ───────────────────────────────────────────────────

    it('rejects a literal dot', () => {
        expect(validateMatchId('.')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects literal double-dot (path traversal)', () => {
        expect(validateMatchId('..')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects URL-encoded dot', () => {
        expect(validateMatchId('%2E')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects URL-encoded double-dot', () => {
        expect(validateMatchId('%2E%2E')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects an ID containing a double-dot segment', () => {
        expect(validateMatchId('a..b')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects NULL byte (control character)', () => {
        expect(validateMatchId('%00')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects unit separator control character', () => {
        expect(validateMatchId('%1F')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects DEL control character (0x7F)', () => {
        expect(validateMatchId('%7F')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects CSI control character (U+009F, valid UTF-8 two-byte encoding)', () => {
        expect(validateMatchId('%C2%9F')).toEqual({ ok: false, reason: 'unsafe-character' });
    });

    it('rejects a raw backslash (no encoding)', () => {
        const result = validateMatchId('\\');
        // Backslash decoded is still backslash → decoded-slash
        expect(result).toEqual({ ok: false, reason: 'decoded-slash' });
    });
});

// ─── URL builders ───────────────────────────────────────────────────────────

describe('URL builders', () => {
    it('builds the canonical lobby URL and preserves only the origin', () => {
        expect(buildLobbyUrl('https://example.test:8443/ignored/path?token=secret')).toBe(
            'https://example.test:8443/lobby',
        );
    });

    it('builds the canonical profile URL and preserves only the origin', () => {
        expect(buildProfileUrl('https://example.test:8443/ignored/path?token=secret')).toBe(
            'https://example.test:8443/profile',
        );
    });

    it('builds match URL with no action suffix', () => {
        expect(buildMatchUrl('https://host.test', 'm-123')).toBe('https://host.test/match/m-123');
    });

    it('builds join URL with /join suffix', () => {
        expect(buildJoinUrl('https://host.test', 'm-123')).toBe('https://host.test/match/m-123/join');
    });

    it('builds spectate URL with /spectate suffix', () => {
        expect(buildSpectateUrl('https://host.test', 'm-123')).toBe('https://host.test/match/m-123/spectate');
    });

    it.each([
        ['m-123', buildMatchUrl, '/match/m-123'],
        ['room alpha', buildJoinUrl, '/match/room%20alpha/join'],
        ['room blue', buildSpectateUrl, '/match/room%20blue/spectate'],
    ] as const)('round-trips the semantic URL for %s', (matchId, buildUrl, pathname) => {
        const url = buildUrl('https://example.test:8443/ignored/path', matchId);
        expect(url).toBe(`https://example.test:8443${pathname}`);
    });

    it('preserves port in origin', () => {
        expect(buildLobbyUrl('http://localhost:5173')).toBe('http://localhost:5173/lobby');
    });

    it('strips trailing slash from origin', () => {
        expect(buildLobbyUrl('https://host.test/')).toBe('https://host.test/lobby');
    });
});

// ─── URL builder error paths ────────────────────────────────────────────────

describe('URL builders - error paths', () => {
    it('throws TypeError for non-absolute origin (missing protocol)', () => {
        expect(() => buildLobbyUrl('not-a-url')).toThrow('origin must be an absolute URL');
    });

    it('throws TypeError for ftp:// origin', () => {
        expect(() => buildLobbyUrl('ftp://host.test')).toThrow('origin must use HTTP or HTTPS');
    });

    it('throws TypeError for empty match ID in buildMatchUrl', () => {
        expect(() => buildMatchUrl('https://host.test', '')).toThrow('matchId must not be empty');
    });

    it('throws TypeError for empty match ID in buildJoinUrl', () => {
        expect(() => buildJoinUrl('https://host.test', '')).toThrow('matchId must not be empty');
    });

    it('throws TypeError for empty match ID in buildSpectateUrl', () => {
        expect(() => buildSpectateUrl('https://host.test', '')).toThrow('matchId must not be empty');
    });

    it('throws TypeError for match ID containing a decoded slash', () => {
        expect(() => buildMatchUrl('https://host.test', 'a/b')).toThrow('matchId contains decoded-slash');
    });

    it('throws TypeError for match ID containing path traversal', () => {
        expect(() => buildMatchUrl('https://host.test', '..')).toThrow('matchId contains unsafe-character');
    });
});
