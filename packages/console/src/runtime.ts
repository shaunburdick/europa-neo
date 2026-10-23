/**
 * Console runtime — Feature 005 (T086).
 *
 * The glue between reducer, network adapter, input, and renderer
 * (contracts/console-api.ts `ConsoleRuntime` + plan.md "Embedding
 * flow"). One instance per `createConsole` call; owns:
 *
 *   1. the {@link ConsoleStore} (T028) — single source of state,
 *      seeded from `ConsoleConfig.qolSettings` / `displayName`;
 *   2. the network adapter (T029 via `deps.clientFactory`, default
 *      {@link createConsoleClient}) and the order bridge (T056),
 *      which translates inbound envelopes through
 *      `netEventFromEnvelope` (T031) into reducer dispatches;
 *   3. the reducer-effect sink: `sendOrder` → bridge, `announce` →
 *      {@link LiveRegionAnnouncer} (T021), `persistQol` →
 *      `ConsoleConfig.persist`, `playSound` → `deps.soundPlayer`,
 *      plus defensive handling of the never-emitted-in-v1
 *      `showErrorModal` / `scheduleReconnect` kinds;
 *   4. the renderer lifecycle — default mounts the React `App`
 *      (T047) inside an {@link ErrorBoundary}; `deps.rendererFactory`
 *      may substitute a fake in tests;
 *   5. the input lifecycle — v1's pointer/keyboard controllers ship
 *      inside `App` (US2–US5 architecture), so the default
 *      `deps.inputFactory` is a documented no-op; hosts may inject.
 *
 * Deviation from the T086 prose (documented in spec Implementation
 * Notes): there is NO separate rAF paint loop. The shipped render
 * model derives `MapView` synchronously from each committed state
 * (`App` via `useSyncExternalStore`) and paints on commit — a rAF
 * poller would double-paint. Rendering stays exactly-on-state-change.
 *
 * Determinism: the only clock reads are the sanctioned UI boundary
 * (`deps.clock ?? performance.now()`, threaded through dispatch);
 * no randomness anywhere.
 */

