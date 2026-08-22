/**
 * Protocol-Level Error Hierarchy — Feature 004
 *
 * `NetworkError` represents a **protocol-level** rejection: something
 * wrong with the wire conversation itself (version mismatch per
 * FR-004, malformed JSON or schema violation, unknown message kind,
 * sequence misuse, rate limiting per FR-010, token problems per
 * FR-007, spectator read-only violations per US3).
 *
 * It is deliberately distinct from an **engine-level** rejection:
 * when a client submits a well-formed `order` envelope whose payload
 * the engine rejects (e.g., pipe into water), the server replies with
 * an `orderAck` whose `result.ok` is `false` carrying the engine's
 * `ValidationError` — NOT a `NetworkError`. The wire distinction is
 * documented on `ErrorPayload` in `contracts/network-types.ts`.
 *
 * Pure module: no I/O, no clock reads, no randomness.
 */

import type { ErrorCode } from './contracts/network-types';

/**
 * Alias of the contract's closed `ErrorCode` union, re-declared under
 * a networking-module name so call sites can annotate with the same
 * union without importing from the contracts path directly. Adding a
 * code = minor version bump of `NETWORK_API_VERSION` (additive but
 * documented — see `ErrorCode` JSDoc in the contract).
 */
export type NetworkErrorCode = ErrorCode;

/**
 * Detail bag carried alongside an error code. Values are restricted
 * to JSON-safe primitives so the error can be serialized into an
 * `ErrorPayload.detail` verbatim.
 */
export type NetworkErrorDetail = Readonly<Record<string, string | number | boolean>>;

/**
 * A protocol-level rejection. Thrown by the framing/validation layer
 * (`frame.ts`, `validate.ts`) and convertible to an `ErrorPayload`
 * reply at the connection boundary (US1, Wave 6B).
 *
 * @example
 * ```ts
 * throw new NetworkError('version_mismatch', 'major version drift', {
 *   expected: NETWORK_API_VERSION,
 *   received: '9.0.0',
 * });
 * ```
 */
export class NetworkError extends Error {
  /** Machine-readable rejection code (closed union, see `ErrorCode`). */
  readonly code: NetworkErrorCode;

  /**
   * Optional machine-readable detail (e.g., expected vs actual
   * protocol version). Declared `declare` so no runtime property is
   * emitted for the common case — the field exists on an instance
   * only when provided, keeping serialized payloads minimal.
   */
  declare readonly detail?: NetworkErrorDetail;

  /**
   * @param code    Stable error code from the closed `ErrorCode` union.
   * @param message Human-readable description (safe to log; never
   *                include secrets — there are none at this layer).
   * @param detail  Optional structured context for clients and logs.
   */
  constructor(code: NetworkErrorCode, message: string, detail?: NetworkErrorDetail) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    // With `exactOptionalPropertyTypes`, assigning `undefined` to an
    // optional property is a type error — assign only when present.
    if (detail !== undefined) {
      this.detail = detail;
    }
  }
}

/**
 * Type guard for `NetworkError`. Useful in `catch` blocks where the
 * caught value is `unknown` (no `any`, per constitution Principle I).
 *
 * @param value Any caught or foreign value.
 * @returns `true` iff `value` is a `NetworkError` instance.
 */
export function isNetworkError(value: unknown): value is NetworkError {
  return value instanceof NetworkError;
}
