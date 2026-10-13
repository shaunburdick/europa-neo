/**
 * Shared E2E helper — the real lobby stack (match server + matchmaker +
 * lobby facade) that the lobby and SC-017 suites drive through browsers.
 *
 * Extracted from `lobby.spec.ts` so a second suite can boot the SAME
 * recipe instead of forking it: the wiring below mirrors
 * `scripts/host.ts` `buildStack()` (forwarding bridge + lazy lobby
 * facade via `ServerDeps.lobby`, matchmaker bound through the soft
 * `bindMatchmaker` seam), and two copies would drift exactly where
 * drift is silent.
 *
 * `TICK_MS` lives here too: the match server's `tickRateMs` and the
 * matchmaker's `tickIntervalMs` MUST be the same number, so callers
 * import this constant rather than re-declaring it.
 */

import { computePlayerView } from '@europa/fog';
import { createLobbyService, createMatchmaker, type Matchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type Server,
    type ServerDeps,
} from '@europa/networking';

/** Fixed test cadence; match tickIntervalMs MUST equal server tickRateMs. */
export const TICK_MS = 250;

/** What {@link buildLobbyStack} returns: running components to shut down. */
export interface LobbyStack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
    /** Read the memoized lobby facade once built; null until first lobby frame. */
    readonly lobbyFacade: () => ReturnType<typeof createLobbyService> | null;
}

/**
 * Wire matchmaker ⇄ match server ⇄ lobby facade per the documented
 * host recipe: forwarding bridge + lazy lobby-facade via `ServerDeps.lobby`,
 * matchmaker binds via the soft `bindMatchmaker` seam.
 *
 * @param port Fixed port to bind (0 → ephemeral; read it back from
 *   `server.__boundPortForTest()`), used by restart scenarios.
 */
export function buildLobbyStack(port = 0): LobbyStack {
    let bound: MatchmakerBridge = {};
    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
        onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
        onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
        onSeatExpired: (event) => bound.onSeatExpired?.(event),
        onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
    };

    const wiring: { matchmaker: Matchmaker | null; lobby: ReturnType<typeof createLobbyService> | null } = {
        matchmaker: null,
        lobby: null,
    };

    const deps: ServerDeps = {
        engine: {
            // Real sessions arrive pre-built from the matchmaker's auto-start.
            createMatchSession: () => {
                throw new Error('engine factory not used (matchmaker pre-builds sessions)');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: forwardingBridge,
        logger: NULL_LOGGER as Logger,
        lobby: {
            create: (sink) => {
                const matchmaker = wiring.matchmaker;
                if (matchmaker === null) {
                    throw new Error('host wiring bug: lobby frame arrived before the matchmaker was bound');
                }
                const facade = createLobbyService({ matchmaker, deliver: sink.deliver });
                wiring.lobby = facade;
                return facade;
            },
        },
    };

    const server = createMatchServer(
        { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port, tickRateMs: TICK_MS, ordersPerSecond: 1000 },
        deps,
    );

    const bindable = Object.assign(server, {
        bindMatchmaker(bridge: MatchmakerBridge): void {
            bound = { ...bound, ...bridge };
        },
    });

    const matchmaker = createMatchmaker({}, { server: bindable });
    wiring.matchmaker = matchmaker;

    return {
        server,
        matchmaker,
        lobbyFacade: () => wiring.lobby,
    };
}
