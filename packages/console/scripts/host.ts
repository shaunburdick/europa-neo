/**
 * One-command local match launcher — the `pnpm host` experience.
 *
 * Boots the full production stack in one process (mirroring the
 * host-wiring recipe proven by `tests/e2e/full-stack.spec.ts`
 * `buildStack()`), auto-creates and fills a public 2-player match
 * (which auto-starts it), serves the built console SPA from `dist/`,
 * and prints two clickable join URLs:
 *
 *   matchmaker ⇄ match server  →  ws://localhost:8080
 *   static file server         →  http://localhost:5173 (packages/console/dist)
 *   Player 1 / Player 2 URLs   →  the console's `?live` runtime
 *
 * Seat claiming needs nothing beyond name + matchId: a tokenless wire
 * `joinMatch` claims the first open seat in ascending playerId order.
 * Each URL ALSO carries its seat's matchmaking-issued session token
 * (`?token=`) so an accidental refresh reclaims the SAME seat within
 * the reconnect grace window instead of failing seat allocation.
 *
 * CLI:
 *   pnpm host [--port N] [--static-port N] [--bind-host HOST] [--public-host HOST]
 *   HOST_PORT / HOST_STATIC_PORT / HOST_BIND_HOST / HOST_PUBLIC_HOST are honored.
 *
 * Zero new dependencies: node:* builtins only. Wall-clock reads live
 * only at transport/hosting boundaries — no simulation logic here
 * (constitution Principle II).
 */

import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computePlayerView } from '@europa/fog';
import { createMatchmaker } from '@europa/matchmaking';
import {
  createMatchServer,
  type Logger,
  type MatchmakerBridge,
  NETWORK_DEFAULT_CONFIG,
  NULL_LOGGER,
  type ServerDeps,
} from '@europa/networking';
import {
  type HostConfig,
  isPathInside,
  isWildcardHost,
  STATIC_SECURITY_HEADERS,
} from './host-config';

/** Package root (this script lives in `<root>/scripts/`). */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');

/** Built console SPA served to players' browsers. */
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist');

/** Default WebSocket port for the match server. */
const DEFAULT_WS_PORT = 8080;

/** Default port for the static console server. */
const DEFAULT_STATIC_PORT = 5173;

/**
 * Production tick cadence. MUST equal the match's `tickIntervalMs`
 * (`registerMatch` enforces it); both use the shipped default.
 */
const TICK_MS = 250;

/**
 * Board edge. The terrain generator's placement constraints are tuned
 * for the shipped default (32); smaller boards can exhaust its
 * regeneration attempts (see full-stack.spec.ts BOARD_SIZE note).
 */
const BOARD_SIZE = 32;

/** Display names for the two seats (cosmetic; matchmaking FR-001). */
const SEAT_NAMES = ['P1', 'P2'] as const;

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
 * Parse a port value from CLI or environment.
 *
 * @param raw   Raw value (already trimmed), or undefined when absent.
 * @param label Option name used in error messages.
 * @returns The parsed port; null when absent; undefined when invalid
 *          (the error message has already been printed).
 */
function parsePort(raw: string | undefined, label: string): number | null | undefined {
  if (raw === undefined || raw === '') {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    complain(`host: ${label} must be an integer between 1 and 65535 (got "${raw}")`);
    return undefined;
  }
  return value;
}

/**
 * Resolve listen hosts and ports from argv and environment, applying the
 * loopback-safe defaults and requiring an advertisement for wildcard binds.
 *
 * @param args Raw argv slice after the script path.
 * @returns The resolved host/port settings, or null when an argument was invalid
 *          (its error has already been printed).
 */
