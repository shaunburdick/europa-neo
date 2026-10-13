/**
 * Network-layer tunables — single documented home (005 FR-029).
 *
 * The correlation numbers live here rather than inline at the call
 * site so the bound and the expiry are greppable, quotable from the
 * spec, and impossible to drift apart between call sites. Socket-level
 * tunables (establish timeout) live in `contracts/console-types.ts`,
 * which is the console's single constants file for contract-visible
 * values; these two are adapter-internal.
 */

/**
 * Maximum live `seq → actionId` correlation entries held by the
 * console's network adapter (005 FR-029).
 *
 * Deliberately equal to the reducer's `PENDING_ORDERS_CAP` (64,
 * `state/reducer.ts`): the adapter's table and the reducer's pending
 * table describe the same set of in-flight orders, so one number
 * bounds both and neither can grow past the other's horizon.
 */
export const PENDING_CORRELATION_CAP = 64;

/**
 * Age (ms) after which an UNACKED correlation entry is dropped
 * (005 FR-029's "correlation timeout").
 *
 * Anchored to `CONSOLE_CONSTANTS.reconnectBackoffCapMs` (30 s): once
 * the console has spent that long without a reply, the ack belongs to
 * a connection epoch that is gone — re-correlating it would be a
 * stale answer, and the entry's only remaining value is memory.
 * Wire seqs are monotonic per connection, so an evicted entry can
 * never be silently reused by a later one.
 */
export const CORRELATION_TIMEOUT_MS = 30_000;
