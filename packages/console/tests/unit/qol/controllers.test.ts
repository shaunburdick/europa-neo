/**
 * Interaction-controller unit tests — Feature 005 (US5 AC-1, a11y
 * navigation; T097 coverage).
 *
 * Exercises the DOM glue in happy-dom: ZoomPanController's wheel /
 * middle-drag pan against a live store, and KeyboardNavigator's
 * clamped focus movement. Pointer/wheel events are synthesized —
 * happy-dom implements addEventListener + basic event dispatch.
 */

import { describe, expect, it } from 'vitest';

import { KeyboardNavigator } from '../../../src/a11y/keyboard';
import { ZoomPanController } from '../../../src/qol/zoom';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { createConsoleStore } from '../../../src/state/store';
import type { ConsoleState } from '../../../src/state/types';

/** Live state with a 16×16 view so wheel zoom has board bounds. */
function live(): ConsoleState {
  return {
    ...INITIAL_CONSOLE_STATE,
    status: 'live',
    inputEnabled: true,
    latestView: {
      player: 1,
      tick: 1,
      visibleCells: [],
      events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
      config: { boardSize: 16, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
    },
    session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
  };
}

describe('ZoomPanController (US5 AC-1)', () => {
  it('wheel zooms toward the cursor and updates the store camera', () => {
    const element = document.createElement('div');
    const store = createConsoleStore(live());
    const controller = new ZoomPanController(element, store);
    controller.attach();

    const event = new WheelEvent('wheel', { deltaY: -100, clientX: 64, clientY: 64 });
    element.dispatchEvent(event);
    expect(store.getState().camera.zoom).toBeGreaterThan(32);
    controller.attach().dispose();
  });

  it('ignores wheel events before any view exists', () => {
    const element = document.createElement('div');
    const store = createConsoleStore(INITIAL_CONSOLE_STATE);
    const handle = new ZoomPanController(element, store).attach();
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(store.getState().camera.zoom).toBe(32); // untouched
    handle.dispose();
  });

  it('middle-button drag pans; dispose removes listeners', () => {
    const element = document.createElement('div');
    const store = createConsoleStore(live());
    const handle = new ZoomPanController(element, store).attach();

    element.dispatchEvent(
      new PointerEvent('pointerdown', { button: 1, clientX: 100, clientY: 100 }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', { buttons: 4, clientX: 60, clientY: 80 }),
    );
    element.dispatchEvent(new PointerEvent('pointerup', { button: 1 }));

    const panned = store.getState().camera.pan;
    expect(panned.x).not.toBe(0);

    // After dispose, further gestures change nothing.
    handle.dispose();
    const frozen = store.getState().camera;
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 1, clientX: 10, clientY: 10 }));
    element.dispatchEvent(
      new PointerEvent('pointermove', { buttons: 4, clientX: 500, clientY: 500 }),
    );
    expect(store.getState().camera).toEqual(frozen);
  });
});

describe('KeyboardNavigator (a11y roving focus)', () => {
  const navigator = new KeyboardNavigator();
  const bounds = { width: 16, height: 16 };

  it('starts at the board center when nothing is focused', () => {
    expect(navigator.moveFocus(null, 'E', bounds)).toEqual({ x: 8, y: 8 });
    expect(navigator.getInitialFocus(16, 16)).toEqual({ x: 8, y: 8 });
  });

  it('moves one cell per step in each direction', () => {
    expect(navigator.moveFocus({ x: 5, y: 5 }, 'N', bounds)).toEqual({ x: 5, y: 4 });
    expect(navigator.moveFocus({ x: 5, y: 5 }, 'S', bounds)).toEqual({ x: 5, y: 6 });
    expect(navigator.moveFocus({ x: 5, y: 5 }, 'W', bounds)).toEqual({ x: 4, y: 5 });
    expect(navigator.moveFocus({ x: 5, y: 5 }, 'E', bounds)).toEqual({ x: 6, y: 5 });
  });

  it('sticks at board edges instead of wrapping', () => {
    expect(navigator.moveFocus({ x: 0, y: 0 }, 'N', bounds)).toEqual({ x: 0, y: 0 });
    expect(navigator.moveFocus({ x: 0, y: 0 }, 'W', bounds)).toEqual({ x: 0, y: 0 });
    expect(navigator.moveFocus({ x: 15, y: 15 }, 'S', bounds)).toEqual({ x: 15, y: 15 });
    expect(navigator.moveFocus({ x: 15, y: 15 }, 'E', bounds)).toEqual({ x: 15, y: 15 });
  });
});
