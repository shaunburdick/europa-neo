/// <reference types="vite/client" />

/**
 * Performance integration suite — Feature 005 (T091, SC-003).
 *
 * Runs in REAL Chromium via Vitest Browser Mode (canvas + DOM
 * required). Thresholds per plan.md "Performance Goals" and
 * quickstart.md §6 (Q-P01..Q-P03):
 *
 *   - Q-P01 `MapCanvas.paint` of a full 32×32 board (1,024 cells):
 *     min-of-round-medians < 8 ms — half of the 16.67 ms/60 fps frame,
 *     leaving headroom for React reconciliation + handlers.
 *   - Q-P02 `reduce(state, action)`: min-of-round-medians < 1 ms
 *     (pure JS, no DOM).
 *   - Q-P04 `localPreflightOrder`: min-of-round-medians < 0.1 ms
 *     (security-relevant gate on the input path).
 *   - Q-P03 initial bundle < 150 KB gzipped: enforced post-build by
 *     `scripts/test-selfhost.sh` (browser tests have no filesystem;
 *     deviation documented in spec Implementation Notes).
 *
 * Methodology (fog SC-004 jitter lesson, hardened after the
 * 2026-08-23 CI-runner throttle incident): warmup first, then ≥5
 * measurement rounds; the asserted statistic is the MIN of round
 * medians — the most jitter-robust estimator for "can this machine
 * hit the budget when not thrashed", because one clean round among
 * throttled ones is enough to pass while sustained slowness still
 * fails the build. Single-shot wall-clock asserts are never used.
 * Observed p50/p99 are printed as a summary.
 *
 * Documented CI slack: shared runners sometimes throttle an ENTIRE
 * test window (every round lands slow — min-of-medians cannot rescue
 * that). `EUROPA_PERF_BUDGET_FACTOR` (read from `import.meta.env`;
 * set via the vitest configs' `test.env`) multiplies ONLY the paint
 * budget; client-ci.yml sets it to 2 where perf tests run. Local runs
 * leave it unset → factor 1 → the spec budget stays strict. See spec
 * 005 Clarifications v1.1.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA } from '../../src/config';
import { MapCanvas } from '../../src/render/canvas';
import { buildMapView } from '../../src/state/build-map-view';
import { localPreflightOrder } from '../../src/state/local-preflight';
import { INITIAL_CONSOLE_STATE, reduce } from '../../src/state/reducer';
import type {
  CellView,
  ConsoleState,
  MapView,
  MapViewId,
  PlayerAction,
  PlayerView,
  ReservesPct,
} from '../../src/state/types';

/** Paint budget: half a 60 fps frame (16.67 ms), in milliseconds. */
const PAINT_BUDGET_MS = 8;

/** Env knob multiplying ONLY the paint budget (documented CI slack). */
const PAINT_BUDGET_FACTOR_ENV = 'EUROPA_PERF_BUDGET_FACTOR';

/**
 * Read the paint-budget factor from `import.meta.env` (injected by
 * the vitest configs' `test.env`; the browser has no `process`
 * global — verified against Vitest 4.1). Defaults to 1; values below
 * 1 are clamped so the knob can only loosen the gate, never tighten
 * it past the spec budget.
 */