import { createElement, type JSX, StrictMode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { LiveRegionAnnouncer } from './a11y/live-region';
import {
    type ConsoleConfig,
    type ConsoleDeps,
    type ConsoleInput,
    type ConsoleRenderer,
    type ConsoleRuntime as ConsoleRuntimeContract,
    type ConsoleSoundPlayer,
    NULL_LOGGER,
} from './contracts/console-api';
import { ControlMappingSession } from './input/control-mapping';
import { ControlMappingProvider } from './input/control-mapping-context';
import { createConsoleClient } from './net/client';
import { App } from './render/App';
import { ErrorBoundary } from './render/ErrorBoundary';
import { createOrderBridge, type OrderBridge } from './state/order-actions';
import { INITIAL_CONSOLE_STATE } from './state/reducer';
import { type ConsoleStore, createConsoleStore } from './state/store';
import type {
    ActionId,
    ConsoleAction,
    ConsoleLogger,
    ConsoleState,
    MatchId,
    Order,
    ReducerEffect,
} from './state/types';

// ----------------------------------------------------------------------------
// Runtime construction arguments
// ----------------------------------------------------------------------------

/** Arguments for the {@link ConsoleRuntime} constructor. */
export interface ConsoleRuntimeArgs {
    /** Host configuration (container-independent parts). */
    readonly config: ConsoleConfig;
    /** Optional test seams; production omits. */
    readonly deps?: ConsoleDeps | undefined;
}

// ----------------------------------------------------------------------------
// Default renderer / input implementations
// ----------------------------------------------------------------------------

/**
 * Internal React shell: binds the live store to {@link App} and
 * bridges the runtime's programmatic surrender requests into the
 * built-in modal (contract `Console.requestSurrender`).
 */
function RuntimeApp(props: { readonly runtime: ConsoleRuntime }): JSX.Element {
    const { runtime } = props;
    const epoch = useSyncExternalStore(runtime.subscribeSurrenderEpoch, runtime.getSurrenderEpoch);
    return createElement(
        ControlMappingProvider,
        { session: runtime.inputMappingSession },
        createElement(App, {
            store: runtime.store,
            surrenderRequestEpoch: epoch,
            onSurrenderRequest: runtime.config.onSurrenderRequest,
        }),
    );
}

/**
 * Built-in renderer: mounts the React `App` tree (StrictMode +
 * {@link ErrorBoundary}) into the host container.
 */
class ReactAppRenderer implements ConsoleRenderer {
    private root: Root | null = null;

    mount(container: HTMLElement, runtime: ConsoleRuntime): void {
        this.root = createRoot(container);
        this.root.render(
            createElement(StrictMode, null, createElement(ErrorBoundary, null, createElement(RuntimeApp, { runtime }))),
        );
    }

    unmount(): void {
        this.root?.unmount();
        this.root = null;
    }
}

/** No-op sound player used when `deps.soundPlayer` is omitted. */
const NOOP_SOUND_PLAYER: ConsoleSoundPlayer = {
    play: () => undefined,
    setMuted: () => undefined,
};

// ----------------------------------------------------------------------------
// The runtime
// ----------------------------------------------------------------------------

/**
 * Concrete console runtime implementing the contractual
 * `ConsoleRuntime` surface (`getState` / `apply` / `subscribe` /
 * `teardown`) plus the mount lifecycle `createConsole` drives.
 * Exported for tests and for hosts that want to embed the runtime
 * without the full `Console` facade.
 */
export class ConsoleRuntime implements ConsoleRuntimeContract {
    /** Host configuration (readable by the built-in renderer shell). */
    readonly config: ConsoleConfig;

    /** The bound Zustand store the renderer subscribes to. */
    readonly store: ConsoleStore;

    /** One non-persistent input configuration per embedding runtime. */
    readonly inputMappingSession: ControlMappingSession;

    private readonly deps: ConsoleDeps;

    private readonly logger: ConsoleLogger;

    private readonly client: ReturnType<typeof createConsoleClient>;

    private readonly bridge: OrderBridge;

    /** Mutable forwarding slot resolving the store↔bridge cycle. */
    private effectSink: ((effect: ReducerEffect) => void) | null = null;

    private announcer: LiveRegionAnnouncer | null = null;

    private announcerHost: HTMLElement | null = null;

    private renderer: ConsoleRenderer | null = null;

    private input: ConsoleInput | null = null;

    private mountedContainer: HTMLElement | null = null;

    private tornDown = false;

    /** Programmatic surrender-modal epoch (bumped per request). */
    private surrenderEpochValue = 0;

    private surrenderEpochListeners = new Set<() => void>();

    constructor(args: ConsoleRuntimeArgs) {
        this.config = args.config;
        this.deps = args.deps ?? {};
        this.logger = args.config.logger ?? NULL_LOGGER;
        this.inputMappingSession = new ControlMappingSession(args.config.inputMapping);

        // Seed the store with host-provided QoL settings + display name
        // (contract: the host passes previously-persisted values back on
        // construction to restore them; the console never touches
        // localStorage itself).
        const initial: ConsoleState = {
            ...INITIAL_CONSOLE_STATE,
            session: {
                ...INITIAL_CONSOLE_STATE.session,
                displayName: args.config.displayName ?? args.config.client.displayName,
            },
            ...(args.config.qolSettings === undefined ? {} : { qol: args.config.qolSettings }),
        };
        this.store = createConsoleStore(initial, (effect) => {
            this.effectSink?.(effect);
        });

        // Network adapter (factory seam defaults to the real adapter,
        // which now defaults to the shipped browser WebSocket client —
        // see src/net/client.ts and src/net/ws-match-client.ts).
        const clientFactory =
            this.deps.clientFactory ??
            ((config: ConsoleConfig['client']) => createConsoleClient(config, { logger: this.logger }));
        this.client = clientFactory(args.config.client);

        // Dispatch → network bridge: subscribes to envelopes at
        // construction so nothing emitted between connect() and joinMatch()
        // is lost (T056).
        this.bridge = createOrderBridge({
            store: this.store,
            client: this.client,
            logger: this.logger,
        });
        this.effectSink = (effect) => this.handleEffect(effect);
    }

    // -- Contractual surface ---------------------------------------------------

    /** Current state snapshot (cheap; the cached immutable value). */
    getState(): ConsoleState {
        return this.store.getState();
    }

    /**
     * Apply an action through the pure reducer, publish the next
     * state, then run the resulting effects. Throws after teardown
     * (the handle is unusable once unmounted — contract).
     */
    apply(action: ConsoleAction): void {
        this.assertUsable();
        this.store.dispatch(action, { nowMs: this.nowMs() });
    }

    /**
     * Subscribe to state changes; returns the unsubscribe function.
     * Read-only: handlers must not mutate the published state.
     */
    subscribe(handler: (state: ConsoleState) => void): () => void {
        return this.store.subscribe(handler);
    }

    /**
     * Tear down everything (renderer, input, bridge, socket, live
     * regions). Idempotent; the runtime is unusable afterwards.
     */
    async teardown(): Promise<void> {
        if (this.tornDown) {
            return;
        }
        this.tornDown = true;
        this.input?.stop();
        this.input?.teardown();
        this.input = null;
        this.renderer?.unmount();
        this.renderer = null;
        this.bridge.dispose();
        this.client.close();
        this.announcer?.clear();
        this.announcerHost?.remove();
        this.announcerHost = null;
        this.announcer = null;
        this.mountedContainer = null;
    }

    // -- Lifecycle driven by createConsole -------------------------------------

    /**
     * Mount into `container`: attach live regions, run the connect →
     * joinMatch handshake (dispatching `connecting` first), then start
     * the renderer + input layer. Idempotent per lifetime; throws
     * SYNCHRONOUSLY if called after teardown (005 FR-030 — a dead
     * handle fails at the call site, never by half-mounting).
     *
     * Connection failures do NOT prevent mounting: the error surfaces
     * through the reducer (`error` NetEvent → FR-008 feedback/banner)
     * so the user sees an honest status instead of a blank page.
     *
     * @param container Host element for the console tree.
     * @returns A promise settling when the console is mounted (or the
     *          handshake has failed softly). Rejects if teardown wins
     *          the race while the handshake is in flight.
     */
    mountInto(container: HTMLElement): Promise<void> {
        this.assertUsable();
        if (this.mountedContainer !== null) {
            return Promise.resolve(); // idempotent double-mount
        }
        this.mountedContainer = container;

        // Live-region announcer for reducer `announce` effects (T021).
        // Own host div so teardown removes exactly what we added.
        const host = container.ownerDocument.createElement('div');
        container.appendChild(host);
        this.announcerHost = host;
        this.announcer = new LiveRegionAnnouncer(host);

        // Handshake. The bridge subscribed at construction, so helloAck /
        // joinAck flowing back are dispatched without further wiring.
        const { matchId } = this.config.client;
        if (matchId !== undefined) {
            this.store.dispatch({ kind: 'connecting', matchId }, { nowMs: this.nowMs() });
        }
        return this.completeMount(container, matchId);
    }

    /**
     * Async half of {@link ConsoleRuntime.mountInto}: the handshake,
     * then renderer + input. Split out so the torn-down flag can be
     * re-checked after EVERY `await` (005 FR-030) — when `teardown()`
     * wins the race, this rejects instead of mounting a React root,
     * attaching input listeners, or leaving a live-region host behind.
     *
     * @param container Host element for the console tree.
     * @param matchId Configured match to join, when the config names one.
     * @throws When the runtime was torn down while the handshake ran.
     */
    private async completeMount(container: HTMLElement, matchId: MatchId | undefined): Promise<void> {
        let handshakeError: unknown = null;
        try {
            await this.client.connect();
            // FR-030 re-check after EVERY await: a teardown that won
            // the race during connect() stops the handshake HERE —
            // before joinMatch drives a wire join the teardown has
            // already unwound. (The throw is captured below, and the
            // post-try assertUsable rethrows the teardown error.)
            this.assertUsable();
            if (matchId !== undefined) {
                await this.client.joinMatch();
            }
        } catch (error: unknown) {
            handshakeError = error;
        }

        // FR-030 re-check: teardown may have completed while the
        // handshake was in flight. A dead runtime reports nothing and
        // mounts nothing.
        this.assertUsable();

        if (handshakeError !== null) {
            this.logger.error('console: connection failed', { error: handshakeError });
            this.store.dispatch(
                {
                    kind: 'error',
                    code: 'internal_error',
                    message: handshakeError instanceof Error ? handshakeError.message : String(handshakeError),
                },
                { nowMs: this.nowMs() },
            );
        }

        // Renderer (React App by default) + input layer.
        const rendererFactory = this.deps.rendererFactory ?? (() => new ReactAppRenderer() as ConsoleRenderer);
        this.renderer = rendererFactory(this.config);
        this.renderer.mount(container, this);
        const inputFactory =
            this.deps.inputFactory ??
            (() => {
                // v1 default: App's own controllers own pointer/keyboard
                // input; the seam exists for hosts that want to inject.
                const noop: ConsoleInput = {
                    start: () => undefined,
                    stop: () => undefined,
                    teardown: () => undefined,
                };
                return noop;
            });
        this.input = inputFactory(this.config, this);
        this.input.start();
    }

    /**
     * Submit a wire `Order` directly, bypassing the input layer and
     * reducer (contract `Console.sendOrder`). Returns the ActionId the
     * ack will correlate against. Send failures are logged, never
     * thrown — the wire path has no synchronous outcome.
     */
    sendWireOrder(order: Order): ActionId {
        this.assertUsable();
        const actionId = this.store.allocateActionId();
        this.client.sendOrder(actionId, order).catch((error: unknown) => {
            this.logger.warn('console: sendOrder failed', { actionId, orderKind: order.kind, error });
        });
        return actionId;
    }

    /**
     * Open the surrender confirmation UX (contract
     * `Console.requestSurrender`). With `onSurrenderRequest` configured
     * the host owns confirmation entirely; otherwise the built-in
     * modal opens and its confirm button dispatches `{kind:'surrender'}`
     * through the normal reducer path (FR-009 confirm gate).
     */
    async requestSurrender(): Promise<void> {
        this.assertUsable();
        if (this.config.onSurrenderRequest !== undefined) {
            await this.config.onSurrenderRequest();
            return;
        }
        this.openSurrenderModal();
    }

    // -- Surrender-epoch channel (built-in renderer plumbing) ------------------

    /** Subscribe to programmatic surrender-request epochs. */
    subscribeSurrenderEpoch = (listener: () => void): (() => void) => {
        this.surrenderEpochListeners.add(listener);
        return () => {
            this.surrenderEpochListeners.delete(listener);
        };
    };

    /** Current surrender epoch (useSyncExternalStore snapshot). */
    getSurrenderEpoch = (): number => this.surrenderEpochValue;

    /** Bump the epoch so the built-in modal opens on next commit. */
    private openSurrenderModal(): void {
        this.surrenderEpochValue += 1;
        for (const listener of this.surrenderEpochListeners) {
            listener();
        }
    }

    // -- Internals -------------------------------------------------------------

    /** Sanctioned UI clock (`deps.clock` seam, else performance.now). */
    private nowMs(): number {
        return this.deps.clock !== undefined ? this.deps.clock() : performance.now();
    }

    /** Sound player (injected or no-op). */
    private get soundPlayer(): ConsoleSoundPlayer {
        return this.deps.soundPlayer ?? NOOP_SOUND_PLAYER;
    }

    /** Throw once torn down — the contract's unusability guarantee. */
    private assertUsable(): void {
        if (this.tornDown) {
            throw new Error('ConsoleRuntime: the console has been unmounted and is unusable.');
        }
    }

    /**
     * Reducer-effect interpreter (contract ordering: publish state
     * first, then effects — the store guarantees this by invoking the
     * sink after setState).
     */
    private handleEffect(effect: ReducerEffect): void {
        switch (effect.kind) {
            case 'sendOrder':
                // Wire I/O belongs to the bridge (T056).
                this.bridge.handleEffect(effect);
                return;
            case 'announce':
                this.announcer?.announce(effect.text, effect.politeness);
                return;
            case 'persistQol':
                this.config.persist?.(effect.settings);
                return;
            case 'playSound':
                this.soundPlayer.play(effect.clip);
                return;
            case 'requestSurrenderConfirm':
                // Never emitted by the v1 reducer (the HUD button opens the
                // modal directly); handled defensively per contract.
                this.openSurrenderModal();
                return;
            case 'showErrorModal':
                // v1 has no dedicated error-modal component; FR-008 surfaces
                // connection errors via the reconnecting banner + feedback
                // queue. Logged so hosts can observe the request.
                this.logger.warn('console: error modal requested', {
                    title: effect.title,
                    body: effect.body,
                });
                return;
            case 'scheduleReconnect':
                // Reconnection is transparent inside the feature 004 adapter
                // (console-to-networking guarantee #1); the delay is a hint
                // we log but do not act on.
                this.logger.debug('console: reconnect scheduled by adapter', {
                    delayMs: effect.delayMs,
                });
                return;
            default: {
                // Exhaustiveness guard: a new ReducerEffect kind fails to
                // compile here (nothing else can produce `never`).
                const unreachable: never = effect;
                throw new Error(`ConsoleRuntime: unhandled reducer effect: ${String(unreachable)}`);
            }
        }
    }
}
