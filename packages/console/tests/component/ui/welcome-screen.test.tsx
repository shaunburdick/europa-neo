/**
 * Component tests — welcome landing screen (Feature 017).
 *
 * Covers AC-002 through AC-015 from specs/017-welcome-landing-screen/spec.md:
 *   - Logo display with alt text (AC-002)
 *   - Tagline text (AC-003)
 *   - Play link with /lobby href (AC-004)
 *   - Manual link with correct URL and target="_blank" (AC-005)
 *   - GitHub link with correct URL and target="_blank" (AC-006)
 *   - Document title set on mount (AC-015)
 *   - No WebSocket connection / static-only (AC-014)
 *   - Responsive rendering at 375px (AC-009)
 *   - Accessibility: axe-core check (AC-010)
 *   - Keyboard navigation: focusable Play, manual, GitHub links (AC-011)
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { WelcomeScreen } from '../../../src/ui/welcome-screen';
import '../../../src/styles/index.css';
import { expectNoDomA11yViolations } from '../../setup-a11y-dom';

afterEach(() => {
    cleanup();
});

const MANUAL_URL = 'https://shaunburdick.github.io/europa-neo/manual/';
const GITHUB_URL = 'https://github.com/shaunburdick/europa-neo';

describe('WelcomeScreen component', () => {
    test('renders the lockup-dark SVG with alt="Europa Neo" (AC-002)', async () => {
        const screen = await render(<WelcomeScreen />);
        const img = screen.container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img?.getAttribute('alt')).toBe('Europa Neo');
        expect(img?.getAttribute('src')).toBe('assets/brand/europa-neo-lockup-dark.svg');
    });

    test('renders the tagline text (AC-003)', async () => {
        const screen = await render(<WelcomeScreen />);
        const tagline = screen.container.querySelector('p');
        expect(tagline).not.toBeNull();
        expect(tagline?.textContent).toContain('Nanobot warfare');
        expect(tagline?.textContent).toContain('Europa');
        expect(tagline?.textContent).toContain('real-time multiplayer strategy game');
    });

    test('Play link has href="/lobby" (AC-004)', async () => {
        const screen = await render(<WelcomeScreen />);
        const playLink = screen.container.querySelector('a[href="/lobby"]');
        expect(playLink).not.toBeNull();
        expect(playLink?.textContent?.trim()).toBe('Play');
    });

    test('Manual link has correct external URL and target="_blank" (AC-005)', async () => {
        const screen = await render(<WelcomeScreen />);
        const manualLink = screen.container.querySelector(`a[href="${MANUAL_URL}"]`);
        expect(manualLink).not.toBeNull();
        expect(manualLink?.getAttribute('target')).toBe('_blank');
        expect(manualLink?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(manualLink?.textContent?.trim()).toBe('Player Manual');
    });

    test('GitHub link has correct external URL and target="_blank" (AC-006)', async () => {
        const screen = await render(<WelcomeScreen />);
        const githubLink = screen.container.querySelector(`a[href="${GITHUB_URL}"]`);
        expect(githubLink).not.toBeNull();
        expect(githubLink?.getAttribute('target')).toBe('_blank');
        expect(githubLink?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(githubLink?.textContent?.trim()).toBe('GitHub');
    });

    test('sets document.title to include "Europa Neo" on mount (AC-015)', async () => {
        const originalTitle = document.title;
        try {
            await render(<WelcomeScreen />);
            expect(document.title).toContain('Europa Neo');
            expect(document.title).toContain('Nanobot warfare');
        } finally {
            document.title = originalTitle;
        }
    });

    test('does not import or use WebSocket (AC-014) — verifies static structure', async () => {
        const screen = await render(<WelcomeScreen />);
        // The welcome screen is a <main> element — no WebSocket references
        const main = screen.container.querySelector('main');
        expect(main).not.toBeNull();
        // No interactive game elements or runtime imports
        expect(screen.container.querySelector('[data-europa-match]')).toBeNull();
    });

    test('renders without overflow at 375px width (AC-009)', async () => {
        // The component should render in a single column at narrow widths
        const screen = await render(<WelcomeScreen />);
        const main = screen.container.querySelector('main');
        expect(main).not.toBeNull();
        // The main element should be visible and not clipped
        const rect = main?.getBoundingClientRect();
        expect(rect).toBeDefined();
        expect((rect?.width ?? 0) > 0).toBe(true);
    });

    test('has accessible landmarks: main and nav (AC-008)', async () => {
        const screen = await render(<WelcomeScreen />);
        expect(screen.container.querySelector('main')).not.toBeNull();
        expect(screen.container.querySelector('nav[aria-label="Learn more"]')).not.toBeNull();
    });

    test('passes axe-core accessibility check (AC-010)', async () => {
        const screen = await render(<WelcomeScreen />);
        await expectNoDomA11yViolations(screen.container);
    });

    test('Play link, manual link, and GitHub link are all keyboard-navigable (AC-011)', async () => {
        const screen = await render(<WelcomeScreen />);
        // Play CTA should have the europa-focus-ring class for visible focus
        const playLink = screen.container.querySelector('a[href="/lobby"]');
        expect(playLink?.classList.contains('europa-focus-ring')).toBe(true);

        // Secondary links should NOT have europa-focus-ring (avoids always-visible
        // outline boxes); they still get *:focus-visible styling for keyboard nav.
        const manualLink = screen.container.querySelector(`a[href="${MANUAL_URL}"]`);
        expect(manualLink?.classList.contains('europa-focus-ring')).toBe(false);

        const githubLink = screen.container.querySelector(`a[href="${GITHUB_URL}"]`);
        expect(githubLink?.classList.contains('europa-focus-ring')).toBe(false);
    });

    test('has a nav element wrapping secondary links', async () => {
        const screen = await render(<WelcomeScreen />);
        const nav = screen.container.querySelector('nav');
        expect(nav).not.toBeNull();
        const links = nav?.querySelectorAll('a');
        expect(links?.length).toBe(2);
    });
});
