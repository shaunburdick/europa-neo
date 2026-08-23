/**
 * Minimal Phase 1 barrel for `@europa/console`.
 *
 * ⚠️ WHY THIS DOES NOT IMPORT FROM `./contracts/*` (Wave 8A):
 * The four mirrored contract files under `packages/console/contracts/`
 * are ambient-declaration artifacts — e.g. `export const
 * CONSOLE_CONSTANTS: ConsoleConstants;` with no initializer — which is
 * declaration-file syntax. Compiling them as implementation modules
 * fails with TS1155 ("'const' declarations must be initialized"), and
 * even a type-only import pulls the file into the program. They are
 * therefore excluded from the tsconfig program and kept byte-identical
 * to `.specify/features/005-client-console/contracts/` (conformance
 * test lands in the Polish phase).
 *
 * Until Phase 2 populates this barrel from the compilable sources
 * (`src/config.ts`, per task T037), the version constant and the
 * constants shape are declared here, single-sourced against:
 *   - `contracts/console-types.ts:94`  → CONSOLE_API_VERSION = '0.1.0'
 *   - `contracts/console-api.ts:512`   → interface ConsoleConstants
 */

/**
 * Current console API version. Increment on any breaking change to the
 * public surface. Mirrors the engine/fog/networking versioning
 * discipline: every consumer pin-checks at startup.
 */
export const CONSOLE_API_VERSION = '0.1.0' as const;

/**
 * Single tunable-constants location for the console (mirror of the
 * engine's `ENGINE_CONSTANTS` discipline). Structural copy of
 * `contracts/console-api.ts` §"Constants"; the runtime value
 * (`CONSOLE_CONSTANTS`) is implemented in Phase 2's `src/config.ts`.
 */
export interface ConsoleConstants {
  /** Default cell size in CSS pixels. */
  readonly defaultCellPx: number;
  /** Min cell size in CSS pixels. */
  readonly minCellPx: number;
  /** Max cell size in CSS pixels. */
  readonly maxCellPx: number;
  /** Default feedback message TTL in ms. */
  readonly feedbackTtlMs: number;
  /** Default label TTL in ms (e.g., "70%" flash). */
  readonly labelTtlMs: number;
  /** Default effect TTL in ms (e.g., combat flash). */
  readonly effectTtlMs: number;
  /** Maximum feedback messages retained. */
  readonly maxFeedbackMessages: number;
  /** Maximum rejected orders retained in history. */
  readonly maxRejectedOrders: number;
  /** Local rate-limit debounce in orders/second. */
  readonly clientOrderRatePerSec: number;
  /** Reconnect attempt backoff base (ms). */
  readonly reconnectBackoffBaseMs: number;
  /** Reconnect attempt backoff cap (ms). */
  readonly reconnectBackoffCapMs: number;
}
