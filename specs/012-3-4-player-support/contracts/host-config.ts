/**
 * Contract mirror — NPlayerHostConfig (012)
 *
 * Informational mirror of the additive host shape that lives in
 * `packages/console/scripts/host-config.ts`.
 *
 * This file is NOT the source of truth — it documents the flag/env
 * parsing contract for reviewers (see FR-011/FR-012, research.md §4).
 */

// ---------------------------------------------------------------------------
// Existing host shape (011) — unchanged, reproduced for context
// ---------------------------------------------------------------------------

/** Base host config from 011 single-port host (one http.Server on HOST_PORT). */
export interface HostConfig {
    readonly bindHost: string;
    readonly publicHost: string;
    readonly port: number;
    /** Deprecated alias for `port` — single-port invariant (011). */
    readonly wsPort: number;
}

// ---------------------------------------------------------------------------
// Additive for 012 (FR-011)
// ---------------------------------------------------------------------------

/** Extended config wired through `resolveConfig` → `buildStack` → `prepareMatch`. */
export interface NPlayerHostConfig extends HostConfig {
    /** Requested player count — drives match creation in --create mode. */
    readonly playerCount: 2 | 3 | 4;
    /** Requested board edge — drives match creation in --create mode. */
    readonly boardSize: 32 | 48 | 64;
}

/**
 * Flag/env parsing contract (summary — see `scripts/host-config.ts` + `scripts/host.ts`
 * for the authoritative implementation):
 *
 *   --players N | --player-count N | $HOST_PLAYER_COUNT  → playerCount (2|3|4, default 2)
 *   --board-size S | --boardSize S | $HOST_BOARD_SIZE     → boardSize (32|48|64, implied BOARD_SIZE_DEFAULTS[playerCount] when absent)
 *   --static-port / $HOST_STATIC_PORT                     → hard failure (FR-012, unsupported)
 *   invalid value                                         → fail fast, message names flag + allowed set
 *
 * Validation occurs BEFORE binding the http.Server.
 */
export type HostFlagContract = {
    readonly playerCountSources: readonly ['--players', '--player-count', 'HOST_PLAYER_COUNT'];
    readonly boardSizeSources: readonly ['--board-size', '--boardSize', 'HOST_BOARD_SIZE'];
    readonly allowedPlayerCounts: readonly [2, 3, 4];
    readonly allowedBoardSizes: readonly [32, 48, 64];
};
