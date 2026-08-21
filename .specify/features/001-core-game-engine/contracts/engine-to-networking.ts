/**
 * Engine ↔ Networking contract (feature 001 ↔ feature 004).
 *
 * Networking serializes the engine's outputs (full `World`, `TickEvents`,
 * `PlayerView` after fog) into wire-format protocol messages and
 * deserializes `Order` messages back into engine inputs.
 *
 * Boundary rule:
 *   - The engine defines the canonical TypeScript types for orders,
 *     events, and world snapshots. Networking uses these directly
 *     (feature 004 FR-011 — shared types package).
 *   - Networking adds transport-layer concerns (WebSocket framing,
 *     schema versions, sequence numbers, deltas) on top of the engine
 *     types.
 *   - For wire format, networking uses JSON text frames per
 *     feature 004 FR-001, with the engine's TypeScript types as the
 *     in-memory shape and a separate schema-versioned wire form.
 */

import type {
  CellView,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
} from './engine-types';

/**
 * Envelope every wire message carries (feature 004 FR-004 schema version).
 * The engine itself does not see this — it's networking's concern — but
 * the inner payload types must match engine types exactly.
 */
export interface ProtocolEnvelope<TPayload> {
  readonly type: string;
  readonly version: number;       // monotonic per (type)
  readonly seq: number;           // monotonic per session
  readonly payload: TPayload;
}

/**
 * Per-tick broadcast to a recipient. Networking computes the delta
 * (feature 004 FR-006) before sending, but the *shape* of the full
 * payload is defined here so both sides agree.
 */
export interface TickBroadcastPayload {
  readonly tick: number;
  readonly changedCells: ReadonlyArray<CellView>;
  readonly events: TickEvents;
}

/**
 * Full snapshot (feature 004 FR-006 — sent on join / resync).
 */
export interface SnapshotPayload {
  readonly world: Readonly<World>;
}

/**
 * Client → server order submission. Wire form mirrors engine `Order`.
 * `seq` is per-session; networking stamps it.
 */
export interface OrderSubmissionPayload {
  readonly order: Order;
}

/**
 * Server → client acknowledgment. Returns the engine's `CommandResult`.
 */
export interface OrderAckPayload {
  readonly seq: number;
  readonly result: OrderAckResult;
}

export type OrderAckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ValidationError };

/**
 * Server → client match-terminal payload. Networking relays the
 * engine's `MatchResult`.
 */
export interface TerminalPayload {
  readonly result: import('./engine-types').MatchResult;
}

/**
 * Error message envelope (rejections, protocol mismatches, etc.).
 */
export interface ErrorPayload {
  readonly code: string;
  readonly message: string;
}

/**
 * Convenience: the four payload kinds networking transports. The wire
 * format (JSON) is defined by feature 004; this is the TypeScript-level
 * contract.
 */
export type NetworkPayload =
  | TickBroadcastPayload
  | SnapshotPayload
  | OrderAckPayload
  | TerminalPayload
  | ErrorPayload;

// ----------------------------------------------------------------------------
// Re-exports for convenience — networking's protocol code uses these
// types directly without re-defining them.
// ----------------------------------------------------------------------------

export type {
  CellView,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
};
