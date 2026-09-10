/**
 * Browser-only setup file — loads the design-system stylesheet so CSS
 * custom properties (--europa-*) are available to component styles.
 *
 * Split from tests/setup.ts because that file imports @axe-core/playwright
 * and axe-core (Node-only packages) that may not resolve in the browser
 * bundle, causing the entire setup to fail silently. This file imports
 * ONLY browser-safe @europa/design modules.
 *
 * This is the sole setupFiles entry for vitest.config.browser.ts and
 * the browser project in vitest.config.coverage.ts.
 *
 * Note: the old web-component `register()` call was removed when
 * @europa/design converted to React function components — React
 * components render standard HTML and need no custom-element
 * registration.
 */

import { createElement } from 'react';
import { vi } from 'vitest';

import '@europa/design/dist/design.css';

/**
 * Mock TanStack Router's `Link` and `useNavigate` for component tests.
 *
 * - `Link` renders a plain `<a>` tag with the correct `href`.
 * - `useNavigate` returns a function that delegates to the real
 *   `window.history.pushState` / `replaceState` so that spies on
 *   those methods still work. This preserves test compatibility
 *   with the pre-conversion assertion patterns.
 */
vi.mock('@tanstack/react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@tanstack/react-router')>();
    return {
        ...actual,
        Link: (props: { to: string; children: React.ReactNode; [key: string]: unknown }) => {
            const { to, children, ...rest } = props;
            return createElement('a', { href: to, ...rest }, children);
        },
        useNavigate: () => {
            return (opts: { to: string; replace?: boolean; search?: Record<string, string> }) => {
                let url = opts.to;
                if (opts.search !== undefined) {
                    const params = new URLSearchParams(opts.search);
                    url += `?${params.toString()}`;
                }
                const method = opts.replace ? 'replaceState' : 'pushState';
                window.history[method](window.history.state, '', url);
            };
        },
    };
});
