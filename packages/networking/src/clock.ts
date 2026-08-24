/**
 * Monotonic Tick Clock — Feature 004
 *
 * The `setInterval`-driven scheduler primitive: one clock per server
 * (plan.md "Key design decisions" §"Tick scheduler"). Every scheduler
 * fire invokes `onTick` with the 1-based tick number and the wall-
 * clock time of the fire.
 *
 * Determinism discipline (constitution Principle II): this module is
 * THE sanctioned wall-clock boundary for tick logic. `Date.now()`
 * appears exactly once — inside the interval callback — and its value
 * is *passed into* `onTick` as `nowMs`. Downstream handlers must take
 * `nowMs` as a parameter rather than reading clocks themselves, which
 * keeps every pure module testable with injected times and keeps the
 * simulation free of wall-clock reads.
 *
 * The clock is transport-layer infrastructure, not simulation code:
 * it fires callbacks; it never touches engine state.
 */

/**
 * The scheduler handle returned by `createTickClock`.
 */
export interface TickClock {
    /**
     * Begin firing `onTick` every `intervalMs`. Idempotent: calling
     * while already running is a no-op (the interval is not reset).
     */
    start(): void;
    /**
     * Stop firing. Idempotent. The accumulated tick count is retained;
     * a subsequent `start()` resumes from it.
     */
    stop(): void;
    /** Number of fires since creation (starts at 0). */
    tickCount(): number;
    /**
     * Wall-clock epoch ms of the most recent fire, or 0 if the clock
     * has never fired.
     */
    lastTickAtMs(): number;
}

/**
 * Create a tick clock.
 *
 * @param intervalMs Fire cadence in milliseconds. Must be a finite
 *                   positive number; Node clamps sub-1ms values to 1.
 * @param onTick     Callback invoked per fire with the 1-based tick
 *                   number and the fire's wall-clock epoch ms. If the
 *                   callback throws, the error propagates out of the
 *                   interval invocation (the clock keeps ticking;
 *                   server-level error policy lives in US1's server).
 * @returns A `TickClock` handle in the stopped state.
 * @throws RangeError when `intervalMs` is not a finite positive number.
 */
export function createTickClock(intervalMs: number, onTick: (tickNumber: number, nowMs: number) => void): TickClock {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new RangeError(
            `createTickClock: intervalMs must be a finite positive number (got ${String(intervalMs)})`,
        );
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    let count = 0;
    let lastAtMs = 0;

    return {
        start(): void {
            // Idempotent start: never stack a second interval on top of a
            // running one (that would double the effective tick rate).
            if (timer !== undefined) {
                return;
            }
            timer = setInterval(() => {
                count += 1;
                const nowMs = Date.now();
                lastAtMs = nowMs;
                onTick(count, nowMs);
            }, intervalMs);
        },
        stop(): void {
            if (timer !== undefined) {
                clearInterval(timer);
                timer = undefined;
            }
        },
        tickCount(): number {
            return count;
        },
        lastTickAtMs(): number {
            return lastAtMs;
        },
    };
}
