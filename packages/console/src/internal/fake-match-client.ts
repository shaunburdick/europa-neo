/**
 * FakeMatchClient test double — Feature 005 (T049/T052 seam).
 *
 * Records every `sendOrder` call so unit/E2E suites can assert the
 * exact wire `Order` shapes produced by the input pipeline (US2 AC-1..4,
 * US3 AC-1..3) without a live server. Also carries the seq→ActionId
 * correlation map shape the shipped adapter exposes, so the order
 * bridge (T056) can be exercised end-to-end.
 *
 * Lives under `src/internal/` (not `tests/fixtures/`) because the E2E
 * demo runtime (`main.tsx`'s `?e2e` branch) injects it at runtime —
 * src cannot import from tests/ (tsconfig excludes).
 *
 * Deterministic: no timers, no randomness.
 *
 * @internal Test scaffolding; never part of the production boot path.
 */

import type { ActionId, ConsoleClient, NetworkPayload, Order, ProtocolEnvelope, SequenceNumber } from '../state/types';

/** One recorded outbound order. */
export interface RecordedOrder {
    readonly actionId: ActionId;
    readonly order: Order;
}

/**
 * Minimal in-memory stand-in for the console's network adapter.
 * Satisfies the {@link OrderBridgeClient} structural subset of
 * {@link ConsoleClient} that `createOrderBridge` consumes.
 */
export class FakeMatchClient {
    /** Every order submitted through {@link sendOrder}, in send order. */
    readonly sent: RecordedOrder[] = [];

    /**
     * Wire seq → ActionId map (mirrors `ConsoleClientImpl.seqToActionId`)
     * so envelope-driven ack correlation can be tested.
     */
    readonly seqToActionId = new Map<SequenceNumber, ActionId>();

    private nextSeq = 0;

    private readonly handlers = new Set<(envelope: ProtocolEnvelope<NetworkPayload>) => void>();

    /**
     * Record the order and assign the next wire seq (correlation map
     * kept in sync exactly like the real adapter). Resolves immediately.
     */
    sendOrder(actionId: ActionId, order: Order): Promise<void> {
        this.nextSeq += 1;
        const seq = this.nextSeq as SequenceNumber;
        this.seqToActionId.set(seq, actionId);
        this.sent.push({ actionId, order });
        return Promise.resolve();
    }

    /**
     * Subscribe to inbound envelopes. Returns the unsubscribe function
     * (mirrors feature 004's `onMessage` pattern).
     */
    onEnvelope(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }

    /**
     * Deliver an inbound envelope to every subscriber (test driver for
     * ack/tick flows through the bridge).
     */
    emit(envelope: ProtocolEnvelope<NetworkPayload>): void {
        for (const handler of this.handlers) {
            handler(envelope);
        }
    }

    /** Snapshot of recorded orders (assertion convenience). */
    get orders(): readonly RecordedOrder[] {
        return this.sent;
    }
}
