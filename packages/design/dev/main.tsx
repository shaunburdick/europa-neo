/**
 * Unified Design System Dev Page — React entry point.
 *
 * Bootstraps the dev page by:
 * 1. Injecting `--europa-*` CSS custom properties from the canonical TOKENS
 *    table (so catalog.css works without a prior `dist/design.css` build).
 * 2. Rendering the `<App />` React tree into `#root`.
 *
 * Token injection runs synchronously at module top-level, before any React
 * rendering, ensuring the CSS cascade is ready when components mount.
 */

import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { toKebabCase } from './lib/token-utils';
import './styles/shell.css';
import { TOKENS } from '../../src/tokens.ts';

// ---------------------------------------------------------------------------
// Token variable injection
// ---------------------------------------------------------------------------

/**
 * Publish the canonical {@link TOKENS} table as `--europa-*` CSS custom
 * properties on `:root`.
 *
 * `catalog.css` only *consumes* these variables; the `:root` definitions
 * are normally emitted into `dist/design.css` by the build. In dev we
 * define them straight from the source tokens so the showcase is fully
 * styled with no prior build and hot-reloads when tokens change.
 */
function applyTokenVariables(): void {
    const root = document.documentElement;
    const groups = Object.keys(TOKENS).sort() as Array<keyof typeof TOKENS>;

    for (const group of groups) {
        const groupValue = TOKENS[group] as Record<string, string | number>;
        const groupKebab = toKebabCase(group as string);

        for (const leafKey of Object.keys(groupValue).sort()) {
            const rawValue = groupValue[leafKey];
            if (rawValue === undefined) {
                continue;
            }
            const cssVar = `--europa-${groupKebab}-${toKebabCase(leafKey)}`;
            root.style.setProperty(cssVar, String(rawValue));
        }
    }
}

// Inject tokens synchronously before React renders.
applyTokenVariables();

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('root');
if (root === null) {
    throw new Error('Missing #root element — check dev/index.html');
}

createRoot(root).render(<App />);
