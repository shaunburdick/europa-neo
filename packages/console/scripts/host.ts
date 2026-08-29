/**
 * One-command local host launcher — the `pnpm host` experience.
 *
 * Boots the full production stack in one process (mirroring the
 * host-wiring recipes proven by `tests/e2e/full-stack.spec.ts`
 * `buildStack()` and `tests/integration/lobby-transport.test.ts`
 * `bootLobbyStack()`), serves the built console SPA from `dist/`, and
 * exposes the feature-010 public lobby on a SINGLE http.Server:
 *
 *   single http.Server on HOST_PORT → ws://localhost:8080 + http://localhost:8080 (packages/console/dist)
 *   Lobby (DEFAULT)                 → http://localhost:8080/
 *
 * By default the launcher pre-creates NOTHING (spec 010 FR-017): the
 * landing page IS the lobby, where visitors establish a guest identity,
 * set a handle, and create/join/spectate public matches in the browser.
 * The lobby facade (`createLobbyService`) is wired lazily via
 * `ServerDeps.lobby` and builds itself at the first lobby frame, after
 * the matchmaker exists.
 *
 * `--create` retains the pre-lobby quick-test experience: auto-create +
 * fill a public 2-player match (which auto-starts it) and print two
 * clickable join URLs.
 *
 * Seat claiming needs nothing beyond name + matchId: a tokenless wire
 * `joinMatch` claims the first open seat in ascending playerId order.
 * Each URL ALSO carries its seat's matchmaking-issued session token
 * (`?token=`) so an accidental refresh reclaims the SAME seat within
 * the reconnect grace window instead of failing seat allocation.
 *
 * Privacy boundary (spec 010 NFR-003/FR-024): host diagnostics NEVER
 * echo guestPlayerIds, session tokens, or reconnect tokens; free-form
 * wire-derived text is sanitized through `sanitizeLogText` before it
 * reaches a log line. The only tokens ever printed are the deliberate
 * `--create` seat URLs themselves (the product of that mode).
 *
 * CLI:
 *   pnpm host [--create] [--port N] [--bind-host HOST] [--public-host HOST]
 *   HOST_PORT / HOST_BIND_HOST / HOST_PUBLIC_HOST are honored.
 *
 * Zero new dependencies: node:* builtins + workspace @europa/* only.
 * Wall-clock reads live only at transport/hosting boundaries — no
 * simulation logic here (constitution Principle II).
 */

import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computePlayerView } from '@europa/fog';
import { createLobbyService, createMatchmaker, type Matchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type ServerDeps,
} from '@europa/networking';
import { APP_VERSION } from '@europa/version';
import { formatWaitingMessage } from '../src/state/awaiting-start';
import {
    isPathInside,
    type NPlayerHostConfig,
    resolveConfig as resolveNPlayerConfig,
    STATIC_SECURITY_HEADERS,
    sanitizeLogText,
} from './host-config';
import { handleVersionRoute } from './version-route';

/** Package root (this script lives in `<root>/scripts/`). */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');

/** Built console SPA served to players' browsers. */
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist');

/**
 * Production tick cadence. MUST equal the match's `tickIntervalMs`
 * (`registerMatch` enforces it); both use the shipped default.
 */
const TICK_MS = 250;

/** Cosmetic seat labels (matchmaking FR-001). Extended to the four-seat maximum. */
const SEAT_NAMES = ['P1', 'P2', 'P3', 'P4'] as const;

/**
 * Cosmetic seat label for a join-URL `name=` param and seat-join logs.
 * Returns `P1`..`P4` for the supported player counts and falls back to a
 * generic label for any seat beyond the v1 four-seater.
 *
 * @param playerId 1-based seat number.
 * @returns The display label for that seat.
 */
function seatName(playerId: number): string {
    return playerId >= 1 && playerId <= SEAT_NAMES.length ? SEAT_NAMES[playerId - 1] : `Player ${String(playerId)}`;
}

/** MIME types for the static server (covers everything vite emits). */
const MIME_TYPES: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.ogg': 'audio/ogg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
};

// ---------------------------------------------------------------------------
// Output helpers (biome noConsole; launcher output IS the product)
// ---------------------------------------------------------------------------

