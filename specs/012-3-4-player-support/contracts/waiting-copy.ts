/**
 * Contract mirror — N-aware waiting copy (012)
 *
 * Informational mirror of the pure helper that lives in
 * `packages/console/src/state/awaiting-start.ts` alongside the
 * unchanged `isAwaitingMatchStart` predicate (005 item 11).
 *
 * See FR-005 / research.md §2 / data-model.md §3.
 */

/**
 * Produce the N-aware waiting string for a filling room with
 * `seatsFilled` of `capacity` seats occupied (1 ≤ k < N).
 *
 *   k/N remaining = N-k
 *     remaining === 1 → "Waiting for 1 more player… (k/N)"   (singular)
 *     remaining > 1   → "Waiting for N-k more players… (k/N)" (plural)
 *
 * @param seatsFilled currently occupied seats (k)
 * @param capacity total seats (N, 2|3|4)
 * @returns the headline string rendered inside WaitingOverlay
 */
export function formatWaitingMessage(seatsFilled: number, capacity: number): string {
    const remaining = capacity - seatsFilled;
    if (remaining === 1) return `Waiting for 1 more player… (${seatsFilled}/${capacity})`;
    return `Waiting for ${remaining} more players… (${seatsFilled}/${capacity})`;
}

/**
 * Predicate contract — unchanged from 005 (reproduced for completeness):
 *
 *   isAwaitingMatchStart(state) ⇔ status==='live' && (latestView===null || latestView.tick===0)
 *
 * The overlay renders `formatWaitingMessage(k,N)` exactly when this predicate holds;
 * it self-hides on first tick≥1 or status change (never stacks with reconnecting/game-over).
 */
