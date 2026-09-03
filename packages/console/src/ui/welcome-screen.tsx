/**
 * Welcome landing screen — Feature 017.
 *
 * A pure static React component rendered at the root route `/`. It replaces
 * the previous redirect-to-lobby with a proper landing experience: brand
 * identity, tagline, and clear entry-point links.
 *
 * Design constraints:
 *   - No WebSocket connection, no identity resolution, no runtime imports
 *     beyond `@europa/design` CSS tokens (FR-009).
 *   - All inline styles use `var(--europa-*)` design tokens — no hex
 *     literals, no new CSS classes (FR-007).
 *   - The `europa-button` web component is NOT used for Play — a styled
 *     `<a>` element gives native link behavior (right-click, middle-click,
 *     href navigation) without form-associated complications.
 *   - Follows the BrandedFooter styling pattern (inline token styles).
 *
 * Accessibility (FR-008, WCAG 2.2 AA):
 *   - `<main>` landmark.
 *   - `<img>` with `alt="Europa Neo"` serves as the page heading.
 *   - `<nav>` for secondary links.
 *   - All interactive elements keyboard-navigable with visible focus rings.
 *   - `document.title` set on mount (AC-015).
 *
 * @module
 */

import type { JSX } from 'react';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrandedFooter } from './branded-footer';

/** Canonical GitHub Pages URL for the player manual (FR-005). */
const MANUAL_URL = 'https://shaunburdick.github.io/europa-neo/manual/';

/** Canonical public repository URL (FR-005). */
const GITHUB_URL = 'https://github.com/shaunburdick/europa-neo';

/**
 * The static welcome/landing page for the root route `/`.
 *
 * @returns A `<main>` element containing the brand lockup, tagline,
 *   Play link, and secondary navigation.
 */
export function WelcomeScreen(): JSX.Element {
    useEffect(() => {
        document.title = 'Europa Neo — Nanobot warfare on Jupiter\u2019s Europa';
    }, []);

    return (
        <main
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                padding: 'var(--europa-spacing-lg)',
                fontFamily: 'var(--europa-typography-font-stack)',
                color: 'var(--europa-color-text-primary)',
                textAlign: 'center',
                boxSizing: 'border-box',
            }}
        >
            {/* Brand lockup — FR-002: <img> with alt, not inline SVG. */}
            <img
                src="assets/brand/europa-neo-lockup-dark.svg"
                alt="Europa Neo"
                width={480}
                height={160}
                style={{ marginBottom: 'var(--europa-spacing-lg)' }}
            />

            {/* Tagline — FR-003: design-system typography level. */}
            <p
                style={{
                    margin: '0 0 var(--europa-spacing-lg)',
                    maxWidth: '36rem',
                    fontSize: 'var(--europa-typography-size-xl)',
                    lineHeight: 'var(--europa-typography-line-height-normal)',
                    color: 'var(--europa-color-text-primary)',
                }}
            >
                Nanobot warfare on Jupiter&rsquo;s moon Europa &mdash; a real-time multiplayer strategy game
            </p>

            {/* Descriptive copy — game overview. */}
            <p
                style={{
                    margin: '0 0 var(--europa-spacing-xl)',
                    maxWidth: '32rem',
                    fontSize: 'var(--europa-typography-size-base)',
                    lineHeight: 'var(--europa-typography-line-height-relaxed)',
                    color: 'var(--europa-color-text-secondary)',
                }}
            >
                Build cities, lay pipelines, and command your forces in this faithful
                reimplementation of the classic multiplayer strategy game. Play against
                a friend in real-time or host your own server.
            </p>

            {/* Primary CTA: Play — FR-004: styled &lt;a&gt; with europa tokens. */}
            <a
                href="/lobby"
                className="europa-focus-ring"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--europa-spacing-sm) var(--europa-spacing-lg)',
                    backgroundColor: 'var(--europa-color-surface-raised)',
                    color: 'var(--europa-color-text-primary)',
                    borderRadius: 'var(--europa-radii-input)',
                    textDecoration: 'none',
                    fontWeight: 'var(--europa-typography-weight-bold, bold)',
                    fontSize: 'var(--europa-typography-size-lg, 1.125rem)',
                    lineHeight: 'var(--europa-typography-line-height-normal)',
                    minHeight: '44px',
                    minWidth: '44px',
                    gap: 'var(--europa-spacing-xs)',
                }}
            >
                Play
            </a>

            {/* Secondary links — FR-005: external links with target="_blank". */}
            <nav
                aria-label="Learn more"
                style={{
                    marginTop: 'var(--europa-spacing-xl)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--europa-spacing-md)',
                    justifyContent: 'center',
                }}
            >
                <a
                    href={MANUAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: 'var(--europa-color-accent)',
                        textDecoration: 'underline',
                        minHeight: '44px',
                        minWidth: '44px',
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    Player Manual
                </a>
                <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: 'var(--europa-color-accent)',
                        textDecoration: 'underline',
                        minHeight: '44px',
                        minWidth: '44px',
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    GitHub
                </a>
            </nav>

            <BrandedFooter />
        </main>
    );
}

/**
 * Mount the welcome screen into the given DOM element.
 *
 * @param root The SPA mount node (`#root`).
 */
export function mountWelcomeScreen(root: HTMLElement): void {
    createRoot(root).render(<WelcomeScreen />);
}