/** Write a line to stdout. */
function say(line: string): void {
    process.stdout.write(`${line}\n`);
}

/** Write a line to stderr. */
function complain(line: string): void {
    process.stderr.write(`${line}\n`);
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

/**
 * Fully resolved launcher configuration: the network surface plus the
 * launch mode (spec 010 FR-017).
 */
export interface HostLaunchConfig extends NPlayerHostConfig {
    /**
     * True when `--create` requested the explicit create flow
     * (auto-create + fill a public 2P match and print two seat URLs).
     * False — the DEFAULT — serves an empty lobby visitors use to
     * create/join matches themselves.
     */
    readonly createMatch: boolean;
}

/**
 * Resolve launcher configuration from argv + environment, layering the
 * `--create` launch-mode flag on top of the N-player host config resolved
 * by {@link resolveNPlayerConfig} (012 FR-011/FR-012). The N-player
 * resolver owns port/bind/board/player-count parsing and the single-port
 * invariant; this wrapper only adds the create-mode bit.
 *
 * FR-012: `HOST_STATIC_PORT` is unsupported and is REJECTED (not silently
 * ignored) — the strict N-player resolver rejects it with a clear "no longer
 * supported" error, and this wrapper passes the environment through unchanged
 * so that rejection fires. The single-port model uses `HOST_PORT` only; there
 * is no second listener.
 *
 * @param args Raw argv slice after the script path.
 * @param environment Process environment (overridable for tests).
 * @returns The resolved settings, or null when an argument was invalid
 *          (its error has already been printed).
 */
export function resolveConfig(
    args: readonly string[],
    environment: NodeJS.ProcessEnv = process.env,
): HostLaunchConfig | null {
    // FR-012: pass the environment through unchanged so the strict N-player
    // resolver rejects HOST_STATIC_PORT with a clear "no longer supported"
    // error (the launcher must not silently ignore it).
    const base = resolveNPlayerConfig(args, environment);
    if (base === null) {
        return null;
    }
    // `--create` is validated (and ignored) by the N-player resolver; detect
    // the bare flag here to set the launch mode. Glued forms (--create=x)
    // were already rejected upstream, so only bare `--create` reaches here.
    let createMatch = false;
    for (const arg of args) {
        const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
        if (flag === '--create') {
            createMatch = true;
            break;
        }
    }
    return { ...base, createMatch };
}

// ---------------------------------------------------------------------------
// Static file server (~40 lines of node:http — no vite dev server needed)
// ---------------------------------------------------------------------------

/**
 * Serve one request from {@link DIST_DIR}. `/` resolves to
 * `index.html`; existing files stream with a content-type; any other
 * extension-less path falls back to `index.html` (SPA safety net);
 * anything else is a plain 404. Path-traversal attempts are rejected.
 *
 * @param req Incoming request.
 * @param res Response to fill.
 */
async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // decodeURIComponent throws on malformed escapes (%zz); a hostile or
    // broken client must never crash the launcher, so treat those as 404.
    const [initialUrlPath] = (req.url ?? '/').split('?');
    let urlPath = initialUrlPath ?? '/';
    try {
        urlPath = decodeURIComponent(urlPath);
    } catch {
        writeStaticHead(res, 404).end('bad request path');
        return;
    }
    // Feature 009 FR-006: `/version` answers at the top of the surface,
    // before any dist lookup or the SPA fallback could swallow it;
    // `true` means fully handled.
    if (handleVersionRoute(req, res, urlPath)) {
        return;
    }
    const requested = urlPath === '/' ? path.join(DIST_DIR, 'index.html') : path.resolve(DIST_DIR, `.${urlPath}`);
    if (!isPathInside(DIST_DIR, requested)) {
        writeStaticHead(res, 403).end('forbidden');
        return;
    }
    const target = existsSync(requested) ? requested : path.join(DIST_DIR, 'index.html');
    let canonicalTarget: string;
    try {
        canonicalTarget = await realpath(target);
    } catch {
        writeStaticHead(res, 404).end('not found — did you run `pnpm build`?');
        return;
    }
    if (!isPathInside(await realpath(DIST_DIR), canonicalTarget)) {
        writeStaticHead(res, 403).end('forbidden');
        return;
    }
    try {
        const body = await readFile(canonicalTarget);
        const type = MIME_TYPES[path.extname(canonicalTarget)] ?? 'application/octet-stream';
        writeStaticHead(res, 200, { 'content-type': type }).end(body);
    } catch {
        writeStaticHead(res, 404).end('not found — did you run `pnpm build`?');
    }
}

