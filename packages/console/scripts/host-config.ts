/** Configuration and security helpers for the local/LAN host launcher. */

import { isAbsolute, relative } from 'node:path';
import { BOARD_SIZE_DEFAULTS } from '@europa/matchmaking';

/** Resolved host and port settings used by the launcher (single-port: HOST_PORT). */
export interface HostConfig {
    readonly bindHost: string;
    readonly publicHost: string;
    /** Single port for both HTTP + WS — default HOST_PORT 8080. */
    readonly port: number;
    /**
     * @deprecated Alias for `port` — the server uses a single port (HOST_PORT / --port). Prefer `port`.
     */
    readonly wsPort: number;
}

/**
 * Extended host config for N-player matches (012 FR-011).
 * Wired through `resolveConfig` → `buildStack` → `prepareMatch`.
 */
export interface NPlayerHostConfig extends HostConfig {
    /** Requested player count — drives match creation in --create mode. */
    readonly playerCount: 2 | 3 | 4;
    /**
     * Requested board edge — drives match creation in --create mode.
     * NOTE: `64` is temporarily disabled in the UI and host CLI (terrain
     * generation is unreliable — follow-up issue #26); the accepted set is
     * `32 | 48` until the terrain fix lands. The type keeps `64` as the
     * theoretical set so the resolved config can still carry a 64 board when
     * a direct API caller supplies one.
     */
    readonly boardSize: 32 | 48 | 64;
}

/** Return true for an address that listens on all interfaces. */
export function isWildcardHost(host: string): boolean {
    return host === '0.0.0.0' || host === '::' || host === '[::]';
}

/** Return true when a normalized filesystem path is inside a directory. */
export function isPathInside(root: string, candidate: string): boolean {
    const descendant = relative(root, candidate);
    return descendant === '' || (!descendant.startsWith('..') && !isAbsolute(descendant));
}

/** HTTP response headers applied by the development static server. */
export const STATIC_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
} as const;

/**
 * Characters that must never survive into a launcher log line: the
 * Unicode `Cc` category (C0 controls U+0000–U+001F plus C1 controls
 * U+007F–U+009F) includes newline, tab, and ESC, so stripping it
 * prevents log forging (smuggled extra lines) and terminal escape
 * attacks from any wire-derived text a diagnostic might echo. Handles
 * arriving over the wire are hostile-but-valid content — spec 010
 * Clarifications v1.3 rejects control characters at the validation
 * source; this sanitizes again at the log sink.
 */
const LOG_CONTROL_CHARS = /\p{Cc}/gu;

/** Hard cap for echoed free-form text so one huge field cannot flood the log. */
const LOG_TEXT_MAX_LENGTH = 200;

/**
 * Make wire-derived text safe to interpolate into a diagnostics line:
 * control characters become spaces and the result is trimmed and
 * length-capped. Plain string interpolation of the returned text is
 * then fine. Structural facts (ports, seat numbers, enum reasons) never
 * need this; apply it to anything not fully host-controlled.
 *
 * @param text      Raw text (error messages, handles, any untrusted string).
 * @param maxLength Truncation cap (default {@link LOG_TEXT_MAX_LENGTH}).
 * @returns Sanitized single-line text.
 */
export function sanitizeLogText(text: string, maxLength: number = LOG_TEXT_MAX_LENGTH): string {
    const flat = text.replace(LOG_CONTROL_CHARS, ' ').trim();
    return flat.length <= maxLength ? flat : `${flat.slice(0, Math.max(0, maxLength - 1))}…`;
}

// ---------------------------------------------------------------------------
// Host launcher flag/env parsing — N-player extension (012 FR-011/FR-012)
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 8080;

const ALLOWED_PLAYER_COUNTS: readonly (2 | 3 | 4)[] = [2, 3, 4] as const;
// 64 is temporarily disabled (terrain issue #26) — accepted set is 32|48.
const ALLOWED_BOARD_SIZES: readonly (32 | 48 | 64)[] = [32, 48] as const;

