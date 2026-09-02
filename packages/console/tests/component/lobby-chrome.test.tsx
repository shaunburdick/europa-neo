/**
 * Lobby chrome component tests — feature 012 (T-011).
 *
 * Focused render-level verification of the public match browser
 * (`LobbyMatchList`) across the 2/3/4-player capacity envelope that
 * feature 012 ships end-to-end (engine FR-019: `capacity ∈ {2,3,4}`):
 *
 *   - three public entries render with FR-003 (012) capacity chrome
 *     (`k of N seats filled`) + FR-006 board label (`S×S board · 250 ms ticks`);
 *   - Join is offered ONLY for open WAITING matches
 *     (`status === 'waiting' && seatsFilled < capacity`) — a full
 *     waiting match shows "Full" instead (FR-007);
 *   - Spectate is offered ONLY for `in_progress` matches (FR-012);
 *   - private entries never appear — the matchmaking lobby projection
 *     (`lobby.ts`: `visibility !== 'public' || status !== 'filling'`
 *     is skipped) guarantees `PublicLobbyEntry` can never represent a
 *     private match, so the component renders exactly its input and no
 *     phantom/private row is synthesized;
 *   - axe-core WCAG 2.2 AA scan is clean and every row action carries a
 *     composed accessible name reachable by role/name (WCAG 4.1.2);
 *   - the keyboard-only flow is not regressed: a native button is
 *     focusable and Enter activates the same join handler as a click.
 *
 * The component imports only TYPES from `@europa/matchmaking`, so no
 * matchmaking runtime (and thus no `node:crypto` `getRandomValues`
 * externalization) is loaded — this suite is isolated from the known
 * browser-mode lobby-transport crypto conflict.
 */

import { register } from '@europa/design/components';

register();

import type { MatchId, PublicLobbyEntry } from '@europa/matchmaking';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { LobbyMatchList } from '../../src/ui/lobby-match-list';
import '../../src/styles/index.css';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const MATCH_2P = '22222222-0000-4000-8000-000000000000' as MatchId;
const MATCH_3P = '33333333-0000-4000-8000-000000000000' as MatchId;
const MATCH_4P = '44444444-0000-4000-8000-000000000000' as MatchId;
// A match id that is deliberately NOT in any rendered list — used to
// prove no private/phantom row is synthesized by the chrome.
const PRIVATE_MATCH = 'pppppppp-0000-4000-8000-000000000000' as MatchId;

/** The three public entries from the task: 2p 1/2, 3p 2/3, 4p 3/4. */
const PUBLIC_ENTRIES: ReadonlyArray<PublicLobbyEntry> = [
    { matchId: MATCH_2P, seatsFilled: 1, capacity: 2, status: 'waiting', boardSize: 32, tickIntervalMs: 250 },
    { matchId: MATCH_3P, seatsFilled: 2, capacity: 3, status: 'waiting', boardSize: 48, tickIntervalMs: 250 },
    { matchId: MATCH_4P, seatsFilled: 3, capacity: 4, status: 'in_progress', boardSize: 48, tickIntervalMs: 250 },
];

/** No-op seat callbacks for render-only assertions. */
function seatCallbacks() {
    return {
        onJoin: vi.fn(),
        onSpectate: vi.fn(),
    };
}

// ----------------------------------------------------------------------------
// Capacity chrome + board labels (FR-003 / FR-006, 012)
// ----------------------------------------------------------------------------

describe('LobbyMatchList capacity chrome (012)', () => {
    test('renders three public entries with k/N occupancy and board labels', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        // Exactly three rows — no private/phantom row is synthesized.
        const rows = screen.getByRole('listitem').elements();
        expect(rows).toHaveLength(3);

        // Occupancy text contains the k / N numbers for every capacity.
        await expect.element(screen.getByText('1 of 2 seats filled')).toBeVisible();
        await expect.element(screen.getByText('2 of 3 seats filled')).toBeVisible();
        await expect.element(screen.getByText('3 of 4 seats filled')).toBeVisible();

        // Board label carries the square dimension + tick cadence
        // (32×32 is unique to the 2p row; 48×48 is shared by 3p + 4p).
        await expect.element(screen.getByText('32×32 board · 250 ms ticks')).toBeVisible();
        expect(screen.getByText('48×48 board · 250 ms ticks').elements()).toHaveLength(2);

        // Lifecycle status label is present per row (waiting ×2, in_progress ×1).
        expect(screen.getByText('Waiting for players').elements()).toHaveLength(2);
        expect(screen.getByText('In progress').elements()).toHaveLength(1);
    });

    test('private entries are absent — the list renders exactly its public input', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        // Row count equals the public entry count (no extra rows).
        expect(screen.getByRole('listitem').elements()).toHaveLength(PUBLIC_ENTRIES.length);

        // Every public entry has a stable, addressable row.
        for (const entry of PUBLIC_ENTRIES) {
            expect(screen.container.querySelector(`[data-match-id="${entry.matchId}"]`)).not.toBeNull();
        }

        // A match id that was never part of the projection never appears
        // as a row — private matches are filtered upstream and the chrome
        // cannot invent one.
        expect(screen.container.querySelector(`[data-match-id="${PRIVATE_MATCH}"]`)).toBeNull();
    });
});

// ----------------------------------------------------------------------------
// Join / Spectate availability per status + capacity (FR-007 / FR-012)
// ----------------------------------------------------------------------------