/** Write common security headers alongside optional response headers. */
function writeStaticHead(res: ServerResponse, status: number, headers: Record<string, string> = {}): ServerResponse {
    return res.writeHead(status, { ...STATIC_SECURITY_HEADERS, ...headers });
}

// ---------------------------------------------------------------------------
// Stack wiring — mirrors tests/e2e/full-stack.spec.ts buildStack() exactly,
// plus human-facing log taps on the forwarding bridge.
// ---------------------------------------------------------------------------

/** The lobby facade built by `createLobbyService` (mirrored contract plus teardown hook). */
type LobbyFacade = ReturnType<typeof createLobbyService>;

/** What {@link buildStack} hands back: the running pieces to shut down. */
interface Stack {
    /** The live match server (already listening). */
    readonly server: ReturnType<typeof createMatchServer>;
    /** The matchmaker bound to that server. */
    readonly matchmaker: ReturnType<typeof createMatchmaker>;
    /**
     * Read the memoized lobby facade once the first lobby frame has
     * built it; null until then (the `ServerDeps.lobby` factory is lazy
     * by contract, so a boot with no lobby visitors never builds one).
     */
    readonly lobbyFacade: () => LobbyFacade | null;
}

/**
 * Wire matchmaker ⇄ match server ⇄ lobby facade per the documented
 * recipes: the server takes a stable forwarding bridge at construction
 * time (before any matchmaker exists); the matchmaker later hands its
 * real handlers over through the optional `bindMatchmaker` seam; and
 * the lobby facade builds itself lazily at the FIRST lobby frame via
 * `ServerDeps.lobby`, closing over a forward-reference slot. Human-
 * readable join / result lines are tapped in the forwarders before
 * delegation.
 *
 * @param wsPort Port for the single http.Server (HOST_PORT).
 * @param bindHost Interface for the WebSocket listener.
 * @param httpServer The single http.Server that will also handle WS upgrades.
 * @returns The bound server + matchmaker (not yet listening) and the
 *          lobby-facade accessor for shutdown.
 */
