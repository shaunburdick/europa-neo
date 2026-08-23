/**
 * Order-draft unit tests — Feature 005 (T050).
 *
 * Covers the actionToOrder + localPreflight chain from the keyboard
 * side (spec US2 AC-3/4 + FR-004; US3 preflight interplay):
 *   · i/j/k/l toggle N/W/S/E pipes on the focused cell; Alt+key
 *     issues exclusive variants;
 *   · space clears all pipes;
 *   · pipe actions always translate to orders (the engine is final
 *     authority per FR-006);
 *   · paratroop/gun aims run through localPreflightOrder — out-of-
 *     range/water targets are rejected BEFORE any send; enemy cells
 *     are NOT preflight-rejected.
 */

import { describe, expect, test } from 'vitest';

import { DEFAULT_CAMERA, DEFAULT_INPUT_MAPPING } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';
import { shouldIgnoreKeyEvent, translateKey } from '../../../src/input/order-draft';
import type { CursorTarget, Direction, PlayerView } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

/** Friendly anchor cell with an existing north pipe. */
function view(): PlayerView {
  return buildPlayerView({
    width: 16,
    height: 16,
    playerId: 1,
    visibleCells: [
      buildCellView({
        coord: { x: 10, y: 10 },
        elevation: 50,
        troops: 20,
        owner: 1,
        pipes: new Set<Direction>(['N']),
      }),
      // Land target within ring 2 NE of the anchor (12, 8).
      buildCellView({ coord: { x: 12, y: 8 }, elevation: 20 }),
      // Water target within ring 2 SE of the anchor (11, 12).
      buildCellView({ coord: { x: 11, y: 12 }, terrain: 'water' }),
      // Enemy-held land within ring 2 E of the anchor (12, 10).
      buildCellView({ coord: { x: 12, y: 10 }, elevation: 30, troops: 5, owner: 2 }),
    ],
  });
}

function liveState(): ConsoleState {
  const state = createLiveConsoleState(view());
  return { ...state, selection: { x: 10, y: 10 } };
}

/** Cursor sample hovering fraction `(fx, fy)` inside cell (cx, cy). */
function cursorIn(cx: number, cy: number, fx: number, fy: number): CursorTarget {
  return hitTest(
    { x: (cx + fx) * DEFAULT_CAMERA.zoom, y: (cy + fy) * DEFAULT_CAMERA.zoom },
    DEFAULT_CAMERA,
  );
}

const FRESH = 10; // ms — well inside CURSOR_STALE_MS

function baseArgs(overrides?: Partial<Parameters<typeof translateKey>[0]>) {
  return {
    key: 'i',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    state: liveState(),
    cursor: cursorIn(10, 10, 0.5, 0.5),
    cursorAgeMs: FRESH,
    ...overrides,
  } as Parameters<typeof translateKey>[0];
}

describe('pipe keys (US2 AC-3)', () => {
  test('i over a cell whose N pipe exists issues clearPipe N (toggle)', () => {
    const outcome = translateKey(baseArgs());
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'clearPipe', cell: { x: 10, y: 10 }, direction: 'N' },
    });
  });

  test('l issues setPipe E when no east pipe exists', () => {
    const outcome = translateKey(baseArgs({ key: 'l' }));
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'setPipe', cell: { x: 10, y: 10 }, direction: 'E' },
    });
  });

  test('j maps west and k maps south', () => {
    expect(translateKey(baseArgs({ key: 'j' }))).toMatchObject({
      action: { direction: 'W' },
    });
    expect(translateKey(baseArgs({ key: 'k' }))).toMatchObject({
      action: { direction: 'S' },
    });
  });

  test('Alt+i issues setPipesExclusive N (never toggles)', () => {
    const outcome = translateKey(baseArgs({ altKey: true }));
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'setPipesExclusive', cell: { x: 10, y: 10 }, direction: 'N' },
    });
  });

  test('uppercase key events (Shift held) still match', () => {
    const outcome = translateKey(baseArgs({ key: 'I' }));
    expect(outcome).toMatchObject({ action: { kind: 'clearPipe', direction: 'N' } });
  });

  test('no selection → ignore, not-live → ignore', () => {
    expect(translateKey(baseArgs({ state: { ...liveState(), selection: null } }))).toMatchObject({
      kind: 'ignore',
      reason: 'no-selection',
    });

    const offlineState = {
      ...liveState(),
      inputEnabled: false,
      status: 'reconnecting' as const,
    };
    expect(translateKey(baseArgs({ state: offlineState }))).toMatchObject({
      kind: 'ignore',
      reason: 'not-live',
    });
  });
});

describe('space clears all pipes (US2 AC-4)', () => {
  test('space on the focused cell issues clearAllPipes', () => {
    const outcome = translateKey(baseArgs({ key: DEFAULT_INPUT_MAPPING.clearCellPipes }));
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'clearAllPipes', cell: { x: 10, y: 10 } },
    });
  });
});

