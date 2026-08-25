/**
 * useContainerSize component tests — Integration wave (review
 * follow-up T-I3).
 *
 * The minimap's viewport rectangle must reflect the REAL container
 * (original T081 intent) instead of defaulting to the full board.
 * These tests run in real Chromium (vitest browser mode) because the
 * subject is layout: a sized container must produce a non-degenerate
 * measurement, and resizing must update it via ResizeObserver.
 */

import { createElement, type JSX, useRef, useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { useContainerSize } from '../../../src/qol/use-container-size';

afterEach(() => {
    cleanup();
});

/** Read the probe's rendered measurement (hook output as the DOM sees it). */
function readout(): string | null {
    return document.querySelector('[data-testid="probe-readout"]')?.textContent ?? null;
}

/** Wait until the readout shows the expected measurement. */
async function expectReadout(expected: string): Promise<void> {
    await expect.poll(() => readout(), { timeout: 2000, interval: 50 }).toBe(expected);
}

/**
 * A fixed-size box observed by the hook; renders the measurement as
 * text so assertions read DOM state like a user would see it.
 */
function SizeProbe({ width, height }: { readonly width: string; readonly height: string }): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null);
    const size = useContainerSize(ref);
    return createElement(
        'div',
        null,
        createElement('div', {
            ref,
            style: { width, height },
            'data-testid': 'observed-box',
        }),
        createElement(
            'span',
            { 'data-testid': 'probe-readout' },
            size === null ? 'null' : `${String(size.width)}x${String(size.height)}`,
        ),
    );
}

describe('useContainerSize (T-I3)', () => {
    test('a sized container yields a non-degenerate viewport measurement', async () => {
        render(createElement(SizeProbe, { width: '320px', height: '200px' }));
        await expectReadout('320x200');
    });

    test('resizing the container updates the measurement (ResizeObserver)', async () => {
        render(createElement(SizeProbe, { width: '320px', height: '200px' }));
        await expectReadout('320x200');

        // Grow the box; the observer fires and the measurement follows.
        const box = document.querySelector<HTMLDivElement>('[data-testid="observed-box"]');
        expect(box).not.toBeNull();
        box.style.width = '480px';
        box.style.height = '240px';
        await expectReadout('480x240');
    });

    test('a detached container reports null so callers keep their fallback', async () => {
        /**
         * Observes a box that unmounts on click: the measurement must fall
         * back to null (the minimap then keeps its full-board default).
         */
        function DetachProbe(): JSX.Element {
            const [mounted, setMounted] = useState(true);
            const ref = useRef<HTMLDivElement | null>(null);
            const size = useContainerSize(ref);
            return createElement(
                'div',
                null,
                createElement(
                    'button',
                    { type: 'button', onClick: () => setMounted(false), 'data-testid': 'hide' },
                    'hide',
                ),
                mounted
                    ? createElement('div', {
                          ref,
                          style: { width: '64px', height: '48px' },
                          'data-testid': 'observed-box',
                      })
                    : null,
                createElement(
                    'span',
                    { 'data-testid': 'probe-readout' },
                    size === null ? 'null' : `${String(size.width)}x${String(size.height)}`,
                ),
            );
        }
        render(createElement(DetachProbe));
        await expectReadout('64x48');
        const hide = document.querySelector<HTMLButtonElement>('[data-testid="hide"]');
        expect(hide).not.toBeNull();
        hide.click();
        await expectReadout('null');
    });
});
