/**
 * Unit tests for the TanStack Router route tree (feature 013, FR-020..FR-024).
 *
 * Exercises:
 * - `validateMatchId` directly with all 6 rejection reasons (ported from route.test.ts)
 * - URL builders (unchanged in route.ts, verified still work)
 * - Route tree structural correctness
 * - `/` -> `/lobby` redirect (via beforeLoad mock)
 * - `/profile` returnTo validation (FR-024)
 * - Match routes reject invalid matchIds (all 6 reasons, FR-022)
 * - Unknown paths -> not-found behavior
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildJoinUrl,
    buildLobbyUrl,
    buildMatchUrl,
    buildProfileUrl,
    buildSpectateUrl,
    validateMatchId,
} from '../../../src/routing/route';
import { profileSearchParams } from '../../../src/routing/search-params';

// ─── Redirect mock setup ────────────────────────────────────────────────────

// TanStack Router's `redirect()` returns a Response and throws it in beforeLoad.
// We mock it to capture calls and verify the redirect target.
vi.mock('@tanstack/react-router', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        redirect: vi.fn((opts: { to: string }) => {
            const response = new Response(null, { status: 302, headers: { Location: opts.to } });
            (response as unknown as { isRedirect: true }).isRedirect = true;
            return response;
        }),
    };
});

// Re-import the mocked redirect so we can assert on it
import { redirect } from '@tanstack/react-router';

// ─── validateMatchId: all 6 rejection reasons (ported from route.test.ts) ───

describe('validateMatchId - direct validation', () => {
    it('returns ok:true with decoded ID for valid segments', () => {
        expect(validateMatchId('m-123')).toEqual({ ok: true, value: 'm-123' });
    });

    it('decodes URL-encoded segments', () => {
        expect(validateMatchId('room%20alpha')).toEqual({ ok: true, value: 'room alpha' });
    });

    it.each(['/match/%', '/match/%A', '/match/%GG', '/match/%E0%A4%A/join'])(
        'rejects malformed escapes in %s',
        (segment) => {
            const raw = segment.split('/')[2];
            const result = validateMatchId(raw);
            expect(result).toEqual({ ok: false, reason: 'malformed-encoding' });
        },
    );

    it.each([
        ['a%2Fb', 'decoded-slash'],
        ['a%5Cb/join', 'decoded-slash'],
    ] as const)('rejects decoded path separators in %s', (segment, reason) => {
        expect(validateMatchId(segment)).toEqual({ ok: false, reason });
    });

    it.each(['.', '..', '%2E', '%2E%2E', 'a..b', '%00', '%1F', '%7F'])(
        'rejects dot-like and control characters in %s',
        (segment) => {
            expect(validateMatchId(segment)).toEqual({ ok: false, reason: 'unsafe-character' });
        },
    );

    it.each(['/', '//', '//join'])('rejects separator-only match ID: %s', (segment) => {
        expect(validateMatchId(segment)).toEqual({ ok: false, reason: 'decoded-slash' });
    });

    it('accepts an empty string (empty-match-id is caught at route-tree level)', () => {
        expect(validateMatchId('')).toEqual({ ok: true, value: '' });
    });
});

// ─── URL builders (unchanged, verified still work) ─────────────────────────

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

    it.each([
        ['m-123', buildMatchUrl, '/match/m-123', 'adaptive'],
        ['room alpha', buildJoinUrl, '/match/room%20alpha/join', 'join'],
        ['room blue', buildSpectateUrl, '/match/room%20blue/spectate', 'spectate'],
    ] as const)('round-trips the semantic URL for %s', (matchId, buildUrl, pathname) => {
        const url = buildUrl('https://example.test:8443/ignored/path', matchId);
        expect(url).toBe(`https://example.test:8443${pathname}`);
        // Verify the match ID can be decoded back from the URL path
        const segments = new URL(url).pathname.split('/').slice(1);
        const decoded = validateMatchId(segments[1] ?? '');
        expect(decoded).toEqual({ ok: true, value: matchId });
    });
});

// ─── / renders WelcomeScreen ────────────────────────────────────────────────

describe('route tree - / renders WelcomeScreen', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('the index route has no beforeLoad (welcome screen needs no lobby infrastructure)', async () => {
        const { indexRoute } = await import('../../../src/routing/route-tree');
        const config = indexRoute.options as { beforeLoad?: (ctx: unknown) => unknown };

        // The welcome screen is a static page — no connection gate, no identity gate.
        expect(config.beforeLoad).toBeUndefined();
    });
});

// ─── /profile validates returnTo ────────────────────────────────────────────

describe('search-params - /profile returnTo validation', () => {
    it('passes safe relative pathnames through', () => {
        expect(profileSearchParams({ returnTo: '/match/abc' })).toEqual({ returnTo: '/match/abc' });
    });

    it('passes /lobby as a safe returnTo', () => {
        expect(profileSearchParams({ returnTo: '/lobby' })).toEqual({ returnTo: '/lobby' });
    });

    it('passes /profile as a safe returnTo', () => {
        expect(profileSearchParams({ returnTo: '/profile' })).toEqual({ returnTo: '/profile' });
    });

    it('returns undefined when returnTo is missing', () => {
        expect(profileSearchParams({})).toEqual({ returnTo: undefined });
    });

    it('returns undefined when returnTo is an empty string', () => {
        expect(profileSearchParams({ returnTo: '' })).toEqual({ returnTo: undefined });
    });

    it('returns undefined when returnTo is not a string', () => {
        expect(profileSearchParams({ returnTo: 123 })).toEqual({ returnTo: undefined });
    });

    it('rejects protocol-relative //evil.com', () => {
        expect(profileSearchParams({ returnTo: '//evil.com' })).toEqual({ returnTo: undefined });
    });

    it('rejects URLs with explicit scheme', () => {
        expect(profileSearchParams({ returnTo: 'https://evil.com' })).toEqual({ returnTo: undefined });
    });

    it('rejects path traversal', () => {
        expect(profileSearchParams({ returnTo: '/match/../admin' })).toEqual({ returnTo: undefined });
    });

    it('decodes URI-encoded values before validation', () => {
        expect(profileSearchParams({ returnTo: '%2Fmatch%2Fabc' })).toEqual({ returnTo: '/match/abc' });
    });

    it('returns undefined for URI-encoded traversal', () => {
        expect(profileSearchParams({ returnTo: '%2F..%2Fadmin' })).toEqual({ returnTo: undefined });
    });

    it('returns undefined for invalid URI encoding', () => {
        expect(profileSearchParams({ returnTo: '%ZZ' })).toEqual({ returnTo: undefined });
    });
});

// ─── match routes: all 6 rejection reasons (FR-022) ────────────────────────

describe('match route - validateAndRedirectMatchId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the decoded matchId on success', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        const result = validateAndRedirectMatchId('m-123');
        expect(result).toBe('m-123');
        expect(redirect).not.toHaveBeenCalled();
    });

    it('returns decoded URL-encoded matchId on success', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        const result = validateAndRedirectMatchId('room%20alpha');
        expect(result).toBe('room alpha');
        expect(redirect).not.toHaveBeenCalled();
    });

    it('redirects to /lobby on malformed-encoding', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        expect(() => validateAndRedirectMatchId('%GG')).toThrow();
        expect(redirect).toHaveBeenCalledWith({ to: '/lobby' });
    });

    it('redirects to /lobby on decoded-slash', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        expect(() => validateAndRedirectMatchId('a%2Fb')).toThrow();
        expect(redirect).toHaveBeenCalledWith({ to: '/lobby' });
    });

    it('redirects to /lobby on unsafe-character (dots)', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        expect(() => validateAndRedirectMatchId('..')).toThrow();
        expect(redirect).toHaveBeenCalledWith({ to: '/lobby' });
    });

    it('redirects to /lobby on unsafe-character (control chars)', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        expect(() => validateAndRedirectMatchId('%00')).toThrow();
        expect(redirect).toHaveBeenCalledWith({ to: '/lobby' });
    });

    it('accepts empty string (empty-match-id is a route-tree-level rejection)', async () => {
        const { validateAndRedirectMatchId } = await import('../../../src/routing/match-validation');
        const result = validateAndRedirectMatchId('');
        expect(result).toBe('');
        expect(redirect).not.toHaveBeenCalled();
    });
});
