/**
 * US5 a11y acceptance test — Feature 005 (T077).
 *
 * Covers:
 *   · Q-A07 (reduced-motion): with `prefers-reduced-motion: reduce`,
 *     the combat `MapEffect` flash is NOT painted — verified by
 *     querying the rendered canvas pixels (reduced output equals the
 *     no-effect baseline; full motion differs);
 *   · Q-A04 (surrender modal is keyboard-trapped): Tab cycles between
 *     Cancel and Confirm; Escape closes;
 *   · Q-A02 (surrender modal axe scan): zero violations.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { MapCanvas } from '../../src/render/canvas';
import { SurrenderModal } from '../../src/render/SurrenderModal';
import type { MapEffect, MapView } from '../../src/state/types';
import { expectNoDomA11yViolations } from '../setup';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A minimal one-cell MapView carrying a combat flash on that cell. */
function flashView(): MapView {
  return {
    id: 'mv-flash',
    tick: 1,
    width: 2,
    height: 2,
    cells: new Map([
      [
        '0,0',
        {
          coord: { x: 0, y: 0 },
          elevation: 100,
          terrain: 'land',
          troops: 3,
          owner: 1,
          isCity: false,
          cityOwner: null,
          pipes: new Set(),
          reservesPct: 0,
          changedThisTick: false,
        },
      ],
    ]),
    playerColors: { 1: '#dc2626' },
    effects: [
      { kind: 'combat', cell: { x: 0, y: 0 }, expiresAtMs: Number.MAX_SAFE_INTEGER },
    ] satisfies readonly MapEffect[],
    labels: [],
    camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
    hover: null,
    selection: null,
    dragSelection: null,
    exclusiveMode: false,
  };
}

/** Paint `view` into an offscreen canvas and sample the cell center. */
function paintAndSample(view: MapView, reducedMotion: boolean): [number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('no 2d context');
  }
  new MapCanvas().paint(view, ctx, { reducedMotion });
  const { data } = ctx.getImageData(16, 16, 1, 1);
  return [data[0], data[1], data[2]];
}

describe('US5 a11y acceptance (T077)', () => {
  test('(a) reduced motion skips the combat flash entirely', () => {
    const view = flashView();
    // Baseline: the same view WITHOUT effects (terrain + unit only).
    const baseline = paintAndSample({ ...view, effects: [] }, false);
    // Full motion paints the translucent red flash over the cell.
    const full = paintAndSample(view, false);
    expect(full).not.toEqual(baseline);
    // Reduced motion: the flash duration is effectively 0 ms — the
    // painted output equals the no-effect baseline exactly.
    const reduced = paintAndSample(view, true);
    expect(reduced).toEqual(baseline);
  });

  test('(b) the surrender modal traps focus between its buttons', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    await render(createElement(SurrenderModal, { open: true, onConfirm, onCancel }));

    const cancel = document.querySelector<HTMLButtonElement>(
      '.europa-modal__button:not(.europa-modal__button--danger)',
    );
    const confirm = document.querySelector<HTMLButtonElement>('.europa-modal__button--danger');
    expect(cancel).not.toBeNull();
    expect(confirm).not.toBeNull();

    // Focus moves into the dialog on open (first button).
    expect(document.activeElement).toBe(cancel);

    const user = userEvent.setup();
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(confirm);
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(cancel);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(confirm);

    // Escape closes without dispatching.
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('(c) axe finds zero violations on the open surrender modal', async () => {
    await render(
      createElement(SurrenderModal, {
        open: true,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    await expectNoDomA11yViolations(document);
  });
});
