/**
 * Lobby runtime — feature 010 (T-015).
 *
 * The DEFAULT application entry (mounted by `main.tsx` for every page
 * load that is not a direct `?live`/`?e2e` route): boots the lobby
 * transport + controller once per page, renders the landing view while
 * `viewMode === 'lobby'`, and — after a seat-granting action succeeds
 * — hands off to a match context (`viewMode === 'match'`) that ends in
 * the EXISTING match console, unchanged.
 *
 * Match-leg handoff (plan §2 "one presence per connection" split): the
 * LOBBY connection stays open the whole time (identity, snapshots,
 * leave); gameplay rides a SECOND socket via the existing production
 * chain — `createWsMatchClient` → `createConsoleClient` → order bridge
 * → console store → {@link App} — exactly the integration-wave
 * `live-runtime` recipe. Timing follows the wire's registration rule:
 * the matchmaker registers a match with the networking server only at
 * AUTO-START, so a player leg attaches when the lobby snapshot flips
 * the target row to `'in_progress'` — until then the visitor sees the
 * waiting-room plate (US3 AC-1). The seat reserved through the lobby
 * is claimed by the tokenless wire join (first seat with no live
 * connection). Leaving (`lobbyLeave`) flips the view back and tears
 * the leg down; the identity survives for the next round.
 *
 * Spectator legs (v1 scope note): the console has no spectator
 * rendering yet — the adapter hardcodes `role: 'player'` (feature-005
 * contract) and the reducer has no spectator event (documented in
 * `net/envelope-to-event.ts`). T-015 therefore renders a READ-ONLY
 * plate for spectators (no board, no order surface of any kind) —
 * honest and safe (zero order paths, FR-012/SC-005) rather than a
 * mislabeled player board. The full-visibility spectator board lands
 * with the seat-label / E2E waves (T-016/T-019), which own
 * player/spectator UI.
 *
 * PRIVACY (binding): this module handles only sanitized
 * {@link LobbyState} plus the display handle it deliberately copies
 * into the match join's `displayName` (FR-019 — the handle FOLLOWS
 * the player into the match). The opaque guest id never appears here:
 * no DOM text, no URL material, no log lines (zero log sites).
 *
 * Focus management: each view focuses its heading on ENTRY, but never
 * on initial page load (browser convention — the first view skips the
 * focus steal; every subsequent swap takes it, WCAG 2.4.3).
 */

import type { JSX } from 'react';
import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import { LiveRegionAnnouncer } from '../a11y/live-region';
import { createConsoleClient } from '../net/client';
import { createWsLobbyClient } from '../net/ws-lobby-client';
import { createWsMatchClient } from '../net/ws-match-client';
import { App } from '../render/App';
import { ErrorBoundary } from '../render/ErrorBoundary';
import { createLobbyController, type LobbyCommandResult, type LobbyController } from '../state/lobby-controller';
import type { LobbyActionError } from '../state/lobby-state';
import { resolveLobbyServerUrl } from '../state/lobby-view';
import { createOrderBridge } from '../state/order-actions';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import { type ConsoleStore, createConsoleStore } from '../state/store';
import type { MatchId, ReducerEffect } from '../state/types';
import { buildCreateSettings, type LobbyCreateFormValues } from '../ui/lobby-create-form';
import { LobbyLanding } from '../ui/lobby-landing';
import { WAITING_FOR_OPPONENT_MESSAGE } from '../ui/waiting-overlay';

// ----------------------------------------------------------------------------
// Mount entry
// ----------------------------------------------------------------------------

/**
 * Mount the public-lobby runtime into `root`.
 *
 * The transport/controller pair lives OUTSIDE React (page lifetime —
 * same discipline as `live-runtime`): no dispose-on-unmount race with
 * StrictMode's simulated remounts, and `connect()`'s own
 * already-establishing guard makes double invocation harmless.
 *
 * @param root The DOM mount node (index.html's `#root`).
 */
export function mountLobbyRuntime(root: HTMLElement): void {
    const wsUrl = resolveLobbyServerUrl(window.location.search, window.location);
    const transport = createWsLobbyClient({});
    const controller = createLobbyController({ transport, url: wsUrl });
    void controller.connect();
    createRoot(root).render(
        <StrictMode>
            <ErrorBoundary>
                <LobbyRoot controller={controller} wsUrl={wsUrl} />
            </ErrorBoundary>
        </StrictMode>,
    );
}

// ----------------------------------------------------------------------------
// Root component: announcer + view gate + command wrappers
// ----------------------------------------------------------------------------

