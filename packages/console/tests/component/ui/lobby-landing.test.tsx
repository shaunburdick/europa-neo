/**
 * Lobby landing component SMOKE tests — feature 010 (T-015) + feature 015 (T-011).
 *
 * Minimal render-level verification that the new landing surface
 * mounts and reflects the store-derived states correctly. This is
 * deliberately NOT the comprehensive suite — identity persistence,
 * validation flows, focus/announcement audits, keyboard-only use, and
 * handle-preference and safe identity-correlation checks are T-018's contract.
 * Coverage here:
 *
 *   - unnamed visitor: compact identity display ("Choose a name" link) + disabled create form;
 *   - named visitor: identity card with handle + "Manage profile" link;
 *   - restoring visitor: "Restoring…" status indicator;
 *   - no input form present in the lobby (identity form moved to /profile);
 *   - row semantics: Join (open waiting) / Full / Spectate
 *     (in progress) / "Your match" badge without actions;
 *   - empty state message;
 *   - failure banner with retry wiring;
 *   - superseded notice with acknowledgement wiring;
 *   - LobbyRoot gate: lobby view first, match chrome after a join.
 */

import type { IdentityState, LobbyRevision, LobbySnapshot, MatchId } from '@europa/matchmaking';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { LobbyRoot } from '../../../src/internal/lobby-runtime';
import type { LobbyConnectionState, LobbyErrorReport, WsLobbyClientState } from '../../../src/net/ws-lobby-client';
import { formatWaitingMessage } from '../../../src/state/awaiting-start';
import { createLobbyController, type LobbyTransport } from '../../../src/state/lobby-controller';
import { INITIAL_LOBBY_STATE } from '../../../src/state/lobby-reducer';
import type { LobbyState } from '../../../src/state/lobby-state';
import type { MatchId as ConsoleMatchId } from '../../../src/state/types';
import { LobbyLanding } from '../../../src/ui/lobby-landing';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const MATCH_A = 'aaaaaaaa-0000-4000-8000-000000000000' as MatchId;
const MATCH_B = 'bbbbbbbb-0000-4000-8000-000000000000' as MatchId;

function revisionOf(value: number): LobbyRevision {
    return value as LobbyRevision;
}

function snapshotOf(entries: LobbySnapshot['entries'], activeMatchId: MatchId | null = null): LobbySnapshot {
    return { revision: revisionOf(1), entries, activeMatchId };
}

/** Seed a lobby state with overridable fields on top of the initial value. */
function stateOf(overrides: Partial<LobbyState> = {}): LobbyState {
    return { ...INITIAL_LOBBY_STATE, ...overrides };
}

/** No-op callbacks for direct Landing renders. */
const noopCallbacks = {
    onCreate: (): void => undefined,
    onJoin: (): void => undefined,
    onSpectate: (): void => undefined,
    onRetry: (): void => undefined,
    onAcknowledgeSuperseded: (): void => undefined,
};

// ----------------------------------------------------------------------------
// Landing renders
// ----------------------------------------------------------------------------

