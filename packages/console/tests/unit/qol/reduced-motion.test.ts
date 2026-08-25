/**
 * Reduced-motion unit tests — Feature 005 (T076).
 *
 * Covers Q-A07: when `window.matchMedia('(prefers-reduced-motion:
 * reduce)').matches` is true:
 *   · `MapEffect`s of `kind: 'combat' | 'capture'` are NOT rendered
 *     (`filterEffectsForMotion` drops them);
 *   · the TTL budgets are treated as 0 (`motionAdjustedTtls`) so no
 *     flash/fade animation is scheduled;
 *   · live changes fire subscribers and unsubscribe cleanly.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
    filterEffectsForMotion,
    motionAdjustedTtls,
    prefersReducedMotion,
    REDUCED_MOTION_QUERY,
    subscribeReducedMotion,
} from '../../../src/qol/reduced-motion';
import type { MapEffect } from '../../../src/state/types';

/** MatchMedia stub state shared across tests. */
let reduced = false;

const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY ? reduced : false,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.push(listener);
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void): void => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    },
}));

const listeners: Array<(event: { matches: boolean }) => void> = [];

afterEach(() => {
    reduced = false;
    listeners.length = 0;
    vi.unstubAllGlobals();
});

function installMatchMedia(): void {
    vi.stubGlobal('matchMedia', matchMediaMock);
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
}

const EFFECTS: readonly MapEffect[] = [
    { kind: 'combat', cell: { x: 1, y: 1 }, expiresAtMs: 100 },
    { kind: 'capture', cell: { x: 2, y: 2 }, expiresAtMs: 100 },
    { kind: 'paratroop_launch', cell: { x: 3, y: 3 }, otherCell: { x: 4, y: 4 }, expiresAtMs: 100 },
    { kind: 'gun_fire', cell: { x: 5, y: 5 }, otherCell: { x: 6, y: 6 }, expiresAtMs: 100 },
];

describe('prefersReducedMotion', () => {
    test('reflects the media query', () => {
        installMatchMedia();
        reduced = true;
        expect(prefersReducedMotion()).toBe(true);
        reduced = false;
        expect(prefersReducedMotion()).toBe(false);
    });

    test('degrades to motion-allowed without matchMedia', () => {
        vi.stubGlobal('matchMedia', undefined);
        expect(prefersReducedMotion()).toBe(false);
    });
});

describe('subscribeReducedMotion', () => {
    test('fires immediately and on change; unsubscribes cleanly', () => {
        installMatchMedia();
        const seen: boolean[] = [];
        const unsubscribe = subscribeReducedMotion((value) => seen.push(value));
        expect(seen).toEqual([false]);

        reduced = true;
        for (const listener of [...listeners]) {
            listener({ matches: true });
        }
        expect(seen).toEqual([false, true]);

        unsubscribe();
        reduced = false;
        for (const listener of [...listeners]) {
            listener({ matches: false });
        }
        expect(seen).toEqual([false, true]);
    });
});

describe('filterEffectsForMotion', () => {
    test('reduced motion drops combat + capture entirely', () => {
        const kept = filterEffectsForMotion(EFFECTS, true);
        expect(kept.map((effect) => effect.kind)).toEqual(['paratroop_launch', 'gun_fire']);
    });

    test('full motion keeps everything', () => {
        expect(filterEffectsForMotion(EFFECTS, false)).toEqual(EFFECTS);
    });
});

describe('motionAdjustedTtls', () => {
    test('reduced motion treats both TTLs as 0', () => {
        expect(motionAdjustedTtls(true)).toEqual({ effectTtlMs: 0, labelTtlMs: 0 });
    });

    test('full motion uses the contractual constants', () => {
        const ttls = motionAdjustedTtls(false);
        expect(ttls.effectTtlMs).toBe(400);
        expect(ttls.labelTtlMs).toBe(1500);
    });
});
