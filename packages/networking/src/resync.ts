/**
 * ResyncBuffer — Feature 004 US2 (T038)
 *
 * Bounded ring buffer of `{ tick, view }` pairs backing the reconnect
 * resync stream (US2 AC-1 "subsequent tick deltas"; FR-006). The
 * server pushes every boundary's fog-filtered view for a seat into
 * the seat's buffer; on reconnect it replays `getSince(prevTick)` as
 * `tick` envelopes so the client's stream bridges the gap its dropped
 * connection never saw.
 *
 * Depth is `NETWORK_CONSTANTS.replayRingBufferTicks` (16): reconnects
 * after more than 16 missed ticks still resync correctly because the
 * snapshot envelope carries the full current view first and every
 * replayed payload is self-contained (a complete PlayerView, not a
 * diff) — see `TickBroadcastPayload` in the wire contract.
 *
 * Storage follows the task shape: a `Map<SequenceNumber, {tick, view}>`
 * keyed by tick (ticks ARE the match's monotonic sequence) with
 * monotonic `firstTick` / `lastTick` cursors; pushing past the depth
 * evicts the entry at `firstTick`.
 *
 * Ownership: buffers are per-MatchChannel (one per seated player),
 * NEVER per-connection — a seat survives disconnects, so its buffer
 * keeps recording while no connection is attached, and a reconnecting
 * client sees exactly the stream its seat produced.
 *
 * Purity (constitution Principle II): no clock reads, no randomness.
 */

import { NETWORK_CONSTANTS } from './constants';
import type { PlayerView, SequenceNumber } from './contracts/network-types';

/** One retained tick: the boundary number plus the seat's full view. */
export interface ResyncEntry {
  readonly tick: number;
  readonly view: PlayerView;
}

/**
 * Ring buffer of recent per-seat tick views. Construct one per
 * (match channel × player seat); push once per tick boundary.
 */
export class ResyncBuffer {
  /**
   * Maximum retained entries. Static so tests can assert lockstep
   * with `NETWORK_CONSTANTS.replayRingBufferTicks` without building
   * an instance.
   */
  static readonly depth: number = NETWORK_CONSTANTS.replayRingBufferTicks;

  /** Retained entries keyed by tick (the match's monotonic sequence). */
  private readonly entries = new Map<SequenceNumber, ResyncEntry>();

  /** Lowest retained tick (eviction cursor); meaningless when empty. */
  private firstTickValue = 0;

  /** Highest pushed tick; `-1` while empty. */
  private lastTickValue = -1;

  /**
   * Append one boundary. Pushing past {@link ResyncBuffer.depth}
   * evicts the entry at `firstTick`. Re-pushing an existing tick
   * overwrites in place (the eviction cursor is unchanged; the
   * high-water cursor still refreshes — see below).
   *
   * @param tick The boundary just broadcast (monotonic).
   * @param view The seat's fog-filtered view at that boundary.
   */
  push(tick: number, view: PlayerView): void {
    if (!this.entries.has(tick as SequenceNumber)) {
      if (this.entries.size === 0) {
        this.firstTickValue = tick;
      }
      if (this.entries.size >= ResyncBuffer.depth) {
        this.entries.delete(this.firstTickValue as SequenceNumber);
        this.firstTickValue += 1;
        // Advance past any gap (defensive: pushes are expected dense).
        while (
          !this.entries.has(this.firstTickValue as SequenceNumber) &&
          this.firstTickValue < tick
        ) {
          this.firstTickValue += 1;
        }
      }
    }
    // Review N6: refresh the high-water cursor on EVERY push —
    // including overwrite-repushes — so latestTick()/getSince() can
    // never lag the newest content regardless of caller push
    // discipline. (Under strictly monotonic pushes an existing entry
    // always satisfies tick ≤ lastTickValue; the unconditional max
    // makes that invariant explicit instead of load-bearing.)
    this.lastTickValue = Math.max(this.lastTickValue, tick);
    this.entries.set(tick as SequenceNumber, { tick, view });
  }

  /**
   * Entries with `tick > given`, ascending. These are the replayed
   * "subsequent tick deltas" of US2 AC-1.
   *
   * @param tick The caller's last-seen boundary (exclusive lower bound).
   * @returns Ascending `{ tick, view }` entries (empty when none).
   */
  getSince(tick: number): readonly ResyncEntry[] {
    const result: ResyncEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.tick > tick) {
        result.push(entry);
      }
    }
    // Map iteration is insertion order; pushes are monotonic, but the
    // explicit sort keeps the contract independent of that invariant.
    return result.sort((a, b) => a.tick - b.tick);
  }

  /**
   * Highest stored tick, or `-1` when nothing has been pushed yet
   * (ticks start at 1, so the sentinel is unambiguous).
   *
   * @returns Highest stored tick or -1 when empty.
   */
  latestTick(): number {
    return this.lastTickValue;
  }

  /**
   * Drop everything (called on match terminal). The buffer stays
   * usable for a subsequent match lifecycle on the same object.
   */
  clear(): void {
    this.entries.clear();
    this.firstTickValue = 0;
    this.lastTickValue = -1;
  }
}
