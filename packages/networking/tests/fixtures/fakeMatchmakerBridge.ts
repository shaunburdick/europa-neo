/**
 * Recording Matchmaker Bridge Fixture — Feature 010 test fixture (T-004)
 *
 * The networking-side double for Wave-3 suites (T-010/T-011/T-013): a
 * pure recorder implementing networking's REAL `MatchmakerBridge`
 * contract (`src/contracts/network-api.ts`). Inject it through
 * `ServerDeps.matchmaker` (or `bindMatchmaker`) and assert exactly
 * what the server published when seats are claimed, connections drop
 * or return, grace windows lapse, and matches go terminal — including
 * feature-010's requirement that lobby-driven joins publish the same
 * lifecycle events as the pre-lobby flow.
 *
 * Every invocation is captured twice:
 *
 *   - per-kind arrays (`seatClaimed`, `seatExpired`, …) for targeted
 *     assertions, and
 *   - {@link timeline} — a chronological, kind-tagged log for ORDERING
 *     assertions ("claimed before terminal", "no expiry after
 *     reconnect").
 *
 * Event shapes are EXTRACTED from the contract via `Parameters<…>`
 * indexed access — zero local re-declarations, so upstream contract
 * changes flow into this fixture at compile time.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { MatchmakerBridge } from '../../src/types';

// ----------------------------------------------------------------------------
// Event types extracted from the REAL contract (no re-declares)
// ----------------------------------------------------------------------------

/** Payload of `onSeatClaimed`, extracted from networking's contract. */
export type SeatClaimedEvent = Parameters<NonNullable<MatchmakerBridge['onSeatClaimed']>>[0];
/** Payload of `onSeatDisconnected`, extracted from networking's contract. */
export type SeatDisconnectedEvent = Parameters<NonNullable<MatchmakerBridge['onSeatDisconnected']>>[0];
/** Payload of `onSeatReconnected`, extracted from networking's contract. */
export type SeatReconnectedEvent = Parameters<NonNullable<MatchmakerBridge['onSeatReconnected']>>[0];
/** Payload of `onSeatExpired`, extracted from networking's contract. */
export type SeatExpiredEvent = Parameters<NonNullable<MatchmakerBridge['onSeatExpired']>>[0];
/** Payload of `onMatchTerminal`, extracted from networking's contract. */
export type MatchTerminalEvent = Parameters<NonNullable<MatchmakerBridge['onMatchTerminal']>>[0];

/** One chronological {@link RecordingMatchmakerBridge.timeline} entry. */
export type RecordedBridgeEvent =
    | { readonly kind: 'seatClaimed'; readonly event: SeatClaimedEvent }
    | { readonly kind: 'seatDisconnected'; readonly event: SeatDisconnectedEvent }
    | { readonly kind: 'seatReconnected'; readonly event: SeatReconnectedEvent }
    | { readonly kind: 'seatExpired'; readonly event: SeatExpiredEvent }
    | { readonly kind: 'matchTerminal'; readonly event: MatchTerminalEvent };

// ----------------------------------------------------------------------------
// The recorder
// ----------------------------------------------------------------------------

/**
 * Recording `MatchmakerBridge`. All five handlers are implemented
 * (`Required<MatchmakerBridge>`), so omitting one can never silently
 * swallow an event a suite meant to observe.
 */
export class RecordingMatchmakerBridge implements Required<MatchmakerBridge> {
    /** Every `onSeatClaimed` payload, in arrival order. */
    readonly seatClaimed: SeatClaimedEvent[] = [];
    /** Every `onSeatDisconnected` payload, in arrival order. */
    readonly seatDisconnected: SeatDisconnectedEvent[] = [];
    /** Every `onSeatReconnected` payload, in arrival order. */
    readonly seatReconnected: SeatReconnectedEvent[] = [];
    /** Every `onSeatExpired` payload, in arrival order. */
    readonly seatExpired: SeatExpiredEvent[] = [];
    /** Every `onMatchTerminal` payload, in arrival order. */
    readonly matchTerminal: MatchTerminalEvent[] = [];

    /** Chronological log across all five kinds (for ordering asserts). */
    readonly timeline: RecordedBridgeEvent[] = [];

    /** @inheritdoc */
    onSeatClaimed(event: SeatClaimedEvent): void {
        const frozen = Object.freeze(event);
        this.seatClaimed.push(frozen);
        this.timeline.push({ kind: 'seatClaimed', event: frozen });
    }

    /** @inheritdoc */
    onSeatDisconnected(event: SeatDisconnectedEvent): void {
        const frozen = Object.freeze(event);
        this.seatDisconnected.push(frozen);
        this.timeline.push({ kind: 'seatDisconnected', event: frozen });
    }

    /** @inheritdoc */
    onSeatReconnected(event: SeatReconnectedEvent): void {
        const frozen = Object.freeze(event);
        this.seatReconnected.push(frozen);
        this.timeline.push({ kind: 'seatReconnected', event: frozen });
    }

    /** @inheritdoc */
    onSeatExpired(event: SeatExpiredEvent): void {
        const frozen = Object.freeze(event);
        this.seatExpired.push(frozen);
        this.timeline.push({ kind: 'seatExpired', event: frozen });
    }

    /** @inheritdoc */
    onMatchTerminal(event: MatchTerminalEvent): void {
        const frozen = Object.freeze(event);
        this.matchTerminal.push(frozen);
        this.timeline.push({ kind: 'matchTerminal', event: frozen });
    }

    /** Total events recorded across all five kinds. */
    get totalEvents(): number {
        return this.timeline.length;
    }

    /**
     * Drop every recording. Use between scenarios inside one suite to
     * keep assertions local; prefer constructing a fresh recorder per
     * test where isolation matters more than allocation cost.
     */
    clear(): void {
        this.seatClaimed.length = 0;
        this.seatDisconnected.length = 0;
        this.seatReconnected.length = 0;
        this.seatExpired.length = 0;
        this.matchTerminal.length = 0;
        this.timeline.length = 0;
    }
}
