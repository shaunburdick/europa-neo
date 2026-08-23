/**
 * Dispatch → network bridge — Feature 005 (T056).
 *
 * The ONLY console code that talks to the network client (data-model.md
 * §13, spec US2 AC-1 + FR-006). Two directions:
 *
 *   1. Outbound: the store's effect sink forwards reducer effects
 *      here; `sendOrder` effects become `client.sendOrder(actionId,
 *      order)` calls. All other effect kinds (`announce`, `playSound`,
 *      `persistQol`, `scheduleReconnect`, …) belong to the Phase 8
 *      runtime and are ignored here.
 *   2. Inbound: the bridge subscribes to the client's envelopes,
 *      translates each through `netEventFromEnvelope` (T031) with the
 *      seq→ActionId correlation context, and dispatches the resulting
 *      `NetEvent` — including `orderAck` — into the store, where the
 *      reducer formats feedback / rejection history (FR-006/FR-007).
 *
 * Correlation ownership: wire sequence numbers are assigned by the
 * adapter (`ConsoleClientImpl.sendOrder`), which exposes its
 * `seqToActionId` map; the bridge reads that map live when building
 * each {@link EnvelopeContext}. Test doubles may supply their own map.
 *
 * Send failures are logged and swallowed at the bridge: a rejected
 * `sendOrder` promise means no ack will arrive, and the reducer's
 * pending-order table self-heals on the next ack for a newer action.
 */

import { NULL_LOGGER } from '../../contracts/console-api';
import { netEventFromEnvelope } from '../net/envelope-to-event';
import type { ConsoleStore } from './store';
import type {
  ActionId,
  ConsoleClient,
  ConsoleLogger,
  Order,
  ReducerEffect,
  SequenceNumber,
} from './types';

/**
 * The client surface the bridge needs. Structural subset of
 * {@link ConsoleClient} plus the adapter's correlation map (present
 * on the shipped adapter; optional so test doubles can omit it).
 */
export type OrderBridgeClient = Pick<ConsoleClient, 'sendOrder' | 'onEnvelope'> & {
  /**
   * Wire seq → console ActionId correlation. Read LIVE per envelope
   * so reconnect-time map clears are observed.
   */
  readonly seqToActionId?: ReadonlyMap<SequenceNumber, ActionId> | undefined;
};

/** Arguments for {@link createOrderBridge}. */
export interface OrderBridgeArgs {
  /** The console store (dispatch target for inbound NetEvents). */
  readonly store: ConsoleStore;
  /** The network adapter (structural subset — see {@link OrderBridgeClient}). */
  readonly client: OrderBridgeClient;
  /** Injected logger; defaults to the no-op logger. */
  readonly logger?: ConsoleLogger;
}

/** Handle returned by {@link createOrderBridge}. */
export interface OrderBridge {
  /**
   * Apply one reducer effect. Wire as the store's `onEffect` sink:
   * `createConsoleStore(initial, (effect) => bridge.handleEffect(effect))`.
   * Only `sendOrder` produces I/O; every other kind is a runtime
   * concern and is logged + ignored.
   */
  handleEffect(effect: ReducerEffect): void;
  /** Unsubscribe from envelopes. Idempotent. */
  dispose(): void;
}

/**
 * Create the dispatch → network bridge and subscribe it to the
 * client's envelope stream (US2 AC-1 + FR-006).
 *
 * @param args Store + client + optional logger (see {@link OrderBridgeArgs}).
 */
export function createOrderBridge(args: OrderBridgeArgs): OrderBridge {
  const { store, client } = args;
  const logger = args.logger ?? NULL_LOGGER;
  // Monotonic connection timestamp for the envelope context (the
  // sanctioned UI clock; duration math is a Phase 8 runtime concern).
  const connectedAtMs = performance.now();

  const unsubscribe = client.onEnvelope((envelope) => {
    const event = netEventFromEnvelope(envelope, {
      seqToActionId: client.seqToActionId ?? new Map(),
      connectedAtMs,
      lastAppliedTick: store.getState().latestView?.tick ?? 0,
    });
    if (event !== null) {
      store.dispatch(event);
    }
  });

  return {
    handleEffect(effect: ReducerEffect): void {
      switch (effect.kind) {
        case 'sendOrder': {
          const actionId: ActionId = effect.actionId;
          const order: Order = effect.order;
          client.sendOrder(actionId, order).catch((error: unknown) => {
            // No ack will arrive for this action; log and move on.
            logger.warn('order-actions: sendOrder failed', {
              actionId,
              orderKind: order.kind,
              error,
            });
          });
          return;
        }
        // announce / playSound / persistQol / requestSurrenderConfirm /
        // showErrorModal / scheduleReconnect are Phase 8 runtime concerns.
        default:
          return;
      }
    },
    dispose(): void {
      unsubscribe();
    },
  };
}