function buildStack(wsPort: number, bindHost: string, httpServer: import('node:http').Server): Stack {
    let bound: MatchmakerBridge = {};
    /**
     * Forward-reference slots filled right after server construction:
     * the lobby factory runs at the first lobby frame, by which time
     * the matchmaker exists (the documented ServerDeps.lobby recipe).
     */
    const wiring: { matchmaker: Matchmaker | null; lobby: LobbyFacade | null } = { matchmaker: null, lobby: null };
    /**
     * Human label for a seat (P1/P2); falls back to the raw number for
     * any seat beyond the v1 two-seater.
     */
    const seatLabel = (playerId: number): string =>
        playerId >= 1 && playerId <= SEAT_NAMES.length ? SEAT_NAMES[playerId - 1] : `player ${String(playerId)}`;

    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => {
            if (event.role === 'player' && event.playerId !== null) {
                // Feature 009 FR-005: production runs NULL_LOGGER, so this
                // launcher line IS the operator-visible seat-join log — it
                // carries the release identity like the server's own tap.
                // Structural facts only: never the session token, never a
                // guest id, never a wire-supplied handle.
                say(`▶ ${seatLabel(event.playerId)} joined (seat ${String(event.playerId)}, v${APP_VERSION})`);
            }
            bound.onSeatClaimed?.(event);
        },
        onSeatDisconnected: (event) => {
            bound.onSeatDisconnected?.(event);
        },
        onSeatReconnected: (event) => {
            bound.onSeatReconnected?.(event);
        },
        onSeatExpired: (event) => {
            bound.onSeatExpired?.(event);
        },
        onMatchTerminal: (event) => {
            const outcome =
                event.result.kind === 'win'
                    ? `${seatLabel(event.result.winner)} wins (${event.result.reason})`
                    : `draw (${event.result.reason})`;
            say(`■ Match finished at tick ${String(event.tick)}: ${outcome}`);
            bound.onMatchTerminal?.(event);
        },
    };

    const deps: ServerDeps = {
        engine: {
            // Real sessions arrive pre-built from the matchmaker's auto-start
            // (engineSession.ts); the factory stays unused, exactly as in E2E.
            createMatchSession: () => {
                throw new Error('engine factory not used (matchmaker pre-builds sessions)');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: forwardingBridge,
        logger: NULL_LOGGER as Logger,
        httpServer,
        lobby: {
            create: (sink) => {
                const matchmaker = wiring.matchmaker;
                if (matchmaker === null) {
                    throw new Error('host wiring bug: lobby frame arrived before the matchmaker was bound');
                }
                // One facade per process (plan.md §1). Capture it so
                // shutdown can drop registry/ledger state even though the
                // server memoizes its own reference internally — a boot
                // where nobody ever opens the lobby leaves this null and
                // needs no facade shutdown at all.
                const facade = createLobbyService({ matchmaker, deliver: sink.deliver });
                wiring.lobby = facade;
                return facade;
            },
        },
    };

    const server = createMatchServer(
        { ...NETWORK_DEFAULT_CONFIG, host: bindHost, port: wsPort, tickRateMs: TICK_MS },
        deps,
    );

    // Soft-binding seam (contracts/matchmaking-api.ts): the matchmaker
    // detects this optional method and hands its bridge handlers over.
    const bindable = Object.assign(server, {
        bindMatchmaker(bridge: MatchmakerBridge): void {
            bound = { ...bound, ...bridge };
        },
    });
    const matchmaker = createMatchmaker({}, { server: bindable });
    wiring.matchmaker = matchmaker;
    return { server, matchmaker, lobbyFacade: () => wiring.lobby };
}

// ---------------------------------------------------------------------------
// Match bootstrap
// ---------------------------------------------------------------------------

/** The pre-filled match plus each seat's credentials for the join URLs. */
interface PreparedMatch {
    /** Matchmaking-issued match id (UUID). */
    readonly matchId: string;
    /** Per-seat session tokens, index = seat - 1 (UUIDs); length === playerCount. */
    readonly seatTokens: readonly string[];
    /** Requested player count — drives the banner's N and the URL count. */
    readonly playerCount: number;
    /** Requested board edge — echoed in the banner. */
    readonly boardSize: number;
}

/**
 * Create a public `playerCount`-player match and fill every seat so the
 * matchmaker's auto-start builds the engine session and registers it with
 * the live server (the exact flow exercised by full-stack.spec.ts, now
 * parameterized over N). Seat labels `P1`..`PN` keep matchmaking records
 * consistent with the printed URLs. As each seat is claimed, a waiting
 * progress line is printed so the operator sees the fill proceed.
 *
 * @param matchmaker The bound matchmaker.
 * @param options    Requested player count and board edge.
 * @returns Match id + per-seat tokens + counts, or null when matchmaking
 *          rejected a step (reason already printed).
 */
export function prepareMatch(
    matchmaker: Stack['matchmaker'],
    options: { readonly playerCount: 2 | 3 | 4; readonly boardSize: 32 | 48 | 64 },
): PreparedMatch | null {
    const { playerCount, boardSize } = options;
    const created = matchmaker.createMatch({
        visibility: 'public',
        displayName: seatName(1),
        settings: { playerCount, boardSize, tickIntervalMs: TICK_MS },
    });
    if (!created.ok) {
        complain(`host: creating the match failed: ${sanitizeLogText(created.error.message)}`);
        return null;
    }
    const seatTokens: string[] = [created.data.seatAssignment.sessionToken];
    // Seat 1 is filled by createMatch; announce progress while N-1 remain.
    if (playerCount > 1) {
        say(formatWaitingMessage(1, playerCount));
    }
    for (let seat = 2; seat <= playerCount; seat += 1) {
        const filled = matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: seatName(seat),
        });
        if (!filled.ok) {
            complain(`host: filling seat ${String(seat)} failed: ${sanitizeLogText(filled.error.message)}`);
            return null;
        }
        seatTokens.push(filled.data.seatAssignment.sessionToken);
        // Announce remaining seats until the match is full.
        if (seat < playerCount) {
            say(formatWaitingMessage(seat, playerCount));
        }
    }
    return {
        matchId: created.data.matchId,
        seatTokens,
        playerCount,
        boardSize,
    };
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

