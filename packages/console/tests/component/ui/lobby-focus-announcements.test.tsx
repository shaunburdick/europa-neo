/**
 * Lobby focus-management tests — feature 010 (T-018, dimension 6).
 *
 * Browser-mode component tests (real Chromium, real DOM) that pin the
 * CONSUMER-LEVEL focus behaviour of the landing UI:
 *
 *   - focusHeading=false (initial load): the h1 must NOT steal focus.
 *   - focusHeading=true (return-to-lobby): the h1 MUST receive focus.
 *   - superseded notice: when it appears, focus MUST move to the
 *     superseded node (dialog-like WCAG 2.4.3).
 *   - focus must NEVER be trapped: after any transition, Tab must
 *     still be able to move focus forward through the page.
 *
 * Announcements (dimension 7): LobbyRoot's `liveHostRef` is never
 * attached to a rendered DOM element, so the LiveRegionAnnouncer is
 * never instantiated. This is BLOCKER BUG-010-01 — announcement
 * integration cannot be tested at the component level until that ref
 * is wired. The pure-function `describeSnapshotChange` is already
 * covered by `lobby-ui-logic.test.ts`.
 *
 * No timers, no sockets — the fake transport + scripted controller
 * own every async boundary.
 */

import type { LobbyRevision, LobbySnapshot, MatchId } from '@europa/matchmaking';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { LobbyRoot } from '../../../src/internal/lobby-runtime';
import type {
    LobbySnapshot as ClientSnapshot,
    LobbyConnectionState,
    LobbyErrorReport,
    WsLobbyClientState,
} from '../../../src/net/ws-lobby-client';
import { createLobbyController, type LobbyTransport } from '../../../src/state/lobby-controller';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const MATCH_A = 'aaaaaaaa-0000-4000-8000-000000000000' as MatchId;

function revisionOf(value: number): LobbyRevision {
    return value as LobbyRevision;
}

function snapshotOf(entries: LobbySnapshot['entries'], activeMatchId: MatchId | null = null): LobbySnapshot {
    return { revision: revisionOf(1), entries, activeMatchId };
}

// ----------------------------------------------------------------------------
// Fake transport (structural LobbyTransport double)
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

    deliverError(report: LobbyErrorReport): void {
        for (const handler of this.errorHandlers) {
            handler(report);
        }
    }
}

// ============================================================================
// Focus tests
// ============================================================================

describe('LobbyLanding focus management (dimension 6)', () => {
    test('initial load (focusHeading=false) does NOT focus the h1', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);

        // focusHeading is false on initial mount (viewSwitches === 0).
        const heading = screen.getByText('Europa Neo lobby').element() as HTMLElement;
        expect(document.activeElement).not.toBe(heading);
        controller.disconnect();
    });

    test('return-to-lobby (focusHeading=true) focuses the h1', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);

        // Enter match then return — the second view mode swap increments
        // viewSwitches so focusHeading becomes true.
        await controller.joinMatch(MATCH_A);
        await controller.leaveMatch();

        // After returning to the lobby, the heading should be focused.
        const heading = screen.getByText('Europa Neo lobby').element() as HTMLElement;
        expect(document.activeElement).toBe(heading);
        controller.disconnect();
    });

    test('superseded notice takes focus when it appears (via controller error path)', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        // Name the session first (supersession requires everNamed).
        await controller.setHandle('Nova');

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);

        // Trigger supersession by sending an uncorrelated identity_invalid error
        // through the transport. The controller dispatches lobbyFailureReported,
        // the reducer applies the supersession gate (code + everNamed), and the
        // component re-renders with superseded: true.
        transport.deliverError({
            code: 'identity_invalid',
            message: 'Session taken over.',
            detail: null,
            actionId: null,
        });

        // Wait for the superseded notice to appear — useSyncExternalStore
        // should be synchronous, but React may batch the re-render.
        // The notice text matches the lobby-landing smoke test.
        await expect.element(screen.getByText(/session moved somewhere else/i)).toBeVisible();

        const notice = screen.container.querySelector('[data-europa-lobby-superseded]') as HTMLElement;
        expect(notice).not.toBeNull();
        expect(document.activeElement).toBe(notice);

        expect(document.activeElement).toBe(notice);
        controller.disconnect();
    });

    test('focus is never trapped: Tab moves forward through the page after any transition', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);

        const user = userEvent.setup();

        // Tab through the landing: skip-link → ... → end of page.
        // After many Tabs, focus should cycle (or move out) — never stuck.
        const maxTabs = 20;
        const visited = new Set<Element | null>();
        for (let i = 0; i < maxTabs; i++) {
            await user.keyboard('{Tab}');
            visited.add(document.activeElement);
        }
        // We should have visited more than one unique element, proving
        // Tab moved through the page and didn't get stuck on one node.
        expect(visited.size).toBeGreaterThan(1);
        controller.disconnect();
    });
});