describe('LobbyLanding (smoke)', () => {
    test('unnamed visitor sees the compact identity display and a disabled create form', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'unnamed', handle: null });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();
        // Compact identity: "Choose a name" text and link to /profile.
        const chooseNameLink = screen.getByRole('link', { name: 'Choose a name' });
        await expect.element(chooseNameLink).toBeVisible();
        expect(chooseNameLink.element().getAttribute('href')).toBe('/profile');
        // No text input (identity form) in the lobby — identity form lives on /profile.
        expect(screen.container.querySelector('input[type="text"]')).toBeNull();
        // Naming is available via link; hosting waits for a handle.
        await expect.element(screen.getByRole('button', { name: 'Create match' })).toBeDisabled();
    });

    test('named visitor sees their handle in the identity card and a Manage profile link', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        // Identity card: name displayed directly.
        await expect.element(screen.getByText('Nova')).toBeVisible();
        // "Manage profile" link points to /profile.
        await expect.element(screen.getByRole('link', { name: 'Manage profile' })).toBeVisible();
        expect(screen.getByRole('link', { name: 'Manage profile' }).element().getAttribute('href')).toBe('/profile');
        // No text input (identity form) in the lobby.
        expect(screen.container.querySelector('input[type="text"]')).toBeNull();
        await expect.element(screen.getByRole('button', { name: 'Create match' })).toBeEnabled();
    });

    test('rows expose Join / Full per waiting semantics', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([
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
                    status: 'waiting',
                    boardSize: 32,
                    tickIntervalMs: 250,
                },
            ]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        await expect
            .element(screen.getByRole('button', { name: 'Join match — Waiting for players, 1 of 2 seats filled' }))
            .toBeVisible();
        expect(screen.container.querySelector('[data-europa-lobby-loading]')).toBeNull();
        // aria-busy is on the match list section (not the heading's parent wrapper).
        const matchSection = screen.getByRole('heading', { name: 'Public matches' }).element().closest('section');
        expect(matchSection?.getAttribute('aria-busy')).toBe('false');
        // Full waiting match: no seat to advertise (FR-007).
        await expect.element(screen.getByText('Full')).toBeVisible();
    });

    test('in-progress rows offer Spectate only', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([
                {
                    matchId: MATCH_A,
                    seatsFilled: 2,
                    capacity: 2,
                    status: 'in_progress',
                    boardSize: 32,
                    tickIntervalMs: 250,
                },
            ]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        await expect.element(screen.getByRole('button', { name: /Spectate match/ })).toBeVisible();
        const joinButtons = [...screen.container.querySelectorAll('.europa-button')].filter((el) =>
            /^Join match/.test(el.getAttribute('aria-label') ?? ''),
        );
        expect(joinButtons).toHaveLength(0);
    });

    test("the viewer's own active match shows a badge and no actions", async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            activeMatchId: MATCH_A as ConsoleMatchId,
            snapshot: snapshotOf(
                [
                    {
                        matchId: MATCH_A,
                        seatsFilled: 1,
                        capacity: 2,
                        status: 'waiting',
                        boardSize: 32,
                        tickIntervalMs: 250,
                    },
                ],
                MATCH_A as ConsoleMatchId,
            ),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        // Exact match: the active-note paragraph also CONTAINS the phrase.
        await expect.element(screen.getByText('Your match', { exact: true })).toBeVisible();
        const joinButtons = [...screen.container.querySelectorAll('.europa-button')].filter((el) =>
            /^Join match/.test(el.getAttribute('aria-label') ?? ''),
        );
        expect(joinButtons).toHaveLength(0);
        await expect.element(screen.getByText(/You have an active match/)).toBeVisible();
    });

    test('empty list renders the explicit empty state', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        await expect.element(screen.getByText(/No public matches right now/)).toBeVisible();
        expect(screen.container.querySelector('[data-europa-lobby-loading]')).toBeNull();
    });

    test('pre-baseline list renders a loading status instead of the empty state', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: null,
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const loadingStatus = screen.getByText('Loading public matches…');
        await expect.element(loadingStatus).toBeVisible();
        expect(loadingStatus.element().getAttribute('role')).toBe('status');
        expect(screen.container.querySelector('[data-europa-lobby-empty]')).toBeNull();
    });

    test('a loaded empty list appears only after the baseline arrives', async () => {
        const loadingState = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: null,
        });
        const screen = await render(<LobbyLanding state={loadingState} focusHeading={false} {...noopCallbacks} />);

        await expect.element(screen.getByText('Loading public matches…')).toBeVisible();

        const loadedState = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([]),
        });
        await screen.rerender(<LobbyLanding state={loadedState} focusHeading={false} {...noopCallbacks} />);

        await expect.element(screen.getByText(/No public matches right now/)).toBeVisible();
        expect(screen.container.querySelector('[data-europa-lobby-loading]')).toBeNull();
    });

    test('terminal failure renders the banner and wires Retry', async () => {
        const onRetry = vi.fn();
        const state = stateOf({
            connection: 'failed',
            failure: {
                source: 'connection',
                code: 'connection_failed',
                message: 'Lobby connection failed.',
                detail: null,
            },
        });
        const screen = await render(
            <LobbyLanding state={state} focusHeading={false} {...noopCallbacks} onRetry={onRetry} />,
        );
        const retry = screen.getByRole('button', { name: 'Retry connection' }).element() as HTMLButtonElement;
        await retry.click();
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('supersession renders the notice and wires acknowledgement', async () => {
        const onAcknowledgeSuperseded = vi.fn();
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'restoring',
            everNamed: true,
            superseded: true,
        });
        const screen = await render(
            <LobbyLanding
                state={state}
                focusHeading={false}
                {...noopCallbacks}
                onAcknowledgeSuperseded={onAcknowledgeSuperseded}
            />,
        );
        await expect.element(screen.getByText(/session moved somewhere else/i)).toBeVisible();
        const ackBtn = screen.getByRole('button', { name: 'Acknowledge' }).element() as HTMLButtonElement;
        await ackBtn.click();
        expect(onAcknowledgeSuperseded.mock.calls.length).toBe(1);
    });

    test('restoring visitor sees the "Restoring…" status indicator', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'restoring',
            handle: null,
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        await expect.element(screen.getByText('Restoring…')).toBeVisible();
        // No link shown while restoring.
        const links = [...screen.container.querySelectorAll('a')].filter(
            (el) => el.getAttribute('href') === '/profile',
        );
        expect(links).toHaveLength(0);
    });

    test('clicking "Manage profile" navigates to /profile via pushState', async () => {
        const pushState = vi.spyOn(window.history, 'pushState');
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        const link = screen.getByRole('link', { name: 'Manage profile' }).element() as HTMLAnchorElement;
        await link.click();
        expect(pushState).toHaveBeenCalledTimes(1);
        expect(pushState).toHaveBeenCalledWith(window.history.state, '', '/profile');
    });

    test('no identity input form is present in the lobby landing', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        // The identity text input has been moved to /profile; only radio inputs
        // (player count) remain in the create form.
        expect(screen.container.querySelector('input[type="text"]')).toBeNull();
    });
});