/**
 * Bracket an IPv6 literal host for URL embedding; any other host value
 * passes through untouched (values are regex-validated at parse time).
 *
 * @param publicHost The operator-advertised reachable host.
 * @returns The URL-safe host form.
 */
function urlHostOf(publicHost: string): string {
    return publicHost.includes(':') && !publicHost.startsWith('[') ? `[${publicHost}]` : publicHost;
}

/**
 * Print the DEFAULT (lobby-mode) startup banner: release version,
 * launch mode, endpoints, and ONE clickable lobby URL. No match id,
 * seat, token, or identity appears anywhere (spec 010 plan: normal
 * host output contains no pre-created match).
 *
 * Single-port: both Match server and Console UI share the same HOST_PORT.
 *
 * @param port       Single port the server is bound on (HOST_PORT).
 * @param publicHost Host reachable by players.
 */
export function printLobbyBanner(port: number, publicHost: string): void {
    const host = urlHostOf(publicHost);
    say('');
    say(`  Version      : v${APP_VERSION}`);
    say('  Mode         : lobby (visitors create/join matches in the browser)');
    say(`  Match server : ws://${host}:${String(port)}`);
    say(`  Console UI   : http://${host}:${String(port)}`);
    say('');
    say('  Open the lobby in a browser:');
    say('');
    say(`  → http://${host}:${String(port)}/`);
    say('');
    say('  Matches and guest identities are in-memory only — restarting resets the lobby.');
    say('  Ctrl-C to stop.');
    say('');
}

/**
 * Print the `--create` startup banner: release version, launch mode,
 * endpoints, match id, and one clickable URL per seat. Tokens ride
 * along so a refreshed tab reclaims its own seat. This mode retains
 * the pre-lobby two-seat quick-test experience.
 *
 * Single-port: both ws and http share the same HOST_PORT.
 *
 * @param port       Single port the server is bound on (HOST_PORT).
 * @param publicHost Host reachable by players.
 * @param match      The prepared match.
 */
