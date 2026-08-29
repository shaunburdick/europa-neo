/**
 * Contract mirror — BoardSizeDefault (012)
 *
 * Informational mirror of the single source map that lives in
 * `packages/matchmaking/src/constants.ts` (and typed in
 * `packages/matchmaking/contracts/match-types.ts`).
 *
 * This file is NOT the source of truth — it exists so reviewers can
 * see the table without chasing the implementation, and so the
 * conformance pin can import both and assert byte-identity.
 *
 * See FR-001 / spec Clarifications Q1 / research.md §1.
 */

/** Product-approved default board edge per player count (FR-001). */
export type PlayerCount = 2 | 3 | 4;

/** Board sizes offered by the lobby/host UI (presentation set; server clamp is [8,128]). */
export type UiBoardSize = 32 | 48 | 64;

/** Single source map — the only place defaults are defined. */
export type BoardSizeDefault = Readonly<Record<PlayerCount, UiBoardSize>>;

/**
 * Canonical defaults — byte-identical to the shipped
 * `BOARD_SIZE_DEFAULTS` in `@europa/matchmaking`.
 */
export const BOARD_SIZE_DEFAULTS: BoardSizeDefault = {
    2: 32,
    3: 48,
    4: 48,
} as const;