/** Which match leg to attach when the view enters `'match'`. */
interface LegIntent {
    /** Target match; `null` for the create flow (snapshot pins it). */
    readonly matchId: MatchId | null;
    /** Wire role for the leg's join. */
    readonly role: 'player' | 'spectator';
}

/** Props for {@link LobbyRoot}. */
export interface LobbyRootProps {
    /** The page-lifetime lobby controller. */
    readonly controller: LobbyController;
    /** Resolved lobby/match server URL (see `resolveLobbyServerUrl`). */
    readonly wsUrl: string;
}

/**
 * The application root: shared announcer mount, command wrappers with
 * outcome announcements, and the lobby/match view gate. Exported for
 * component tests (the mount entry wires it identically).
 */
export function LobbyRoot({ controller, wsUrl }: LobbyRootProps): JSX.Element {
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);

    // Shared hidden live regions (App.tsx pattern). Runtime-owned so
    // announcements SURVIVE the lobby⇄match view swap.
    const liveHostRef = useRef<HTMLDivElement | null>(null);
    const [announcer, setAnnouncer] = useState<LiveRegionAnnouncer | null>(null);
    useEffect(() => {
        const host = liveHostRef.current;
        if (host !== null) {
            const instance = new LiveRegionAnnouncer(host);
            setAnnouncer(instance);
            return () => {
                instance.clear();
                setAnnouncer(null);
            };
        }
        return undefined;
    }, []);

    // Focus hand-off bookkeeping: count view-mode switches so views
    // know they are an ENTRY (focus heading) vs initial load (don't).
    const [viewSwitches, setViewSwitches] = useState(0);
    const prevViewModeRef = useRef(state.viewMode);
    useEffect(() => {
        if (prevViewModeRef.current !== state.viewMode) {
            prevViewModeRef.current = state.viewMode;
            setViewSwitches((count) => count + 1);
        }
    }, [state.viewMode]);

    // The pending/current match-leg intent (render-phase ref holding
    // plain data — no I/O during render, App's MapCanvas pattern).
    const legIntentRef = useRef<LegIntent | null>(null);

    /** Announce a seat-grant outcome on success only — failures render
     * as role="alert" nodes at their source and announce themselves. */
    function announceSeatOutcome(result: LobbyCommandResult, successMessage: string): void {
        if (result.ok && announcer !== null) {
            announcer.announce(successMessage, 'polite');
        }
    }

    function submitHandle(raw: string): void {
        void controller.setHandle(raw);
    }

    function createMatch(values: LobbyCreateFormValues): void {
        legIntentRef.current = { matchId: null, role: 'player' };
        void controller.createMatch(buildCreateSettings(values)).then((result) => {
            announceSeatOutcome(result, 'Match created — entering the waiting room.');
        });
    }

    function joinMatch(matchId: MatchId): void {
        legIntentRef.current = { matchId, role: 'player' };
        void controller.joinMatch(matchId).then((result) => {
            announceSeatOutcome(result, 'Joined — entering the match.');
        });
    }

    function spectateMatch(matchId: MatchId): void {
        legIntentRef.current = { matchId, role: 'spectator' };
        void controller.spectateMatch(matchId).then((result) => {
            announceSeatOutcome(result, 'Spectating — attaching read-only.');
        });
    }

    function leaveMatch(): void {
        void controller.leaveMatch().then((result) => {
            if (result.ok) {
                legIntentRef.current = null;
                announcer?.announce('Returned to the lobby.', 'polite');
            }
        });
    }

    // -- View gate -----------------------------------------------------

    if (state.viewMode === 'match') {
        const intent = legIntentRef.current ?? { matchId: state.activeMatchId, role: 'player' as const };
        const matchId = intent.matchId ?? state.activeMatchId;
        // Auto-start detector: the target row's lobby status is the
        // single source of truth for "registered with the wire server"
        // (see MatchLegHost's JSDoc). A missing row reads as not
        // started — the plate + Leave escape hatch cover the edge.
        const matchStarted =
            matchId !== null &&
            (state.snapshot?.entries ?? []).some(
                (entry) => entry.matchId === matchId && entry.status === 'in_progress',
            );
        return (
            <MatchLegHost
                key={matchId ?? 'pending'}
                wsUrl={wsUrl}
                matchId={matchId}
                role={intent.role}
                displayName={state.handle ?? 'Player'}
                matchStarted={matchStarted}
                announcer={announcer ?? undefined}
                leaveError={state.actions.leaveMatch.error}
                leaving={state.actions.leaveMatch.phase === 'loading'}
                onLeave={leaveMatch}
            />
        );
    }

    return (
        <LobbyLanding
            state={state}
            announcer={announcer ?? undefined}
            focusHeading={viewSwitches > 0}
            onSubmitHandle={submitHandle}
            onCreate={createMatch}
            onJoin={joinMatch}
            onSpectate={spectateMatch}
            onRetry={() => {
                void controller.retry();
            }}
            onAcknowledgeSuperseded={() => {
                controller.acknowledgeSuperseded();
            }}
        />
    );
}