export function printCreateBanner(port: number, publicHost: string, match: PreparedMatch): void {
    const host = urlHostOf(publicHost);
    const wsUrl = `ws://${host}:${String(port)}`;
    const joinUrl = (name: string, token: string): string =>
        `http://${host}:${String(port)}/?live&ws=${encodeURIComponent(wsUrl)}&match=${match.matchId}&name=${name}&token=${token}`;
    say('');
    say(`  Version      : v${APP_VERSION}`);
    say(
        `  Mode         : explicit-create (--create) — pre-created public ${String(match.playerCount)}P match (board ${String(match.boardSize)})`,
    );
    say(`  Match server : ${wsUrl}`);
    say(`  Console UI   : http://${host}:${String(port)}`);
    say(`  Lobby        : http://${host}:${String(port)}/`);
    say(`  Match id     : ${match.matchId}`);
    say('');
    say(`  Open in ${String(match.playerCount)} browser tabs:`);
    say('');
    for (let i = 0; i < match.seatTokens.length; i += 1) {
        const seat = i + 1;
        const name = seatName(seat);
        say(`  Player ${String(seat)} (${name}) → ${joinUrl(name, match.seatTokens[i])}`);
    }
    say('');
    say('  Ctrl-C to stop.');
    say('');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Everything that must close on shutdown (set once booted). */
let teardown: (() => Promise<void>) | null = null;

/** Re-entry guard so double SIGINT (or signal + static error) runs once. */
let shuttingDown = false;

/**
 * Close every piece of the stack exactly once. Idempotent.
 *
 * @returns Resolves when all listeners and timers are down.
 */
async function shutdown(): Promise<void> {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    await teardown?.();
}

/**
 * Entry point: boot stack (with the lazy lobby facade wired) → serve
 * dist → either print the lobby banner (DEFAULT, no match created) or
 * run the explicit `--create` flow → wait for Ctrl-C.
 */
async function main(): Promise<void> {
    const config = resolveConfig(process.argv.slice(2));
    if (config === null) {
        process.exitCode = 1;
        return;
    }

    if (!existsSync(path.join(DIST_DIR, 'index.html'))) {
        complain('host: packages/console/dist/index.html not found.');
        complain('host: Build the console first, then retry:');
        complain('host:   pnpm install && pnpm build');
        process.exitCode = 1;
        return;
    }

    // Single http.Server serving HTTP (dist + /version + SPA fallback)
    // and WebSocket upgrades on the same HOST_PORT (011 FR-001/FR-002).
    const httpServer = createHttpServer(async (req, res) => {
        void serveStatic(req, res);
    });
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
        complain(
            error.code === 'EADDRINUSE'
                ? `host: port ${String(config.port)} is already in use — try --port <other>`
                : `host: server error: ${sanitizeLogText(error.message)}`,
        );
        process.exitCode = 1;
        void shutdown();
    });

    // 011 T010 / plan D3+D4: single-port seam — host owns the http.Server and
    // hands it to networking via ServerDeps.httpServer; networking attaches
    // its `upgrade` handler on server.listen() and never creates a second
    // listener. This collapses the former ws:8080 + http:5173 pair onto
    // one origin (one http.Server, one EXPOSE, one port mapping, same-origin WS).
    const stack = buildStack(config.port, config.bindHost, httpServer);

    try {
        await new Promise<void>((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(config.port, config.bindHost, () => resolve());
        });
    } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        complain(
            code === 'EADDRINUSE'
                ? `host: port ${String(config.port)} is already in use — try --port <other>`
                : `host: server failed to start: ${sanitizeLogText(String(error))}`,
        );
        process.exitCode = 1;
        return;
    }

    // Networking's listen() for the external-server path only attaches the
    // `upgrade` delegation to httpServer and starts the tick clock — it
    // does NOT call httpServer.listen (host already owns it).
    await stack.server.listen();

    teardown = async () => {
        // Order matters. Networking's close() drains EVERY tracked
        // connection — lobby-only sockets included — with a 1001 "going
        // away" frame (feature 010), which drives each connection's
        // lobby teardown while the facade is still open. Only then is
        // lobby state dropped: facade.close() clears identities,
        // subscriptions, and the ledger and cascades into
        // matchmaker.close(); the explicit matchmaker.close() after it
        // is the safety net for boots where no lobby frame ever arrived
        // (facade never built). Both closes are idempotent. Single-port
        // seam (011 T010): server.close() does NOT close the externally
        // owned httpServer — host closes it last.
        await stack.server.close();
        await stack.lobbyFacade()?.close();
        await stack.matchmaker.close();
        await new Promise<void>((resolve) => {
            httpServer.close(() => {
                resolve();
            });
        });
    };

    const address = httpServer.address() as { port: number } | null;
    const boundPort = address?.port ?? config.port;

    // FR-017: the DEFAULT launch serves an EMPTY lobby — no match is
    // pre-created; visitors create/join through the browser UI.
    // `--create` retains the two-seat quick-test flow.
    if (config.createMatch) {
        const match = prepareMatch(stack.matchmaker, {
            playerCount: config.playerCount,
            boardSize: config.boardSize,
        });
        if (match === null) {
            await shutdown();
            process.exitCode = 1;
            return;
        }
        printCreateBanner(boundPort, config.publicHost, match);
        return;
    }
    printLobbyBanner(boundPort, config.publicHost);
}

process.on('SIGINT', () => {
    void shutdown().then(() => {
        process.exit(0);
    });
});
process.on('SIGTERM', () => {
    void shutdown().then(() => {
        process.exit(0);
    });
});

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        process.exitCode = 1;
        complain(`host failed: ${sanitizeLogText(String(error))}`);
    });
}
