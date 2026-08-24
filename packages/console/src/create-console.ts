/**
 * `createConsole` factory — Feature 005 (T087).
 *
 * The public entry point an embedding host calls (contracts/
 * console-api.ts "Embedding flow"):
 *
 *   const console = createConsole(config, deps);
 *   await console.mount(document.getElementById('root'));
 *   // ... user interacts; the runtime drives state + network ...
 *   await console.unmount();
 *
 * Constructs the {@link ConsoleRuntime} (T086) and returns the
 * minimal `Console` facade. The factory does NOT mount — call
 * `mount(container)` afterwards (contract). After `unmount()` the
 * handle is unusable.
 *
 * JSDoc reference: plan.md "Embedding flow" +
 * contracts/console-api.ts.
 */

import type { Console, ConsoleConfig, ConsoleDeps } from '../contracts/console-api';
import { ConsoleRuntime } from './runtime';
import type {
    ActionId,
    CameraState,
    ConsoleAction,
    ConsoleConnectionStatus,
    ConsoleState,
    Order,
    PlayerId,
    QoLSettings,
    SessionToken,
} from './state/types';

/**
 * Construct a `Console` instance bound to a fresh runtime. Does NOT
 * mount — call `console.mount(container)` first (see the contract's
 * lifecycle: create → mount → interact → unmount).
 *
 * @param config Console configuration (client settings, logger,
 *               persistence callback, feature flags).
 * @param deps   Optional dependency seams for tests (fake client /
 *               renderer / input / sound / clock). Production omits.
 * @returns The `Console` handle delegating to a private runtime.
 *
 * @example
 * ```ts
 * import { createConsole } from '@europa/console';
 *
 * const europa = createConsole({
 *   client: { url: 'ws://localhost:8080', displayName: 'Alice', matchId },
 *   persist: (settings) => localStorage.setItem('europa:qol', JSON.stringify(settings)),
 * });
 * await europa.mount(document.getElementById('root')!);
 * ```
 */
export function createConsole(config: ConsoleConfig, deps?: ConsoleDeps): Console {
    const runtime = new ConsoleRuntime({ config, deps });

    return {
        mount: (container: HTMLElement) => runtime.mountInto(container),
        unmount: () => runtime.teardown(),
        subscribe: (handler: (state: ConsoleState) => void) => runtime.subscribe(handler),
        getState: (): ConsoleState => runtime.getState(),
        dispatch: (action: ConsoleAction): void => runtime.apply(action),
        sendOrder: (order: Order): ActionId => runtime.sendWireOrder(order),
        getSessionToken: (): SessionToken | null => runtime.getState().session.sessionToken,
        getPlayerId: (): PlayerId | null => runtime.getState().session.playerId,
        getConnectionStatus: (): ConsoleConnectionStatus => runtime.getState().status,
        requestSurrender: () => runtime.requestSurrender(),
        setQolSettings: (patch: Partial<QoLSettings>): void => {
            runtime.apply({ kind: 'setQol', patch });
        },
        setCamera: (camera: Partial<CameraState>): void => {
            // Partial-camera semantics: merge over the current camera so
            // hosts can nudge zoom or pan independently ("reset view"
            // buttons pass the full default instead).
            runtime.apply({ kind: 'setCamera', camera: { ...runtime.getState().camera, ...camera } });
        },
    };
}
