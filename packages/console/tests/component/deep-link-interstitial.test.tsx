/**
 * DeepLinkInterstitial component tests — issue #34 (T-034-11).
 *
 * Verifies the play-or-spectate interstitial component (FR-029):
 *
 *   - Player entry shows Play + Spectate buttons
 *   - Spectator entry shows Spectate only
 *   - Focus management (initial focus on heading)
 *   - Keyboard navigation (Enter/Space activates buttons)
 *   - Screen-reader announcements
 *   - Return-to-lobby dismissal
 *   - axe-core WCAG 2.2 AA clean
 */

import type { MatchId } from '@europa/matchmaking';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import type { RouteEntry } from '../../src/routing/route-adapter';
import { DeepLinkInterstitial } from '../../src/ui/deep-link-interstitial';
import '../../src/styles/index.css';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const MATCH_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' as MatchId;

function playerEntry(): Extract<RouteEntry, { readonly kind: 'player' }> {
    return {
        kind: 'player',
        route: { kind: 'match', pathname: `/match/${MATCH_ID}`, matchId: MATCH_ID, intent: 'adaptive' },
        matchId: MATCH_ID,
        intent: 'adaptive',
    };
}

function spectatorEntry(): Extract<RouteEntry, { readonly kind: 'spectator' }> {
    return {
        kind: 'spectator',
        route: { kind: 'match', pathname: `/match/${MATCH_ID}`, matchId: MATCH_ID, intent: 'spectate' },
        matchId: MATCH_ID,
        intent: 'spectate',
    };
}

function callbacks() {
    return {
        onPlay: vi.fn(),
        onSpectate: vi.fn(),
        onReturnToLobby: vi.fn(),
    };
}

// ----------------------------------------------------------------------------
// Player entry: Play + Spectate buttons
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial player entry', () => {
    test('renders Play and Spectate buttons for player entry', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        // Both Play and Spectate buttons should be visible.
        await expect.element(screen.getByRole('button', { name: 'Play' })).toBeVisible();
        await expect.element(screen.getByRole('button', { name: 'Spectate' })).toBeVisible();

        // Match ID prefix should be displayed.
        await expect.element(screen.getByText(new RegExp(MATCH_ID.slice(0, 8)))).toBeVisible();

        // Return to lobby button should be present.
        await expect.element(screen.getByRole('button', { name: 'Return to lobby' })).toBeVisible();
    });

    test('Play button calls onPlay handler', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const playButton = screen.getByRole('button', { name: 'Play' });
        await playButton.click();

        expect(onPlay).toHaveBeenCalledTimes(1);
        expect(onSpectate).not.toHaveBeenCalled();
        expect(onReturnToLobby).not.toHaveBeenCalled();
    });

    test('Spectate button calls onSpectate handler', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const spectateButton = screen.getByRole('button', { name: 'Spectate' });
        await spectateButton.click();

        expect(onSpectate).toHaveBeenCalledTimes(1);
        expect(onPlay).not.toHaveBeenCalled();
    });
});

// ----------------------------------------------------------------------------
// Spectator entry: Spectate only
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial spectator entry', () => {
    test('renders only Spectate button for spectator entry', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={spectatorEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        // Spectate button should be visible.
        await expect.element(screen.getByRole('button', { name: 'Spectate' })).toBeVisible();

        // Play button should NOT be present.
        const playButtons = screen.container.querySelectorAll('[data-europa-deep-link-play]');
        expect(playButtons).toHaveLength(0);
    });

    test('Spectate button calls onSpectate for spectator entry', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={spectatorEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const spectateButton = screen.getByRole('button', { name: 'Spectate' });
        await spectateButton.click();

        expect(onSpectate).toHaveBeenCalledTimes(1);
        expect(onPlay).not.toHaveBeenCalled();
    });
});

// ----------------------------------------------------------------------------
// Focus management
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial focus management', () => {
    test('heading receives focus on mount', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const heading = screen.getByRole('heading', { name: 'Match found' }).element();
        // The heading has tabIndex={-1} and is focused via useEffect.
        // In browser mode, focus() is real — check activeElement.
        expect(document.activeElement).toBe(heading);
    });
});

