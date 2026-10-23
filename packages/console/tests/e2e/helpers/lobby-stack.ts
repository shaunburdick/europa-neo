/**
 * Shared console test harness — the real lobby stack (match server +
 * matchmaker + lobby facade) every console suite boots.
 *
 * The wiring mirrors `scripts/host.ts` `buildStack()` (forwarding bridge +
 * lazy lobby facade via `ServerDeps.lobby`, matchmaker bound through the
 * soft `bindMatchmaker` seam) and is single-sourced here so suites cannot
 * drift where drift is silent.
 *
 * `TICK_MS` lives here too: the match server's `tickRateMs` and the
 * matchmaker's `tickIntervalMs` MUST be the same number, so callers
 * import this constant rather than re-declaring it.
 */

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';

import { computePlayerView } from '@europa/fog';
import { createLobbyService, createMatchmaker, type Matchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type Server,
    type ServerConfig,
    type ServerDeps,
} from '@europa/networking';

/** Fixed test cadence; match tickIntervalMs MUST equal server tickRateMs. */
export const TICK_MS = 250;

/** Options for {@link buildLobbyStack}. */
export interface LobbyStackOptions {
    /**
     * Single-port topology (011 FR-009): attach WS upgrades to one HTTP
     * server. An `HttpServer` uses the caller's; `'create'` has the helper
     * build one and return it as {@link LobbyStack.httpServer}. Omit to let
     * the networking server own its internal HTTP listener.
     */
    readonly httpServer?: HttpServer | 'create';
    /** Fixed port to bind (0 → ephemeral; read it back from `server.__boundPortForTest()`). */
    readonly port?: number;
    /** Server config overrides merged over the test baseline (heartbeat, idle timeout, tick rate, …). */
    readonly config?: Partial<ServerConfig>;
    /**
     * Wrap the bindable server before `createMatchmaker` receives it — e.g.
     * to absorb a duplicate `registerMatch` a lobby-style host triggers first.
     */
    readonly wrapServer?: (server: Server) => Server;
}

/** What {@link buildLobbyStack} returns: running components to shut down. */
export interface LobbyStack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
    /** Read the memoized lobby facade once built; null until first lobby frame. */
    readonly lobbyFacade: () => ReturnType<typeof createLobbyService> | null;
    /** The single-port HTTP server when one is in play (created or caller-supplied). */
    readonly httpServer?: HttpServer;
}

/**
 * Wire matchmaker ⇄ match server ⇄ lobby facade per the documented
 * host recipe: forwarding bridge + lazy lobby-facade via `ServerDeps.lobby`,
 * matchmaker binds via the soft `bindMatchmaker` seam.
 *
 * @param options Stack topology and config overrides (see {@link LobbyStackOptions}).
 * @returns The running stack; `httpServer` is present when single-port.
 */
export function buildLobbyStack(
    options: LobbyStackOptions & { readonly httpServer: HttpServer | 'create' },
): LobbyStack & { readonly httpServer: HttpServer };
export function buildLobbyStack(options?: LobbyStackOptions): LobbyStack;
export function buildLobbyStack(options: LobbyStackOptions = {}): LobbyStack {
    const httpServer = options.httpServer === 'create' ? createHttpServer() : options.httpServer;

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
        ...(httpServer === undefined ? {} : { httpServer }),
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
        {
            ...NETWORK_DEFAULT_CONFIG,
            host: '127.0.0.1',
            tickRateMs: TICK_MS,
            ordersPerSecond: 1000,
            ...options.config,
            port: options.port ?? options.config?.port ?? 0,
        },
        deps,
    );

    const bindable = Object.assign(server, {
        bindMatchmaker(bridge: MatchmakerBridge): void {
            bound = { ...bound, ...bridge };
        },
    });

    const matchmaker = createMatchmaker({}, { server: options.wrapServer?.(bindable) ?? bindable });
    wiring.matchmaker = matchmaker;

    return {
        server,
        matchmaker,
        lobbyFacade: () => wiring.lobby,
        ...(httpServer === undefined ? {} : { httpServer }),
    };
}
