/**
 * Performance Integration Test — Feature 004 Polish (T049)
 *
 * SC-005 sustained-cadence soak (measurement protocol per spec
 * Clarifications v1.1): one 2-player match at the DEFAULT 250 ms
 * cadence runs a ~10 s window (~40 scheduler fires); the test rides
 * along for 38 tick broadcasts, submitting a scripted order every
 * 5 ticks, and asserts:
 *
 *   (a) **Zero dropped ticks** — received tick numbers are strictly
 *       contiguous (+1 each); the scheduler never lost a boundary.
 *   (b) **Median per-tick processing well under budget** — the plan's
 *       per-tick server-side budget is 15 ms; the median of the
 *       per-tick duration samples must stay under it.
 *   (c) **Generous p99 regression guard** — raw p99 over shared-CI
 *       runners is dominated by scheduler stalls (the fog SC-004
 *       lesson), so it carries no budget; a loose 100 ms ceiling still
 *       catches genuine pipeline blowups, which exceed both bounds.
 *   (d) **Deterministic drain intact** — every order submitted in the
 *       window is acked exactly once with `ok: true` and the echoed
 *       client seq, none lost or duplicated.
 *
 * Timing samples come from the server's own instrumentation
 * (`stats().lastTickDurationMs`, recorded by the scheduler after each
 * fire) — read after each received broadcast. The value may lag the
 * just-received tick by one boundary; for distribution statistics
 * over ~38 samples that skew is immaterial.
 *
 * Wall-clock note: this test intentionally spends ~10 s of real time;
 * it carries an explicit 25 s timeout so slow CI runners cannot trip
 * vitest's 10 s default.
 */

import { describe, expect, it } from 'vitest';

import { createMatchServer } from '../../src/server';
import type { OrderAckPayload } from '../../src/types';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';
import { connectMockClient, realDeps, scriptedPipeOrder, testServerConfig } from './harness';

/** The production cadence under test (4 Hz). */
const TICK_MS = 250;

/**
 * Tick broadcasts to ride (~10 s window). 40 fires are expected in
 * 10 s; collecting 38 leaves boot/join slop without weakening the
 * zero-drop contiguity check.
 */
const TARGET_TICKS = 38;

/** Plan.md per-tick server-side budget (ms) — carried by the median. */
const MEDIAN_BUDGET_MS = 15;

/** Regression-guard ceiling for p99 (ms). Generous by design. */
const P99_GUARD_MS = 100;

/** Submit a scripted order every Nth tick (≈0.2 orders/tick). */
const ORDER_EVERY_N_TICKS = 5;

/** Percentile helper over a sample array (must be pre-sorted). */
function percentile(sorted: readonly number[], p: number): number {
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[index] ?? 0;
}

describe('SC-005 sustained-cadence soak (T049)', () => {
    it(`${String(TARGET_TICKS)} ticks at ${String(TICK_MS)} ms cadence: zero drops, median < ${String(MEDIAN_BUDGET_MS)} ms, p99 < ${String(P99_GUARD_MS)} ms guard, drain intact`, {
        timeout: 25_000,
    }, async () => {
        const server = createMatchServer(
            // Default cadence; rate limit raised out of the picture (it is
            // T048's subject) so the soak measures the tick pipeline only.
            { ...testServerConfig(), tickRateMs: TICK_MS },
            realDeps(),
        );
        await server.listen();
        try {
            const match = scriptedMatch({ boardSize: 16, tickRateMs: TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });
            attachPlayersForMatch(server, match);

            const client = connectMockClient(server);
            client.hello();
            await client.nextMessage('helloAck');
            client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
            await client.nextMessage('joinAck');

            const tickNumbers: number[] = [];
            const durationsMs: number[] = [];
            // Client seq ledger: hello=1, joinMatch=2, orders continue.
            let nextOrderSeq = 2;
            const submittedSeqs: number[] = [];

            for (let i = 0; i < TARGET_TICKS; i += 1) {
                const frame = await client.nextMessage('tick', 5_000);
                const tickNumber = (frame.payload as { tick: number }).tick;
                tickNumbers.push(tickNumber);
                durationsMs.push(server.stats().lastTickDurationMs);

                // Scripted load: one order every 5th tick, stopped early
                // enough that its ack lands inside the collection window.
                if (tickNumber % ORDER_EVERY_N_TICKS === 0 && tickNumber <= 35) {
                    client.order(scriptedPipeOrder(1, submittedSeqs.length));
                    nextOrderSeq += 1;
                    submittedSeqs.push(nextOrderSeq);
                }
            }

            // (a) Zero dropped ticks: strictly contiguous numbering.
            for (let i = 1; i < tickNumbers.length; i += 1) {
                expect(tickNumbers[i]).toBe((tickNumbers[i - 1] ?? 0) + 1);
            }

            // (b)/(c) Timing gates + summary via assertion message (fog
            // Q-F07 pattern: stats ride the message, not console). Peak is
            // reported for telemetry but carries no gate — a single
            // runner-stall outlier must not fail an otherwise healthy
            // distribution (same rationale as the p99 guard).
            const sorted = [...durationsMs].sort((a, b) => a - b);
            const median = percentile(sorted, 0.5);
            const p99 = percentile(sorted, 0.99);
            const peak = server.stats().peakTickDurationMs;
            const summary =
                `${String(tickNumbers.length)} ticks | median=${median.toFixed(3)}ms ` +
                `p99=${p99.toFixed(3)}ms peak=${peak.toFixed(3)}ms`;
            expect(median, summary).toBeLessThan(MEDIAN_BUDGET_MS);
            expect(p99, summary).toBeLessThan(P99_GUARD_MS);

            // (e) Deterministic drain intact: every submitted order was
            // applied exactly once with the echoed client seq (the ack
            // payload's `seq` correlates to the submission envelope).
            // All acks for submissions up to tick 35 are emitted by the
            // tick-36 boundary, safely inside the collected window.
            const ackFrames = client.socket.sentFrames.filter((f) => f.type === 'orderAck');
            expect(ackFrames.map((f) => (f.payload as OrderAckPayload).seq)).toEqual(submittedSeqs);
            for (const frame of ackFrames) {
                expect((frame.payload as OrderAckPayload).result.ok).toBe(true);
            }

            // No protocol errors slipped into the soak window.
            expect(client.socket.sentFrames.filter((f) => f.type === 'error')).toHaveLength(0);
        } finally {
            await server.close();
        }
    });
});
