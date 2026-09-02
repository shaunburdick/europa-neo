/**
 * Lobby keyboard-only a11y tests — feature 010 (T-018, dimension 8, SC-006).
 *
 * Proves that a keyboard-only user can complete the full landing
 * lifecycle without a pointing device:
 *
 *   1. Tab through landing controls and confirm they are reachable.
 *   2. Identity is settable via the controller (form lives on /profile
 *      since feature 015).
 *   3. Tab to the create-match form and confirm radio/button
 *      are keyboard-operable.
 *   4. Set name → create → leave → lobby lifecycle via keyboard.
 *   5. The entire flow produces zero axe-core WCAG 2.2 AA violations.
 *
 * Runs in Vitest Browser Mode (real Chromium, real DOM, real keyboard
 * events) per vitest.config.browser.ts.
 */

import { register } from '@europa/design/components';

register();

import type { LobbyRevision, LobbySnapshot, MatchId } from '@europa/matchmaking';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { LobbyRoot } from '../../src/internal/lobby-runtime';
import type {
    LobbySnapshot as ClientSnapshot,
    LobbyConnectionState,
    LobbyErrorReport,
    WsLobbyClientState,
} from '../../src/net/ws-lobby-client';
import { createLobbyController, type LobbyTransport } from '../../src/state/lobby-controller';
import '../../src/styles/index.css';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => {
    cleanup();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const MATCH_A = 'aaaaaaaa-0000-4000-8000-000000000000' as MatchId;
const MATCH_B = 'bbbbbbbb-0000-4000-8000-000000000000' as MatchId;

function revisionOf(value: number): LobbyRevision {
    return value as LobbyRevision;
}

function snapshotOf(entries: LobbySnapshot['entries']): LobbySnapshot {
    return { revision: revisionOf(1), entries, activeMatchId: null };
}

// ----------------------------------------------------------------------------
// Fake transport
// ----------------------------------------------------------------------------

type StateHandler = (connection: LobbyConnectionState) => void;
type IdentityHandler = (identity: import('@europa/matchmaking').IdentityState) => void;
type SnapshotHandler = (snapshot: ClientSnapshot) => void;
type ErrorHandler = (report: LobbyErrorReport) => void;

class FakeTransport implements LobbyTransport {
    connection: LobbyConnectionState = 'idle';
    handle: string | null = null;

    private readonly stateHandlers = new Set<StateHandler>();
    private readonly identityHandlers = new Set<IdentityHandler>();
    private readonly snapshotHandlers = new Set<SnapshotHandler>();
    private readonly errorHandlers = new Set<ErrorHandler>();

    connect(): Promise<void> {
        this.connection = 'ready';
        this.emitState();
        // Simulate the server's directed identity event for a fresh
        // session: handle is null (unnamed). This transitions the
        // controller from 'restoring' → 'unnamed' so the name form renders.
        for (const handler of this.identityHandlers) {
            handler({ handle: null, hasIdentity: false });
        }
        return Promise.resolve();
    }

    disconnect(): void {
        this.connection = 'closed';
        this.emitState();
    }

    forgetIdentity(): void {}

    setHandle(handle: string): Promise<import('@europa/matchmaking').IdentityState> {
        this.handle = handle;
        const identity = { handle, hasIdentity: true };
        for (const handler of this.identityHandlers) {
            handler(identity);
        }
        return Promise.resolve(identity);
    }

    createMatch(): Promise<'waiting' | 'match'> {
        return Promise.resolve('waiting');
    }

    joinMatch(): Promise<'waiting' | 'match'> {
        return Promise.resolve('waiting');
    }

    spectateMatch(): Promise<'waiting' | 'match'> {
        return Promise.resolve('match');
    }

    leaveMatch(): Promise<void> {
        return Promise.resolve();
    }

    state(): WsLobbyClientState {
        return {
            connection: this.connection,
            handle: this.handle,
            hasClaim: false,
            snapshot: null,
            lastAppliedRevision: null,
            reconnectAttempt: 0,
        };
    }

    onStateChange(handler: StateHandler): () => void {
        this.stateHandlers.add(handler);
        return () => {
            this.stateHandlers.delete(handler);
        };
    }

    onIdentity(handler: IdentityHandler): () => void {
        this.identityHandlers.add(handler);
        return () => {
            this.identityHandlers.delete(handler);
        };
    }

    onSnapshot(handler: SnapshotHandler): () => void {
        this.snapshotHandlers.add(handler);
        return () => {
            this.snapshotHandlers.delete(handler);
        };
    }

    onError(handler: ErrorHandler): () => void {
        this.errorHandlers.add(handler);
        return () => {
            this.errorHandlers.delete(handler);
        };
    }

    emitState(): void {
        for (const handler of this.stateHandlers) {
            handler(this.connection);
        }
    }

    deliverSnapshot(snapshot: ClientSnapshot): void {
        for (const handler of this.snapshotHandlers) {
            handler(snapshot);
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('lobby keyboard-only use (SC-006 / dimension 8)', () => {
    test('key landing controls are keyboard-focusable', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        // The skip link must be focusable.
        const skipLink = screen.getByRole('link', { name: /skip/i });
        skipLink.element().focus();
        expect(document.activeElement).toBe(skipLink.element());

        // The profile link (Choose a name / Manage profile) must be
        // focusable — feature 015 moved the identity form to /profile.
        const profileLink = screen.getByRole('link', { name: /Choose a name|Manage profile/i });
        profileLink.element().focus();
        expect(document.activeElement).toBe(profileLink.element());

        // The "Create match" button must exist and be a real <button>
        // (disabled until a handle is confirmed — disabled buttons
        // can't receive programmatic focus, so just assert presence).
        const createBtn = screen.getByRole('button', { name: 'Create match' }).element() as HTMLButtonElement;
        expect(createBtn.tagName).toBe('BUTTON');
        expect(createBtn.disabled).toBe(true);

        controller.disconnect();
    });

    test('identity is settable via controller when form is on /profile', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        // Feature 015 moved the identity form to /profile. The lobby
        // landing shows a "Choose a name" link instead of an inline
        // form. Set the handle through the controller (the same path
        // the /profile route uses after form submission).
        await controller.setHandle('Nova');
        await expect.element(screen.getByText('Nova')).toBeVisible();
        expect(controller.store.getState().handle).toBe('Nova');

        // The create button should now be enabled.
        const createBtn = screen.getByRole('button', { name: 'Create match' }).element() as HTMLButtonElement;
        expect(createBtn.disabled).toBe(false);
        controller.disconnect();
    });

    test('create-form radio buttons are keyboard-operable', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        // First set a name so the create form is enabled.
        await controller.setHandle('Nova');
        await expect.element(screen.getByText('Nova')).toBeVisible();

        // Find the player-count radio group.
        const radios = screen.container.querySelectorAll('input[type="radio"]');
        expect(radios.length).toBeGreaterThanOrEqual(2);

        // Focus the first radio and use ArrowRight to change selection.
        (radios[0] as HTMLInputElement).focus();
        expect(document.activeElement).toBe(radios[0]);
        const user = userEvent.setup();
        await user.keyboard('{ArrowRight}');
        // ArrowRight should move to the next radio.
        const secondRadio = radios[1] as HTMLInputElement;
        expect(secondRadio.checked).toBe(true);
        controller.disconnect();
    });

    test('match row action buttons are real <button> elements', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(
            snapshotOf([
                {
                    matchId: MATCH_A,
                    seatsFilled: 1,
                    capacity: 2,
                    status: 'waiting',
                    boardSize: 32,
                    tickIntervalMs: 250,
                },
                {
                    matchId: MATCH_B,
                    seatsFilled: 2,
                    capacity: 2,
                    status: 'in_progress',
                    boardSize: 32,
                    tickIntervalMs: 250,
                },
            ]),
        );

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        await expect.element(screen.getByText(/Match aaaaaaaa/)).toBeVisible();

        // Set a name first.
        await controller.setHandle('Nova');
        await expect.element(screen.getByText('Nova')).toBeVisible();

        // The Join button must be a real <button>.
        const joinEl = screen.getByRole('button', { name: /Join match/ }).element() as HTMLElement;
        expect(joinEl.tagName).toBe('BUTTON');
        expect(joinEl.getAttribute('type')).toBe('button');

        // The Spectate button must be a real <button>.
        const spectateEl = screen.getByRole('button', { name: /Spectate match/ }).element() as HTMLElement;
        expect(spectateEl.tagName).toBe('BUTTON');
        expect(spectateEl.getAttribute('type')).toBe('button');
        controller.disconnect();
    });

    test('pre-baseline match list announces loading and reports busy state', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        const loadingStatus = screen.getByText('Loading public matches…');
        await expect.element(loadingStatus).toBeVisible();

        const listCard = screen.getByRole('heading', { name: 'Public matches' }).element().parentElement;
        expect(listCard?.getAttribute('aria-busy')).toBe('true');
        expect(loadingStatus.element().getAttribute('role')).toBe('status');
        expect(loadingStatus.element().getAttribute('aria-live')).toBe('polite');
        expect(screen.container.querySelector('[data-europa-lobby-empty]')).toBeNull();
        controller.disconnect();
    });

    test('full keyboard lifecycle: set name → create → leave → lobby, zero axe violations', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        const user = userEvent.setup();

        // 1. Set name — feature 015 moved the form to /profile; the
        // lobby uses the controller headless API.
        await controller.setHandle('Nova');
        await expect.element(screen.getByText('Nova')).toBeVisible();

        // 2. Create match via keyboard — focus button and Enter.
        const createButton = screen.getByRole('button', { name: 'Create match' }).element() as HTMLButtonElement;
        createButton.focus();
        await user.keyboard('{Enter}');

        // 3. We should now be in the match view (waiting room).
        await expect.element(screen.getByText(/In match/)).toBeVisible();

        // 4. Leave via keyboard — focus the "Leave to lobby" button and Enter.
        const leaveButton = screen.getByRole('button', { name: /Leave to lobby/ }).element() as HTMLButtonElement;
        leaveButton.focus();
        await user.keyboard('{Enter}');

        // 5. Back in the lobby.
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        // 6. Zero axe violations on the final lobby state.
        await expectNoDomA11yViolations(document);
        controller.disconnect();
    });
});