// ----------------------------------------------------------------------------
// Keyboard navigation
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial keyboard navigation', () => {
    test('Enter on Play button activates onPlay', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const playButton = screen.getByRole('button', { name: 'Play' }).element() as HTMLButtonElement;
        playButton.focus();

        const user = userEvent.setup();
        await user.keyboard('{Enter}');

        expect(onPlay).toHaveBeenCalledTimes(1);
    });

    test('Space on Spectate button activates onSpectate', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const spectateButton = screen.getByRole('button', { name: 'Spectate' }).element() as HTMLButtonElement;
        spectateButton.focus();

        const user = userEvent.setup();
        await user.keyboard(' ');

        expect(onSpectate).toHaveBeenCalledTimes(1);
    });

    test('Enter on Return to lobby button activates onReturnToLobby', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const returnButton = screen.getByRole('button', { name: 'Return to lobby' }).element() as HTMLButtonElement;
        returnButton.focus();

        const user = userEvent.setup();
        await user.keyboard('{Enter}');

        expect(onReturnToLobby).toHaveBeenCalledTimes(1);
    });
});

// ----------------------------------------------------------------------------
// Return-to-lobby dismissal
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial return-to-lobby', () => {
    test('clicking Return to lobby calls onReturnToLobby', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const returnButton = screen.getByRole('button', { name: 'Return to lobby' });
        await returnButton.click();

        expect(onReturnToLobby).toHaveBeenCalledTimes(1);
        expect(onPlay).not.toHaveBeenCalled();
        expect(onSpectate).not.toHaveBeenCalled();
    });
});

// ----------------------------------------------------------------------------
// Accessibility: axe scan
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial accessibility', () => {
    test('axe-core WCAG 2.2 AA scan is clean for player entry', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        // The interstitial renders a region with aria-labelledby.
        await expect.element(screen.getByRole('region', { name: 'Match found' })).toBeVisible();

        // No WCAG 2.2 AA violations.
        const region = screen.getByRole('region', { name: 'Match found' }).element();
        await expectNoDomA11yViolations(region);
    });

    test('axe-core WCAG 2.2 AA scan is clean for spectator entry', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const screen = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={spectatorEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
            />,
        );

        const region = screen.getByRole('region', { name: 'Match found' }).element();
        await expectNoDomA11yViolations(region);
    });
});

// ----------------------------------------------------------------------------
// Screen-reader announcements
// ----------------------------------------------------------------------------

describe('DeepLinkInterstitial announcements', () => {
    test('player entry announces play-or-spectate availability', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const mockAnnouncer = { announce: vi.fn(), clear: vi.fn() };
        await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
                announcer={mockAnnouncer as never}
            />,
        );

        expect(mockAnnouncer.announce).toHaveBeenCalledWith(
            'This match is available. Choose Play to join or Spectate to watch.',
            'polite',
        );
    });

    test('spectator entry announces spectate-only availability', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const mockAnnouncer = { announce: vi.fn(), clear: vi.fn() };
        await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={spectatorEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
                announcer={mockAnnouncer as never}
            />,
        );

        expect(mockAnnouncer.announce).toHaveBeenCalledWith(
            'This match is in progress. Choose Spectate to watch.',
            'polite',
        );
    });

    test('announcement is only made once (guarded)', async () => {
        const { onPlay, onSpectate, onReturnToLobby } = callbacks();
        const mockAnnouncer = { announce: vi.fn(), clear: vi.fn() };

        // Render twice (StrictMode in browser mode re-mounts).
        const { rerender, unmount } = await render(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
                announcer={mockAnnouncer as never}
            />,
        );

        // Re-render with same props (simulating React re-render).
        rerender(
            <DeepLinkInterstitial
                matchId={MATCH_ID}
                entry={playerEntry()}
                onPlay={onPlay}
                onSpectate={onSpectate}
                onReturnToLobby={onReturnToLobby}
                announcer={mockAnnouncer as never}
            />,
        );

        // Announcer.announce should have been called exactly once
        // (guarded by announcedRef).
        const playCalls = mockAnnouncer.announce.mock.calls.filter(
            (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Choose Play'),
        );
        expect(playCalls).toHaveLength(1);

        unmount();
    });
});