// ----------------------------------------------------------------------------
// Match leg: the existing console, entered from the lobby
// ----------------------------------------------------------------------------

/** One attached PLAYER match leg: store + real wire client + bridge. */
interface MatchLeg {
    /** The console store feeding {@link App}. */
    readonly store: ConsoleStore;
    /** Connect + run the join handshake (async; UI shows connecting). */
    boot(): Promise<void>;
    /** Tear the wire connection down (idempotent). */
    dispose(): void;
}

/** Arguments for {@link createMatchLeg}. */
interface MatchLegArgs {
    /** WebSocket URL of the match server (same host as the lobby). */
    readonly wsUrl: string;
    readonly matchId: MatchId;
    /** Display name for the seat claim — the accepted handle (FR-019). */
    readonly displayName: string;
}

/**
 * Build one PLAYER match leg with the production wiring proven by the
 * integration wave's `live-runtime`: forwarding-slot circularity
 * (store ↔ bridge), real browser WebSocket client, transport-loss
 * translation into the reducer's reconnecting banner. (Spectator legs
 * never construct one — see the module scope note.)
 */
function createMatchLeg(args: MatchLegArgs): MatchLeg {
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore(INITIAL_CONSOLE_STATE, (effect) => {
        forward?.(effect);
    });
    store.dispatch({ kind: 'connecting', matchId: args.matchId });

    const wsClient = createWsMatchClient({ verboseLogging: false });
    const client = createConsoleClient(
        {
            url: args.wsUrl,
            displayName: args.displayName,
            matchId: args.matchId,
        },
        { matchClientFactory: () => wsClient },
    );
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => {
        bridge.handleEffect(effect);
    };

    let lastConnection = wsClient.state().connection;
    wsClient.onConnectionChanged((current) => {
        if (current === 'disconnected' && (lastConnection === 'joined' || lastConnection === 'rejoined')) {
            store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
        }
        lastConnection = current;
    });

    return {
        store,
        async boot(): Promise<void> {
            try {
                await client.connect();
                await client.joinMatch();
            } catch {
                // Join rejections (seat gone between list and claim) land
                // in the reducer's error path / banner; the lobby stays
                // reachable via Leave. Never throw into React.
            }
        },
        dispose(): void {
            wsClient.disconnect();
        },
    };
}

/** Props for {@link MatchLegHost}. */
interface MatchLegHostProps {
    /** WebSocket URL of the match server. */
    readonly wsUrl: string;
    /**
     * Target match; `null` only in the create flow's brief window
     * before the next snapshot pins `activeMatchId`.
     */
    readonly matchId: MatchId | null;
    readonly role: 'player' | 'spectator';
    /** Accepted handle — the seat claim's display name (FR-019). */
    readonly displayName: string;
    /**
     * Whether the lobby snapshot reports the target row `'in_progress'`
     * — i.e. the matchmaker has auto-started and REGISTERED the match
     * with the wire server, so a player leg can claim its seat.
     */
    readonly matchStarted: boolean;
    /** Shared runtime announcer (survives view swaps). */
    readonly announcer?: LiveRegionAnnouncer | undefined;
    /** The leave action's error slot (rendered beside the button). */
    readonly leaveError: LobbyActionError | null;
    /** Whether the leave action is in flight. */
    readonly leaving: boolean;
    /** Release the seat/association and return to the lobby. */
    readonly onLeave: () => void;
}

/**
 * Host one match context: slim lobby chrome (leave control) around
 * the EXISTING game UI.
 *
 * Handoff timing (wire reality, proven by the T-013 integration
 * suite): the matchmaker registers a match with the networking server
 * only at AUTO-START (`registerMatch` inside `autoStart`), so a
 * WAITING match has no wire channel — an early join fails with
 * `match_not_found`. A player leg therefore attaches only once
 * {@link MatchLegHostProps.matchStarted} flips true; until then the
 * visitor sits in the accessible waiting-room plate (US3 AC-1). The
 * `transition: 'match'` classification (join filled the final seat)
 * arrives together with that flip, so one predicate covers both.
 */
