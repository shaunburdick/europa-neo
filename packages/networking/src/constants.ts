/**
 * Networking Tunable Constants — Feature 004
 *
 * The single source of truth for every numeric rule in the networking
 * package (constitution Principle V; mirrors the engine's
 * `ENGINE_CONSTANTS`, terrain's `TERRAIN_CONSTANTS`, and fog's
 * `FOG_CONSTANTS` discipline). If you find yourself wanting to add a
 * `const FOO = 7` to a networking module — stop. Add it here instead.
 *
 * Values are sourced from:
 *   - spec.md functional requirements (FR-001..FR-011) — cited inline
 *   - `contracts/network-api.ts` `NETWORK_DEFAULT_CONFIG` (the
 *     server-config defaults these constants mirror; a unit test
 *     asserts the two stay in lockstep so the contract copy and this
 *     file cannot drift apart silently)
 *   - plan.md "Risk & Open Questions" §1 for the frame-size cap
 *
 * Determinism note (constitution Principle II): these are transport-
 * layer timing/limit constants only. None of them feed the engine's
 * simulation state; the simulation remains pure. Actual timer usage
 * is confined to `src/clock.ts`, the sanctioned wall-clock boundary.
 */

import { NETWORK_API_VERSION } from './contracts/network-types';

/**
 * Shape of the networking constants object. Mirrors the fields of
 * `ServerConfig` defaults plus transport-level limits that have no
 * config counterpart (`defaultMaxFrameBytes`,
 * `replayRingBufferTicks`).
 */
export interface NetworkConstants {
  /** Wire-protocol version (mirror of `NETWORK_API_VERSION`). */
  readonly networkApiVersion: typeof NETWORK_API_VERSION;
  /**
   * Default tick cadence in ms (4 Hz). Must equal the engine's
   * `MatchConfig.tickIntervalMs` for registered matches (FR-001).
   */
  readonly defaultTickRateMs: number;
  /**
   * Heartbeat interval the server expects (ms). Clients silent for
   * `2 × heartbeatIntervalMs` are marked disconnected (FR-002).
   */
  readonly defaultHeartbeatIntervalMs: number;
  /**
   * Grace window after disconnect (ms) before the seat expires and
   * matchmaking's forfeit policy applies (FR-007, FR-009).
   */
  readonly defaultReconnectGraceMs: number;
  /**
   * Per-connection order rate limit (orders/second) before
   * `'rate_limited'` rejections kick in (FR-010).
   */
  readonly defaultOrdersPerSecond: number;
  /**
   * Token-bucket burst factor. Bucket capacity =
   * `ordersPerSecond × rateLimitBurstFactor` (FR-010).
   */
  readonly defaultRateLimitBurstFactor: number;
  /**
   * Maximum concurrent matches per server process (SC-005 soak
   * headroom for self-hosted boxes).
   */
  readonly defaultMaxConcurrentMatches: number;
  /** WebSocket idle timeout (ms) applied at the socket layer. */
  readonly defaultWsIdleTimeoutMs: number;
  /**
   * Maximum inbound frame size in bytes (16 KiB — the `ws` README's
   * default message-size limit). Frames above this are rejected as
   * `malformed_payload`. Flagged in plan.md "Risk & Open Questions"
   * §1 as the future compression trigger.
   */
  readonly defaultMaxFrameBytes: number;
  /**
   * Ring-buffer depth (in ticks) for the bounded event replay sent
   * on reconnect resync (US2 AC-1; FR-006).
   */
  readonly replayRingBufferTicks: number;
}

/**
 * Networking rule constants. Imported by every networking module.
 * See `NetworkConstants` for per-field JSDoc and spec references.
 */
export const NETWORK_CONSTANTS: NetworkConstants = {
  networkApiVersion: NETWORK_API_VERSION,
  defaultTickRateMs: 250,
  defaultHeartbeatIntervalMs: 5000,
  defaultReconnectGraceMs: 60_000,
  defaultOrdersPerSecond: 10,
  defaultRateLimitBurstFactor: 2.0,
  defaultMaxConcurrentMatches: 64,
  defaultWsIdleTimeoutMs: 30_000,
  defaultMaxFrameBytes: 16_384,
  replayRingBufferTicks: 16,
} as const;

// Re-export the wire-protocol version from its source-of-truth
// location (the contract). Importing the version through the
// constants file lets consumers do
// `import { NETWORK_API_VERSION } from '@europa/networking'`
// regardless of which barrel path they hit first — same pattern as
// fog's `constants.ts` re-exporting `FOG_API_VERSION`.
export { NETWORK_API_VERSION };