export function resolveConfig(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): HostConfig | null {
  let wsPort = parsePort(environment.HOST_PORT, 'HOST_PORT');
  let staticPort = parsePort(environment.HOST_STATIC_PORT, 'HOST_STATIC_PORT');
  let bindHost = environment.HOST_BIND_HOST ?? '127.0.0.1';
  let publicHost = environment.HOST_PUBLIC_HOST;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    if (
      flag !== '--port' &&
      flag !== '--static-port' &&
      flag !== '--bind-host' &&
      flag !== '--public-host'
    ) {
      complain(
        `host: unknown argument "${arg}" (supported: --port N, --static-port N, --bind-host HOST, --public-host HOST)`,
      );
      return null;
    }
    if (flag === '--bind-host' || flag === '--public-host') {
      const value = inline ?? args[i + 1];
      if (value === undefined || value === '') {
        complain(`host: ${flag} requires a value`);
        return null;
      }
      if (/[^\w.:[\]-]/u.test(value)) {
        complain(`host: ${flag} contains invalid characters`);
        return null;
      }
      if (flag === '--bind-host') bindHost = value;
      else publicHost = value;
      if (inline === undefined) i += 1;
      continue;
    }
    const parsed = parsePort(inline ?? args[i + 1], flag);
    if (parsed === undefined) {
      return null;
    }
    if (parsed === null) {
      complain(`host: ${flag} requires a value`);
      return null;
    }
    if (flag === '--port') {
      wsPort = parsed;
    } else {
      staticPort = parsed;
    }
    if (inline === undefined) {
      i += 1;
    }
  }
  if (wsPort === undefined || staticPort === undefined) return null;
  if (isWildcardHost(bindHost) && publicHost === undefined) {
    complain('host: --public-host or HOST_PUBLIC_HOST is required when binding a wildcard address');
    return null;
  }
  return {
    bindHost,
    publicHost: publicHost ?? (bindHost === '127.0.0.1' ? 'localhost' : bindHost),
    wsPort: wsPort ?? DEFAULT_WS_PORT,
    staticPort: staticPort ?? DEFAULT_STATIC_PORT,
  };
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
  let urlPath = (req.url ?? '/').split('?')[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    writeStaticHead(res, 404).end('bad request path');
    return;
  }
  const requested =
    urlPath === '/' ? path.join(DIST_DIR, 'index.html') : path.resolve(DIST_DIR, `.${urlPath}`);
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
function writeStaticHead(
  res: ServerResponse,
  status: number,
  headers: Record<string, string> = {},
): ServerResponse {
  return res.writeHead(status, { ...STATIC_SECURITY_HEADERS, ...headers });
}

/**
 * Bind the static console server on the configured interface.
 *
 * @param port Port to listen on.
 * @returns The node http server (closed again on shutdown).
 */
function startStaticServer(port: number, bindHost: string): Server {
  const server = createHttpServer((req, res) => {
    void serveStatic(req, res);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    complain(
      error.code === 'EADDRINUSE'
        ? `host: port ${String(port)} is already in use — try --static-port <other>`
        : `host: static server error: ${error.message}`,
    );
    process.exitCode = 1;
    void shutdown();
  });
  server.listen(port, bindHost);
  return server;
}

// ---------------------------------------------------------------------------
// Stack wiring — mirrors tests/e2e/full-stack.spec.ts buildStack() exactly,
// plus human-facing log taps on the forwarding bridge.
// ---------------------------------------------------------------------------

/** What {@link buildStack} hands back: the running pieces to shut down. */
interface Stack {
  /** The live match server (already listening). */
  readonly server: ReturnType<typeof createMatchServer>;
  /** The matchmaker bound to that server. */
  readonly matchmaker: ReturnType<typeof createMatchmaker>;
}

/**
 * Wire matchmaker ⇄ match server per the documented recipe: the server
 * takes a stable forwarding bridge at construction time (before any
 * matchmaker exists); the matchmaker later hands its real handlers over
 * through the optional `bindMatchmaker` seam. Human-readable join /
 * result lines are tapped in the forwarders before delegation.
 *
 * @param wsPort Port for the match server's WebSocket listener.
 * @param bindHost Interface for the WebSocket listener.
 * @returns The bound server + matchmaker (not yet listening).
 */
