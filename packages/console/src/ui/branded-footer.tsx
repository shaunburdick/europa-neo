/**
 * Branded footer rendered on every console top-level view (spec 012
 * addendum, FR-023 / FR-026 / FR-027).
 *
 * Shows the app name ("Europa Neo"), the bundled application version
 * (`APP_VERSION` from `@europa/version`), and a link to the GitHub
 * repository. The footer is the single, shared home for the version string
 * so individual views no longer carry their own duplicate version line
 * (FR-023 consolidation: the former HUD `v{APP_VERSION}` span was retired
 * into this component).
 *
 * Styling uses ONLY `europa-*` design tokens (`var(--europa-*)`) — no
 * hardcoded color literals — so the design-system no-literals guard stays
 * green over `packages/console/src` (SC-012). The footer is purely
 * presentational; the only interactive element is the external link.
 *
 * `prefers-reduced-motion` needs no special handling here: the footer has
 * no animation, and the shared stylesheet's global
 * `@media (prefers-reduced-motion: reduce)` guard (catalog.css §11) already
 * neutralizes any inherited motion.
 */

import { APP_VERSION } from '@europa/version';
import type { JSX } from 'react';

/** Canonical public repository URL shown in every footer (FR-027). */
const GITHUB_URL = 'https://github.com/shaunburdick/europa-neo';

/**
 * The shared branded footer for the console UI.
 *
 * @returns A `<footer>` element carrying the app name, version, and a
 *   GitHub link, styled exclusively with `europa-*` design tokens.
 */
export function BrandedFooter(): JSX.Element {
    return (
        <footer
            style={{
                marginTop: 'auto',
                padding: 'var(--europa-spacing-md) var(--europa-spacing-lg)',
                borderTop: `var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-border)`,
                backgroundColor: 'var(--europa-color-surface)',
                color: 'var(--europa-color-text-muted)',
                fontFamily: 'var(--europa-typography-font-stack)',
                fontSize: 'var(--europa-typography-size-xs)',
                lineHeight: 'var(--europa-typography-line-height-normal)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--europa-spacing-sm)',
                alignItems: 'center',
            }}
        >
            <span>Europa Neo</span>
            <span>v{APP_VERSION}</span>
            <a
                href={GITHUB_URL}
                className="europa-focus-ring"
                rel="noreferrer noopener"
                style={{ color: 'var(--europa-color-accent)', textDecoration: 'underline' }}
                target="_blank"
            >
                GitHub
            </a>
        </footer>
    );
}
