/**
 * Lobby landing component SMOKE tests — feature 010 (T-015).
 *
 * Minimal render-level verification that the new landing surface
 * mounts and reflects the store-derived states correctly. This is
 * deliberately NOT the comprehensive suite — identity persistence,
 * validation flows, focus/announcement audits, keyboard-only use, and
 * the no-ID rendering scan are T-018's contract. Coverage here:
 *
 *   - unnamed visitor: identity form + disabled create form;
 *   - named visitor: <bdi>-wrapped handle + rename affordance;
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
import { createLobbyController, type LobbyTransport } from '../../../src/state/lobby-controller';
import { INITIAL_LOBBY_STATE } from '../../../src/state/lobby-reducer';
import type { LobbyState } from '../../../src/state/lobby-state';
import type { MatchId as ConsoleMatchId } from '../../../src/state/types';
import { LobbyLanding } from '../../../src/ui/lobby-landing';
import { WAITING_FOR_OPPONENT_MESSAGE } from '../../../src/ui/waiting-overlay';
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
    onSubmitHandle: (): void => undefined,
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
    test('unnamed visitor sees the naming form and a disabled create form', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'unnamed', handle: null });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();
        await expect.element(screen.getByLabelText('Display name')).toBeVisible();
        // Naming is available immediately; hosting waits for a handle.
        await expect.element(screen.getByRole('button', { name: 'Set name' })).toBeEnabled();
        await expect.element(screen.getByRole('button', { name: 'Create match' })).toBeDisabled();
    });

    test('named visitor sees their handle inside a bdi and a rename form', async () => {
        const state = stateOf({
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
            snapshot: snapshotOf([]),
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);
        const handle = screen.getByText('Nova');
        await expect.element(handle).toBeVisible();
        // Wave-4 invariant: hostile-but-valid handles render inside <bdi>.
        expect(handle.element().tagName).toBe('BDI');
        await expect.element(screen.getByLabelText('Change name')).toBeVisible();
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
            .element(screen.getByRole('button', { name: /Join match — Waiting for players, 1 of 2 seats filled/ }))
            .toBeVisible();
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
        expect(screen.getByRole('button', { name: /^Join match/ }).elements()).toHaveLength(0);
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
        expect(screen.getByRole('button', { name: /^Join match/ }).elements()).toHaveLength(0);
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
        const retry = screen.getByRole('button', { name: 'Retry connection' });
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
        await screen.getByRole('button', { name: 'Acknowledge' }).click();
        expect(onAcknowledgeSuperseded.mock.calls.length).toBe(1);
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
        const controller = createLobbyController({
            transport: new SmokeTransport(),
            url: 'ws://localhost:8080',
        });
        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);

        // Lobby first (initial load never teleports into a match).
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        // A successful join flips the gate to the match context — but
        // the match is still WAITING (no wire channel pre-auto-start),
        // so the waiting-room plate shows instead of the console.
        await controller.joinMatch(MATCH_A);
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        await expect.element(screen.getByRole('main').getByText(WAITING_FOR_OPPONENT_MESSAGE)).toBeVisible();

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
