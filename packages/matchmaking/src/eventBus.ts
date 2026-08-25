/**
 * Internal lifecycle event bus — Feature 006 (T022/T026, FR-012)
 *
 * The minimal pub-sub seam for `MatchStatusChanged` events: a plain
 * listener array with subscribe/emit — no emitter library (constitution
 * Principle V: simplicity over cleverness). The matchmaker owns one
 * bus instance; lifecycle transitions receive its `emit` as an
 * optional callback so the transition functions stay pure (they never
 * reach into module state).
 *
 * In v1 the matchmaker itself subscribes nothing; later waves forward
 * these events onto the network transport (FR-012: "all lifecycle
 * transitions MUST be observable via protocol messages").
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { MatchId } from '@europa/networking';

import type { MatchStatus } from '../contracts/match-types';

/**
 * Emitted on every lifecycle transition (FR-012). `from` is `null`
 * for the synthetic creation transition into `'filling'`.
 */
export interface MatchStatusChangedEvent {
    /** The match whose status changed. */
    readonly matchId: MatchId;
    /** Previous status, or `null` for creation. */
    readonly from: MatchStatus | null;
    /** New status. */
    readonly to: MatchStatus;
    /** Epoch ms of the transition (caller-supplied; never clock-read). */
    readonly atMs: number;
}

/** Listener signature for {@linkcode StatusEventBus.subscribe}. */
export type MatchStatusListener = (event: MatchStatusChangedEvent) => void;

/**
 * Minimal publish-subscribe seam for status events. `subscribe`
 * returns an unsubscribe function; emitting to zero listeners is a
 * cheap no-op.
 */
export interface StatusEventBus {
    /** Publish an event to every current listener. */
    emit(event: MatchStatusChangedEvent): void;
    /** Register a listener; returns its unsubscribe function. */
    subscribe(listener: MatchStatusListener): () => void;
}

/**
 * Create a fresh event bus backed by a plain listener array.
 *
 * @returns A frozen {@linkcode StatusEventBus}.
 */
export function createStatusBus(): StatusEventBus {
    const listeners: MatchStatusListener[] = [];

    return Object.freeze({
        emit(event: MatchStatusChangedEvent): void {
            for (const listener of listeners) {
                listener(event);
            }
        },
        subscribe(listener: MatchStatusListener): () => void {
            listeners.push(listener);
            let active = true;
            return () => {
                if (!active) {
                    return;
                }
                active = false;
                const index = listeners.indexOf(listener);
                if (index >= 0) {
                    listeners.splice(index, 1);
                }
            };
        },
    });
}