/** Write a line to stderr (launcher diagnostics). */
function complain(line: string): void {
    process.stderr.write(`${line}\n`);
}

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
 * Validate a player count string against 2|3|4.
 *
 * @param raw Raw value from flag or env.
 * @returns The validated count, or undefined when invalid (error already printed).
 */
function parsePlayerCount(raw: string): 2 | 3 | 4 | undefined {
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || (value !== 2 && value !== 3 && value !== 4)) {
        complain(`host: --players must be 2, 3, or 4 (got "${raw}")`);
        return undefined;
    }
    return value;
}

/**
 * Validate a board size string against 32|48. `64` is temporarily disabled
 * (terrain generation is unreliable — follow-up issue #26) and rejected with a
 * dedicated message so operators know it is a known limitation, not a typo.
 *
 * @param raw Raw value from flag or env.
 * @returns The validated size, or undefined when invalid (error already printed).
 */
function parseBoardSize(raw: string): 32 | 48 | undefined {
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value)) {
        complain(`host: --board-size must be 32 or 48 (got "${raw}")`);
        return undefined;
    }
    if (value === 64) {
        complain(
            'host: --board-size 64 is temporarily disabled — 64×64 generation is unreliable (terrain issue #26 pending fix)',
        );
        return undefined;
    }
    if (value !== 32 && value !== 48) {
        complain(`host: --board-size must be 32 or 48 (got "${raw}")`);
        return undefined;
    }
    return value;
}

/**
 * Resolve launcher configuration from argv and environment.
 *
 * Additive N-player flags (012 FR-011):
 *   --players N | --player-count N | HOST_PLAYER_COUNT → playerCount (2|3|4, default 2)
 *   --board-size S | --boardSize S | HOST_BOARD_SIZE   → boardSize (32|48; 64 temporarily disabled per terrain issue #26; implied BOARD_SIZE_DEFAULTS[playerCount] when absent)
 *
 * Single-port invariant (012 FR-012): HOST_STATIC_PORT / --static-port are
 * unsupported — passing them fails fast with a clear error and no second listener.
 *
 * Validation occurs before binding.
 *
 * @param args        Raw argv slice after the script path.
 * @param environment Process environment (overridable for tests).
 * @returns The resolved settings, or null when an argument was invalid
 *          (its error has already been printed).
 */