function buildStack(wsPort: number, bindHost: string): Stack {
  let bound: MatchmakerBridge = {};
  /**
   * Human label for a seat (P1/P2); falls back to the raw number for
   * any seat beyond the v1 two-seater.
   */
  const seatLabel = (playerId: number): string =>
    playerId >= 1 && playerId <= SEAT_NAMES.length
      ? SEAT_NAMES[playerId - 1]
      : `player ${String(playerId)}`;

  const forwardingBridge: MatchmakerBridge = {
    onSeatClaimed: (event) => {
      if (event.role === 'player' && event.playerId !== null) {
        say(`▶ ${seatLabel(event.playerId)} joined (seat ${String(event.playerId)})`);
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
      computePlayerView: ({ world, playerId, spectator }) =>
        computePlayerView(world, playerId, { spectator }),
    },
    matchmaker: forwardingBridge,
    logger: NULL_LOGGER as Logger,
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
  return { server, matchmaker: createMatchmaker({}, { server: bindable }) };
}

// ---------------------------------------------------------------------------
// Match bootstrap
// ---------------------------------------------------------------------------

/** The pre-filled match plus each seat's credentials for the join URLs. */
interface PreparedMatch {
  /** Matchmaking-issued match id (UUID). */
  readonly matchId: string;
  /** Per-seat session tokens, index = seat - 1 (UUIDs). */
  readonly seatTokens: readonly [string, string];
}

/**
 * Create a public 2-player match and fill it so the matchmaker's
 * auto-start builds the engine session and registers it with the live
 * server (the exact flow exercised by full-stack.spec.ts). Seat names
 * P1/P2 keep matchmaking records consistent with the printed URLs.
 *
 * @param matchmaker The bound matchmaker.
 * @returns Match id + seat tokens, or null when matchmaking rejected
 *          a step (reason already printed).
 */
function prepareMatch(matchmaker: Stack['matchmaker']): PreparedMatch | null {
  const created = matchmaker.createMatch({
    visibility: 'public',
    displayName: SEAT_NAMES[0],
    settings: { playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
  });
  if (!created.ok) {
    complain(`host: creating the match failed: ${created.error.message}`);
    return null;
  }
  const filled = matchmaker.joinMatch({
    matchId: created.data.matchId,
    displayName: SEAT_NAMES[1],
  });
  if (!filled.ok) {
    complain(`host: filling the match failed: ${filled.error.message}`);
    return null;
  }
  return {
    matchId: created.data.matchId,
    seatTokens: [created.data.seatAssignment.sessionToken, filled.data.seatAssignment.sessionToken],
  };
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

/**
 * Print the startup banner: endpoints, match id, and one clickable URL
 * per seat. Tokens ride along so a refreshed tab reclaims its own seat.
 *
 * @param staticPort Port the console UI is served on.
 * @param boundPort  The port the match server ACTUALLY bound.
 * @param publicHost Host reachable by players.
 * @param match      The prepared match.
 */
function printBanner(
  staticPort: number,
  boundPort: number,
  publicHost: string,
  match: PreparedMatch,
): void {
  const urlHost =
    publicHost.includes(':') && !publicHost.startsWith('[') ? `[${publicHost}]` : publicHost;
  const wsUrl = `ws://${urlHost}:${String(boundPort)}`;
  const joinUrl = (name: string, token: string): string =>
    `http://${urlHost}:${String(staticPort)}/?live&ws=${encodeURIComponent(wsUrl)}&match=${match.matchId}&name=${name}&token=${token}`;
  say('');
  say(`  Match server : ${wsUrl}`);
  say(`  Console UI   : http://${urlHost}:${String(staticPort)}`);
  say(`  Match id     : ${match.matchId}`);
  say('');
  say('  Open in two browser tabs:');
  say('');
  say(`  Player 1 → ${joinUrl(SEAT_NAMES[0], match.seatTokens[0])}`);
  say(`  Player 2 → ${joinUrl(SEAT_NAMES[1], match.seatTokens[1])}`);
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
 * Entry point: boot stack → serve dist → create+fill public match →
 * print banner → wait for Ctrl-C.
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

  const stack = buildStack(config.wsPort, config.bindHost);

  try {
    await stack.server.listen();
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    complain(
      code === 'EADDRINUSE'
        ? `host: port ${String(config.wsPort)} is already in use — try --port <other>`
        : `host: match server failed to start: ${String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const staticServer = startStaticServer(config.staticPort, config.bindHost);

  teardown = async () => {
    await stack.server.close();
    await stack.matchmaker.close();
    await new Promise<void>((resolve) => {
      staticServer.close(() => {
        resolve();
      });
    });
  };

  const match = prepareMatch(stack.matchmaker);
  if (match === null) {
    await shutdown();
    process.exitCode = 1;
    return;
  }

  const boundPort = stack.server.__boundPortForTest() ?? config.wsPort;
  printBanner(config.staticPort, boundPort, config.publicHost, match);
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
    complain(`host failed: ${String(error)}`);
  });
}
