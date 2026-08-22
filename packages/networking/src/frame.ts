/**
 * JSON Frame Encoding / Decoding — Feature 004
 *
 * The wire format is one JSON document per WebSocket text frame: a
 * `ProtocolEnvelope<NetworkPayload>` (FR-001, FR-003). This module is
 * the only place that touches `JSON.stringify` / `JSON.parse` for
 * protocol traffic.
 *
 * Determinism note (SC-001, protocol level): `JSON.stringify` emits
 * object keys in insertion order per the V8 spec. Every envelope we
 * encode was constructed from readonly interfaces with a fixed field
 * declaration order (`type`, `version`, `seq`, `payload`), so two
 * servers applying the same match script emit byte-identical frames.
 * No replacer/reviver functions are used — they would be silent
 * determinism hazards.
 *
 * Pure module: no I/O, no clock reads, no randomness.
 */

import type { NetworkPayload, ProtocolEnvelope } from './contracts/network-types';

import { isNetworkError, NetworkError } from './errors';
import { validateEnvelope } from './validate';

/**
 * Serialize an outbound envelope to its wire form.
 *
 * @param envelope A fully-formed envelope (type, version, seq, payload).
 * @returns The JSON text to hand to `ws.WebSocket.send`.
 */
export function encodeFrame(envelope: ProtocolEnvelope<NetworkPayload>): string {
  return JSON.stringify(envelope);
}

/**
 * Parse and validate an inbound frame. Throws on any problem — use
 * `tryDecodeFrame` at message-handler boundaries where a reply-and-
 * continue policy is desired instead of exception propagation.
 *
 * @param raw The raw frame text received from the socket.
 * @returns The validated envelope.
 * @throws NetworkError with code `'malformed_payload'` when the text
 *         is not valid JSON or fails schema validation
 *         (`validateEnvelope`).
 */
export function decodeFrame(raw: string): ProtocolEnvelope<NetworkPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NetworkError('malformed_payload', 'frame is not valid JSON');
  }
  validateEnvelope(parsed);
  return parsed;
}

/**
 * Non-throwing decode variant for `ws` message handlers: every
 * failure mode (JSON parse error, schema violation, unexpected
 * internal error) is flattened into `{ ok: false, error }` carrying a
 * `NetworkError`, so the handler can convert it to an `ErrorPayload`
 * reply without try/catch plumbing.
 *
 * @param raw The raw frame text received from the socket.
 * @returns Discriminated result; never throws.
 */
export function tryDecodeFrame(
  raw: string,
): { ok: true; envelope: ProtocolEnvelope<NetworkPayload> } | { ok: false; error: NetworkError } {
  try {
    return { ok: true, envelope: decodeFrame(raw) };
  } catch (error) {
    if (isNetworkError(error)) {
      return { ok: false, error };
    }
    // Defensive: decodeFrame only throws NetworkError today, but the
    // handler boundary must stay total. No `any`, no suppression.
    return {
      ok: false,
      error: new NetworkError('internal_error', 'unexpected frame decoding failure'),
    };
  }
}