describe('paratroop / gun through the preflight chain (US3 interplay)', () => {
  test('p with a fresh NE aim issues paratroop to the binned target', () => {
    const outcome = translateKey(
      baseArgs({ key: 'p', cursor: cursorIn(10, 10, 0.85, 0.15) }), // NE ring 2
    );
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'paratroop', source: { x: 10, y: 10 }, target: { x: 12, y: 8 } },
    });
  });

  test('g fires gun to the same computed destination', () => {
    const outcome = translateKey(baseArgs({ key: 'g', cursor: cursorIn(10, 10, 0.85, 0.15) }));
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'gun', source: { x: 10, y: 10 }, target: { x: 12, y: 8 } },
    });
  });

  test('water target is rejected by preflight before any order exists', () => {
    const outcome = translateKey(
      baseArgs({ key: 'p', cursor: cursorIn(10, 10, 0.65, 0.85) }), // S-ish ring 1/2 → water
    );
    expect(outcome).toEqual({
      kind: 'ignore',
      reason: 'preflight-rejected',
      detail: { kind: 'water_target', coord: { x: 11, y: 12 } },
    });
  });

  test('enemy target is NOT preflight-rejected (server is final authority)', () => {
    const outcome = translateKey(
      baseArgs({ key: 'p', cursor: cursorIn(10, 10, 0.85, 0.5) }), // E ring 2 → enemy (12,10)
    );
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'paratroop', source: { x: 10, y: 10 }, target: { x: 12, y: 10 } },
    });
  });

  test('stale cursor aim counts as centered → no launch (research.md §13 #3)', () => {
    const outcome = translateKey(
      baseArgs({ key: 'p', cursor: cursorIn(10, 10, 0.85, 0.15), cursorAgeMs: 5000 }),
    );
    expect(outcome).toEqual({ kind: 'ignore', reason: 'no-launch' });
  });
});

describe('reserves digits + navigation keys', () => {
  test('digit 7 issues setReserves 70% on the focused cell', () => {
    const outcome = translateKey(baseArgs({ key: '7' }));
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'setReserves', cell: { x: 10, y: 10 }, percent: 7 },
    });
  });

  test('digit 0 issues setReserves 0% (clear)', () => {
    const outcome = translateKey(baseArgs({ key: '0' }));
    expect(outcome).toMatchObject({ action: { kind: 'setReserves', percent: 0 } });
  });

  test('arrows move the selection via KeyboardNavigator bounds', () => {
    const outcome = translateKey(baseArgs({ key: 'ArrowLeft' }));
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'selectCell', cell: { x: 9, y: 10 } },
    });
  });

  test('Escape clears the selection', () => {
    const outcome = translateKey(baseArgs({ key: 'Escape' }));
    expect(outcome).toEqual({ kind: 'action', action: { kind: 'selectCell', cell: null } });
  });

  test('unbound keys are ignored', () => {
    expect(translateKey(baseArgs({ key: 'x' }))).toMatchObject({
      kind: 'ignore',
      reason: 'unbound-key',
    });
  });

  test('Ctrl/Meta chords never issue orders', () => {
    expect(translateKey(baseArgs({ ctrlKey: true }))).toMatchObject({
      kind: 'ignore',
      reason: 'unbound-key',
    });
    expect(translateKey(baseArgs({ metaKey: true, key: 'p' }))).toMatchObject({
      kind: 'ignore',
      reason: 'unbound-key',
    });
  });
});

describe('shouldIgnoreKeyEvent (typing-surface + chord guards)', () => {
  test('ignores default-prevented and auto-repeat events', () => {
    expect(shouldIgnoreKeyEvent({ defaultPrevented: true, repeat: false, target: null })).toBe(
      true,
    );
    expect(shouldIgnoreKeyEvent({ defaultPrevented: false, repeat: true, target: null })).toBe(
      true,
    );
  });

  test('ignores keys typed into interactive elements', () => {
    const button = document.createElement('button');
    expect(shouldIgnoreKeyEvent({ defaultPrevented: false, repeat: false, target: button })).toBe(
      true,
    );
    const input = document.createElement('input');
    expect(shouldIgnoreKeyEvent({ defaultPrevented: false, repeat: false, target: input })).toBe(
      true,
    );
  });

  test('ignores contentEditable hosts; plain containers pass', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(shouldIgnoreKeyEvent({ defaultPrevented: false, repeat: false, target: editable })).toBe(
      true,
    );
    const plain = document.createElement('div');
    expect(shouldIgnoreKeyEvent({ defaultPrevented: false, repeat: false, target: plain })).toBe(
      false,
    );
    expect(shouldIgnoreKeyEvent({ defaultPrevented: false, repeat: false, target: null })).toBe(
      false,
    );
  });
});