function readPaintBudgetFactor(): number {
  const raw: unknown = import.meta.env[PAINT_BUDGET_FACTOR_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return 1;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

/** Reducer budget per action, in milliseconds. */
const REDUCE_BUDGET_MS = 1;

/** Local-preflight budget per order, in milliseconds. */
const PREFLIGHT_BUDGET_MS = 0.1;

/** Board edge for the paint benchmark (32×32 = 1,024 cells). */
const PERF_BOARD = 32;

/**
 * Minimum measurement rounds per benchmark. Fewer rounds cannot
 * distinguish a throttled window from a genuinely slow machine.
 */
const MIN_ROUNDS = 5;

/** Benchmark shape: warmup, then multi-round sampling. */
interface BenchSpec {
  readonly name: string;
  /** One measured operation. */
  readonly run: () => void;
  /** Untimed warmup calls before sampling. */
  readonly warmup: number;
  /**
   * Measurement rounds (≥ {@link MIN_ROUNDS}); the asserted statistic
   * is the MIN of the per-round medians.
   */
  readonly rounds: number;
  /** Timed samples per round. */
  readonly samples: number;
}

interface BenchResult {
  readonly name: string;
  /** Minimum of the per-round median ms (per single operation). */
  readonly minRoundMedianMs: number;
  /** Overall p50 across every timed sample, ms per operation. */
  readonly p50Ms: number;
  /** Overall p99 across every timed sample, ms per operation. */
  readonly p99Ms: number;
}

/**
 * Operations per timed sample, calibrated so one sample takes ≥
 * TARGET_SAMPLE_MS of real work. Headless Chromium clamps
 * `performance.now()` (100 µs–1 ms resolution without cross-origin
 * isolation), so tiny operations MUST be batched or every reading is
 * quantized to zero.
 */
const TARGET_SAMPLE_MS = 5;

/** Upper bound so a pathologically fast op cannot loop forever. */
const MAX_BATCH = 10_000_000;

/**
 * Calibrate the batch size for one operation by doubling until a
 * timed run clears {@link TARGET_SAMPLE_MS}, then linearly scaling.
 */
function calibrateBatch(run: () => void): number {
  let count = 1;
  for (;;) {
    const start = performance.now();
    for (let i = 0; i < count; i += 1) {
      run();
    }
    const elapsedMs = performance.now() - start;
    if (elapsedMs >= TARGET_SAMPLE_MS) {
      const scaled = Math.ceil((count / elapsedMs) * TARGET_SAMPLE_MS);
      return Math.min(MAX_BATCH, Math.max(1, scaled));
    }
    const grown = Math.ceil(
      Math.max(count + 1, count * (TARGET_SAMPLE_MS / Math.max(elapsedMs, 0.01))),
    );
    if (grown > MAX_BATCH) {
      return MAX_BATCH;
    }
    count = grown;
  }
}

/**
 * Percentile of a sample list (nearest-rank). Samples are per-
 * operation milliseconds (batch already divided out).
 */
function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? Number.POSITIVE_INFINITY;
}

/**
 * Run one benchmark: warmup, calibrate the batch against the clock,
 * then timed rounds where each sample times ONE BATCH of operations.
 * Returns per-operation statistics.
 */
function benchmark(spec: BenchSpec): BenchResult {
  if (spec.rounds < MIN_ROUNDS) {
    throw new Error(
      `benchmark "${spec.name}": ${spec.rounds} rounds is below the ` +
        `MIN_ROUNDS=${MIN_ROUNDS} jitter-resistance floor`,
    );
  }
  for (let i = 0; i < spec.warmup; i += 1) {
    spec.run();
  }
  const batch = calibrateBatch(spec.run);
  const roundMedians: number[] = [];
  const allSamples: number[] = [];
  for (let round = 0; round < spec.rounds; round += 1) {
    const samples: number[] = [];
    for (let s = 0; s < spec.samples; s += 1) {
      const start = performance.now();
      for (let i = 0; i < batch; i += 1) {
        spec.run();
      }
      const elapsedMs = (performance.now() - start) / batch;
      samples.push(elapsedMs);
      allSamples.push(elapsedMs);
    }
    roundMedians.push(percentile(samples, 50));
  }
  return {
    name: `${spec.name} [batch=${batch}]`,
    minRoundMedianMs: Math.min(...roundMedians),
    p50Ms: percentile(allSamples, 50),
    p99Ms: percentile(allSamples, 99),
  };
}

/** Assert a threshold against the min-of-round-medians with context. */
function expectUnderBudget(result: BenchResult, budgetMs: number): void {
  expect(
    result.minRoundMedianMs,
    `${result.name}: min-of-round-medians ${result.minRoundMedianMs.toFixed(4)}ms ` +
      `must stay under ${budgetMs}ms (p50 ${result.p50Ms.toFixed(4)}ms, ` +
      `p99 ${result.p99Ms.toFixed(4)}ms)`,
  ).toBeLessThan(budgetMs);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Full-visibility 32×32 PlayerView (every cell populated). Pure. */
function buildFullBoardView(): PlayerView {
  const visibleCells: CellView[] = [];
  for (let y = 0; y < PERF_BOARD; y += 1) {
    for (let x = 0; x < PERF_BOARD; x += 1) {
      visibleCells.push({
        coord: { x, y },
        cell: {
          x,
          y,
          elevation: (x * 7 + y * 13) % 256,
          terrain: (x + y) % 9 === 0 ? 'water' : 'land',
        },
        troopCount: (x + y) % 40,
        troopOwner: (x + y) % 2 === 0 ? 1 : 2,
        pipes: new Set([(y % 2 === 0 ? 'S' : 'N') as 'N' | 'S']),
        reservesPercent: ((x + y) % 10) as ReservesPct,
        cityOwner: (x + y) % 17 === 0 ? 1 : null,
      });
    }
  }
  return {
    player: 1,
    tick: 1,
    visibleCells,
    events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: {
      boardSize: PERF_BOARD,
      playerCount: 2,
      tickIntervalMs: 250,
      seed: 0,
      visibilityRadius: 2,
    },
  };
}

/** Derive the paint-target MapView from the full-board view. */
function buildFullBoardMapView(): MapView {
  return buildMapView({
    id: 'mv-perf' as MapViewId,
    view: buildFullBoardView(),
    camera: DEFAULT_CAMERA,
    hover: { x: 5, y: 5 },
    selection: { x: 3, y: 8 },
    exclusiveMode: false,
    prevView: null,
    nowMs: 250,
  });
}

/** Live seeded state for the reducer benchmark (seated player 1). */
function liveState(): ConsoleState {
  return {
    ...INITIAL_CONSOLE_STATE,
    status: 'live',
    inputEnabled: true,
    session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
  };
}

describe('perf budgets (T091 / SC-003)', () => {
  it('Q-P01: full-board paint stays under the 8 ms frame budget', { timeout: 120_000 }, () => {
    const mapView = buildFullBoardMapView();
    const canvas = document.createElement('canvas');
    canvas.width = mapView.width * mapView.camera.zoom;
    canvas.height = mapView.height * mapView.camera.zoom;
    const ctx = canvas.getContext('2d');
    expect(ctx, 'browser canvas 2D context').not.toBeNull();
    if (ctx === null) {
      return;
    }
    const painter = new MapCanvas();
    // Documented CI slack: the factor multiplies ONLY this budget
    // (default 1 → spec budget unchanged locally).
    const paintBudgetMs = PAINT_BUDGET_MS * readPaintBudgetFactor();
    const result = benchmark({
      name: 'paintFrame(32×32 full board)',
      run: () => painter.paint(mapView, ctx, { reducedMotion: true }),
      warmup: 25,
      rounds: 5,
      samples: 40,
    });
    console.warn(
      `[perf] ${result.name}: min-round-median ${result.minRoundMedianMs.toFixed(3)}ms, ` +
        `p50 ${result.p50Ms.toFixed(3)}ms, p99 ${result.p99Ms.toFixed(3)}ms ` +
        `(budget ${paintBudgetMs}ms)`,
    );
    expectUnderBudget(result, paintBudgetMs);
  });

  it('Q-P02: reduce() stays under the 1 ms budget', { timeout: 120_000 }, () => {
    const action: PlayerAction = { kind: 'setPipe', cell: { x: 3, y: 8 }, direction: 'N' };
    // Sink consumes the pure result so V8 cannot dead-code-eliminate
    // the measured work.
    let sink = 0;
    const result = benchmark({
      name: 'reduce(setPipe)',
      run: () => {
        const step = reduce(liveState(), action, { nowMs: 1000 });
        sink += step.effects.length + step.state.feedback.length;
      },
      warmup: 50,
      rounds: 5,
      samples: 40,
    });
    expect(sink).toBeGreaterThanOrEqual(0);
    console.warn(
      `[perf] ${result.name}: min-round-median ${(result.minRoundMedianMs * 1000).toFixed(1)}µs, ` +
        `p50 ${(result.p50Ms * 1000).toFixed(1)}µs, p99 ${(result.p99Ms * 1000).toFixed(1)}µs ` +
        `(budget ${REDUCE_BUDGET_MS}ms)`,
    );
    expectUnderBudget(result, REDUCE_BUDGET_MS);
  });

  it('Q-P04: localPreflightOrder stays under the 0.1 ms gate', { timeout: 120_000 }, () => {
    const view = buildFullBoardView();
    const order = {
      kind: 'paratroop',
      player: 1,
      source: { x: 3, y: 8 },
      target: { x: 4, y: 9 },
    } as const;
    let sink = 0;
    const result = benchmark({
      name: 'localPreflightOrder(paratroop)',
      run: () => {
        const rejection = localPreflightOrder(order, view, 1);
        sink += rejection === null ? 1 : 0;
      },
      warmup: 50,
      rounds: 5,
      samples: 40,
    });
    expect(sink).toBeGreaterThanOrEqual(0);
    console.warn(
      `[perf] ${result.name}: min-round-median ${(result.minRoundMedianMs * 1000).toFixed(2)}µs, ` +
        `p50 ${(result.p50Ms * 1000).toFixed(2)}µs, p99 ${(result.p99Ms * 1000).toFixed(2)}µs ` +
        `(budget ${PREFLIGHT_BUDGET_MS * 1000}µs)`,
    );
    expectUnderBudget(result, PREFLIGHT_BUDGET_MS);
  });
});