describe('LobbyMatchList seat actions (FR-007 / FR-012)', () => {
    test('Join is offered only for open WAITING matches (waiting && seatsFilled < capacity)', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        // 2p 1/2 (waiting, open) and 3p 2/3 (waiting, open) → Join.
        await expect
            .element(screen.getByRole('button', { name: 'Join match — Waiting for players, 1 of 2 seats filled' }))
            .toBeVisible();
        await expect
            .element(screen.getByRole('button', { name: 'Join match — Waiting for players, 2 of 3 seats filled' }))
            .toBeVisible();

        // 4p 3/4 is in_progress → NO Join button within that row (the 2p
        // and 3p rows legitimately keep theirs; we scope to the 4p row).
        const row4p = screen.container.querySelector(`[data-match-id="${MATCH_4P}"]`);
        expect(row4p).not.toBeNull();
        expect(row4p?.querySelector('europa-button[aria-label^="Join match"]')).toBeNull();

        // Spectate was never invoked by mere rendering.
        expect(onSpectate).not.toHaveBeenCalled();
    });

    test('a full WAITING match shows "Full" instead of Join (seatsFilled < capacity gate)', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const fullWaiting: ReadonlyArray<PublicLobbyEntry> = [
            { matchId: MATCH_2P, seatsFilled: 2, capacity: 2, status: 'waiting', boardSize: 32, tickIntervalMs: 250 },
        ];
        const screen = await render(
            <LobbyMatchList
                entries={fullWaiting}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        // No Join button for a full waiting match (auto-start owns it).
        const joinButtons = [...screen.container.querySelectorAll('europa-button')].filter((el) =>
            /^Join match/.test(el.getAttribute('aria-label') ?? ''),
        );
        expect(joinButtons).toHaveLength(0);
        await expect.element(screen.getByText('Full')).toBeVisible();
    });

    test('Spectate is offered only for in_progress matches', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        // 4p 3/4 in_progress → Spectate.
        await expect
            .element(screen.getByRole('button', { name: 'Spectate match — In progress, 3 of 4 seats filled' }))
            .toBeVisible();

        // Waiting matches never offer Spectate.
        const spectateButtons = [...screen.container.querySelectorAll('europa-button')].filter((el) =>
            /^Spectate match/.test(el.getAttribute('aria-label') ?? ''),
        );
        expect(spectateButtons).toHaveLength(1);
    });
});

// ----------------------------------------------------------------------------
// Accessibility: axe scan + reachable row labels (WCAG 4.1.2)
// ----------------------------------------------------------------------------

describe('LobbyMatchList accessibility (axe + labels)', () => {
    test('axe-core WCAG 2.2 AA scan is clean and rows carry composed names', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        // Semantic list structure: one <ul> region labelled by its heading.
        await expect.element(screen.getByRole('region', { name: 'Public matches' })).toBeVisible();
        await expect.element(screen.getByRole('list')).toBeVisible();
        expect(screen.getByRole('listitem').elements()).toHaveLength(3);

        // Every action button is reachable by a composed accessible name
        // (visible verb first, then lifecycle + occupancy context).
        await expect
            .element(screen.getByRole('button', { name: 'Join match — Waiting for players, 1 of 2 seats filled' }))
            .toBeVisible();
        await expect
            .element(screen.getByRole('button', { name: 'Join match — Waiting for players, 2 of 3 seats filled' }))
            .toBeVisible();
        await expect
            .element(screen.getByRole('button', { name: 'Spectate match — In progress, 3 of 4 seats filled' }))
            .toBeVisible();

        // No WCAG 2.2 AA violations in the rendered subtree.
        const region = screen.getByRole('region', { name: 'Public matches' }).element();
        await expectNoDomA11yViolations(region);
    });
});

// ----------------------------------------------------------------------------
// Keyboard-only flow not regressed (native button focus + Enter activation)
// ----------------------------------------------------------------------------

describe('LobbyMatchList keyboard-only flow', () => {
    test('Enter on a focused Join button activates the same handler as a click', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        const joinButton = screen
            .getByRole('button', { name: 'Join match — Waiting for players, 1 of 2 seats filled' })
            .element() as HTMLButtonElement;

        // Keyboard-reachable: a native <button> is focusable; Tab/Enter
        // reach it without a pointer. With Shadow DOM (spec 014 Wave 3)
        // that native button lives inside <europa-button>'s open shadow
        // root, and document.activeElement reports the shadow HOST for
        // focus inside an open shadow tree.
        joinButton.focus();
        const joinRoot = joinButton.getRootNode();
        expect(document.activeElement).toBe(joinRoot instanceof ShadowRoot ? joinRoot.host : joinButton);

        // Genuine keyboard activation: Enter on a focused native button
        // fires the same click handler a pointer would.
        const user = userEvent.setup();
        await user.keyboard('{Enter}');

        expect(onJoin).toHaveBeenCalledTimes(1);
        expect(onJoin).toHaveBeenCalledWith(MATCH_2P);
        expect(onSpectate).not.toHaveBeenCalled();
    });

    test('Enter on a focused Spectate button activates the spectate handler', async () => {
        const { onJoin, onSpectate } = seatCallbacks();
        const screen = await render(
            <LobbyMatchList
                entries={PUBLIC_ENTRIES}
                loading={false}
                activeMatchId={null}
                busy={false}
                actionError={null}
                onJoin={onJoin}
                onSpectate={onSpectate}
            />,
        );

        const spectateButton = screen
            .getByRole('button', { name: 'Spectate match — In progress, 3 of 4 seats filled' })
            .element() as HTMLButtonElement;

        // Same shadow-host focus anchor as the Join test above.
        spectateButton.focus();
        const spectateRoot = spectateButton.getRootNode();
        expect(document.activeElement).toBe(spectateRoot instanceof ShadowRoot ? spectateRoot.host : spectateButton);

        const user = userEvent.setup();
        await user.keyboard('{Enter}');

        expect(onSpectate).toHaveBeenCalledTimes(1);
        expect(onSpectate).toHaveBeenCalledWith(MATCH_4P);
        expect(onJoin).not.toHaveBeenCalled();
    });
});