export function resolveConfig(
    args: readonly string[],
    environment: NodeJS.ProcessEnv = process.env,
): NPlayerHostConfig | null {
    // FR-012: second-port surface stays removed — fail fast when present.
    const staticEnv = environment.HOST_STATIC_PORT;
    if (staticEnv !== undefined && staticEnv !== '') {
        complain(
            'host: --static-port / HOST_STATIC_PORT no longer supported — the server uses a single port (HOST_PORT / --port); no second listener',
        );
        return null;
    }

    let port = parsePort(environment.HOST_PORT, 'HOST_PORT');
    let bindHost = environment.HOST_BIND_HOST ?? '127.0.0.1';
    let publicHost = environment.HOST_PUBLIC_HOST;

    // N-player flag raw captures (env fallback only when neither flag present).
    let playersFlagRaw: string | undefined;
    let boardSizeFlagRaw: string | undefined;

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === undefined) {
            continue;
        }
        const eq = arg.indexOf('=');
        const flag = eq === -1 ? arg : arg.slice(0, eq);
        const inline = eq === -1 ? undefined : arg.slice(eq + 1);

        // Second-port rejection — both --static-port and --static-port=... forms.
        if (flag === '--static-port') {
            complain(
                'host: --static-port / HOST_STATIC_PORT no longer supported — the server uses a single port (HOST_PORT / --port); no second listener',
            );
            return null;
        }

        if (flag === '--players' || flag === '--player-count') {
            const raw = inline ?? args[i + 1];
            if (raw === undefined || raw === '') {
                complain(`host: ${flag} requires a value`);
                return null;
            }
            playersFlagRaw = raw;
            if (inline === undefined) {
                i += 1;
            }
            continue;
        }

        if (flag === '--board-size' || flag === '--boardSize') {
            const raw = inline ?? args[i + 1];
            if (raw === undefined || raw === '') {
                complain(`host: ${flag} requires a value`);
                return null;
            }
            boardSizeFlagRaw = raw;
            if (inline === undefined) {
                i += 1;
            }
            continue;
        }

        if (flag === '--port') {
            const parsed = parsePort(inline ?? args[i + 1], flag);
            if (parsed === undefined) {
                return null;
            }
            if (parsed === null) {
                complain(`host: ${flag} requires a value`);
                return null;
            }
            port = parsed;
            if (inline === undefined) {
                i += 1;
            }
            continue;
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
            if (flag === '--bind-host') {
                bindHost = value;
            } else {
                publicHost = value;
            }
            if (inline === undefined) {
                i += 1;
            }
            continue;
        }

        if (flag === '--create') {
            if (inline !== undefined) {
                complain('host: --create does not take a value');
                return null;
            }
            continue;
        }

        complain(
            `host: unknown argument "${arg}" (supported: --create, --port N, --bind-host HOST, --public-host HOST, --players N, --player-count N, --board-size S, --boardSize S)`,
        );
        return null;
    }

    if (port === undefined) {
        return null;
    }

    if (isWildcardHost(bindHost) && publicHost === undefined) {
        complain('host: --public-host or HOST_PUBLIC_HOST is required when binding a wildcard address');
        return null;
    }

    // Resolve playerCount: flag > env > default 2.
    let playerCount: 2 | 3 | 4;
    if (playersFlagRaw !== undefined) {
        const parsed = parsePlayerCount(playersFlagRaw);
        if (parsed === undefined) {
            return null;
        }
        playerCount = parsed;
    } else if (environment.HOST_PLAYER_COUNT !== undefined && environment.HOST_PLAYER_COUNT !== '') {
        const parsed = parsePlayerCount(environment.HOST_PLAYER_COUNT);
        if (parsed === undefined) {
            return null;
        }
        playerCount = parsed;
    } else {
        playerCount = 2;
    }

    // Validate that the defaults map actually contains the resolved playerCount
    // (defensive — BOARD_SIZE_DEFAULTS is typed for 2|3|4).
    if (!ALLOWED_PLAYER_COUNTS.includes(playerCount)) {
        complain(`host: --players must be 2, 3, or 4 (got "${String(playerCount)}")`);
        return null;
    }

    // Resolve boardSize: flag > env > implied BOARD_SIZE_DEFAULTS[playerCount].
    let boardSize: 32 | 48 | 64;
    if (boardSizeFlagRaw !== undefined) {
        const parsed = parseBoardSize(boardSizeFlagRaw);
        if (parsed === undefined) {
            return null;
        }
        boardSize = parsed;
    } else if (environment.HOST_BOARD_SIZE !== undefined && environment.HOST_BOARD_SIZE !== '') {
        const parsed = parseBoardSize(environment.HOST_BOARD_SIZE);
        if (parsed === undefined) {
            return null;
        }
        boardSize = parsed;
    } else {
        const implied = BOARD_SIZE_DEFAULTS[playerCount];
        // BOARD_SIZE_DEFAULTS is 32|48 (64 temporarily disabled), so this is always valid.
        if (implied !== 32 && implied !== 48) {
            complain(`host: --board-size must be 32 or 48 (got "${String(implied)}")`);
            return null;
        }
        boardSize = implied;
    }

    if (!ALLOWED_BOARD_SIZES.includes(boardSize)) {
        complain(`host: --board-size must be 32 or 48 (got "${String(boardSize)}")`);
        return null;
    }

    const resolvedPort = port ?? DEFAULT_PORT;

    return {
        bindHost,
        publicHost: publicHost ?? (bindHost === '127.0.0.1' ? 'localhost' : bindHost),
        port: resolvedPort,
        wsPort: resolvedPort,
        playerCount,
        boardSize,
    };
}