function MatchLegHost({
    wsUrl,
    matchId,
    role,
    displayName,
    matchStarted,
    announcer,
    leaveError,
    leaving,
    onLeave,
}: MatchLegHostProps): JSX.Element {
    const headingRef = useRef<HTMLHeadingElement | null>(null);

    // Every mount of this host IS a view entry (initial load always
    // lands in the lobby), so taking focus is correct here.
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    // One PLAYER leg per mount, built only when the match is actually
    // registered (see the JSDoc); keyed by matchId upstream so
    // switching matches rebuilds cleanly. Construction does no I/O
    // (App's MapCanvas ref pattern); boot/dispose ride the effect.
    const legRef = useRef<MatchLeg | null>(null);
    if (legRef.current === null && role === 'player' && matchId !== null && matchStarted) {
        legRef.current = createMatchLeg({ wsUrl, matchId, displayName });
    }
    const leg = legRef.current;
    useEffect(() => {
        if (leg !== null) {
            void leg.boot();
        }
        return () => {
            leg?.dispose();
        };
    }, [leg]);

    return (
        <div className="europa-lobby-match">
            <a id="skip-link" className="skip-link" href="#main">
                Skip to main content
            </a>
            <section className="europa-lobby-match__bar" aria-label="Lobby controls" data-europa-match-chrome="true">
                <h1 ref={headingRef} tabIndex={-1} className="europa-lobby-match__title europa-focus-ring">
                    {role === 'spectator' ? 'Spectating' : 'In match'}{' '}
                    {matchId === null ? '— resolving…' : `(${matchId.slice(0, 8)}…)`}
                </h1>
                <button
                    type="button"
                    className="europa-lobby__button europa-focus-ring"
                    disabled={leaving}
                    onClick={onLeave}
                    data-europa-leave="true"
                >
                    {leaving ? 'Leaving…' : 'Leave to lobby'}
                </button>
                {leaveError !== null ? (
                    <p className="europa-lobby__error" role="alert">
                        {leaveError.message}
                    </p>
                ) : null}
            </section>
            {leg !== null ? (
                <App store={leg.store} />
            ) : (
                <main id="main" className="europa-lobby europa-lobby-match__placeholder">
                    {/* Pre-start window (players) or v1 spectator scope:
            informational plates — no board, no order surface. Each
            announces once politely through the shared channel. */}
                    {role === 'spectator' ? (
                        <SpectatorPlate matchId={matchId} announcer={announcer} />
                    ) : (
                        <PreStartPlate matchId={matchId} announcer={announcer} />
                    )}
                </main>
            )}
        </div>
    );
}

/** Props for {@link SpectatorPlate}. */
interface SpectatorPlateProps {
    readonly matchId: MatchId | null;
    readonly announcer?: LiveRegionAnnouncer | undefined;
}

/**
 * The read-only spectator plate (v1 scope — module note). Announces
 * once per appearance (WaitingOverlay's guarded-effect pattern).
 */
function SpectatorPlate({ matchId, announcer }: SpectatorPlateProps): JSX.Element {
    const lastAnnouncedRef = useRef(false);
    useEffect(() => {
        if (announcer !== undefined && !lastAnnouncedRef.current) {
            announcer.announce('Spectator mode is read-only.', 'polite');
            lastAnnouncedRef.current = true;
        }
    }, [announcer]);
    return (
        <div className="europa-waiting__plate" data-europa-spectator-plate="true">
            <p className="europa-waiting__text">
                {matchId === null
                    ? 'Attaching to the match…'
                    : `Read-only spectator view of match ${matchId.slice(0, 8)}…`}
            </p>
            <p className="europa-lobby__status-line">The full spectator board arrives with the seat-label wave.</p>
        </div>
    );
}

/** Props for {@link PreStartPlate}. */
interface PreStartPlateProps {
    readonly matchId: MatchId | null;
    readonly announcer?: LiveRegionAnnouncer | undefined;
}

/**
 * The waiting-room plate between a seat grant and auto-start. Reuses
 * the shipped waiting-room message (the same words the match-view
 * overlay shows) so waiting feels identical wherever it happens.
 */
function PreStartPlate({ matchId, announcer }: PreStartPlateProps): JSX.Element {
    const lastAnnouncedRef = useRef(false);
    useEffect(() => {
        if (announcer !== undefined && !lastAnnouncedRef.current) {
            announcer.announce(WAITING_FOR_OPPONENT_MESSAGE, 'polite');
            lastAnnouncedRef.current = true;
        }
    }, [announcer]);
    return (
        <div className="europa-waiting__plate" data-europa-prestart-plate="true">
            <p className="europa-waiting__text">{WAITING_FOR_OPPONENT_MESSAGE}</p>
            <p className="europa-lobby__status-line">
                {matchId === null
                    ? 'Reserving your seat…'
                    : `Seated in match ${matchId.slice(0, 8)}… — starting when full.`}
            </p>
        </div>
    );
}