// ----------------------------------------------------------------------------
// Root gate over the real controller
// ----------------------------------------------------------------------------

type StateHandler = (connection: LobbyConnectionState) => void;
type IdentityHandler = (identity: IdentityState) => void;
type SnapshotHandler = (snapshot: LobbySnapshot) => void;
type ErrorHandler = (report: LobbyErrorReport) => void;

/** Minimal structural transport double (controller-test parity). */
class SmokeTransport implements LobbyTransport {
    connection: LobbyConnectionState = 'idle';

    private readonly stateHandlers = new Set<StateHandler>();
    private readonly identityHandlers = new Set<IdentityHandler>();
    private readonly snapshotHandlers = new Set<SnapshotHandler>();
    private readonly errorHandlers = new Set<ErrorHandler>();

    connect(): Promise<void> {
        this.connection = 'ready';
        this.emitState();
        return Promise.resolve();
    }

    disconnect(): void {
        this.connection = 'closed';
        this.emitState();
    }

    forgetIdentity(): void {
        // unused in smoke flows
    }

    setHandle(handle: string): Promise<IdentityState> {
        for (const handler of this.identityHandlers) {
            handler({ handle, hasIdentity: true });
        }
        return Promise.resolve({ handle, hasIdentity: true });
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
            handle: null,
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

    /** Test helper: push a lobby snapshot to all registered handlers. */
    pushSnapshot(snapshot: LobbySnapshot): void {
        for (const handler of this.snapshotHandlers) {
            handler(snapshot);
        }
    }

    onError(handler: ErrorHandler): () => void {
        this.errorHandlers.add(handler);
        return () => {
            this.errorHandlers.delete(handler);
        };
    }

    private emitState(): void {
        for (const handler of this.stateHandlers) {
            handler(this.connection);
        }
    }
}

describe('LobbyRoot view gate (smoke)', () => {
    test('lobby first; a seat grant shows the waiting room; auto-start attaches the console', async () => {
        // The profile route view gate (feature 015) renders ProfileView when
        // window.location.pathname === '/profile'. In Vitest browser mode the
        // page URL may sit on /profile, so we pushState to / first to ensure
        // the lobby gate falls through to LobbyLanding.
        window.history.pushState(window.history.state, '', '/');

        const transport = new SmokeTransport();
        const controller = createLobbyController({
            transport,
            url: 'ws://localhost:8080',
        });
        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);

        // Lobby first (initial load never teleports into a match).
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        // A successful join flips the gate to the match context — but
        // the match is still WAITING (no wire channel pre-auto-start),
        // so the waiting-room plate shows instead of the console.
        await controller.joinMatch(MATCH_A);
        // The lobby snapshot pins the row: a 2-player match with one seat
        // filled → N-aware "Waiting for 1 more player… (1/2)".
        transport.pushSnapshot(
            snapshotOf(
                [
                    {
                        matchId: MATCH_A,
                        seatsFilled: 1,
                        capacity: 2,
                        status: 'waiting',
                        boardSize: 32,
                        tickIntervalMs: 250,
                    },
                ],
                MATCH_A,
            ),
        );
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        await expect.element(screen.getByRole('main').getByText(formatWaitingMessage(1, 2))).toBeVisible();

        // Auto-start: the lobby snapshot flips the row to in_progress…
        controller.store.dispatch({
            kind: 'lobbySnapshotApplied',
            snapshot: {
                revision: revisionOf(1),
                entries: [
                    {
                        matchId: MATCH_A,
                        seatsFilled: 2,
                        capacity: 2,
                        status: 'in_progress',
                        boardSize: 32,
                        tickIntervalMs: 250,
                    },
                ],
                activeMatchId: MATCH_A,
            },
        });
        // …and the existing game UI mounts (board canvas present).
        await expect.element(screen.getByRole('img', { name: 'Game board visual' })).toBeVisible();

        // Leave returns to the lobby with the identity layer intact.
        await controller.leaveMatch();
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();
        controller.disconnect();
    });
});
