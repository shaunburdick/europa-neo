/**
 * Preferences unit tests — Feature 005 (T075).
 *
 * Covers the persistence contract (data-model.md §9):
 *   · `loadPreferences` returns the host's `qolSettings` when
 *     provided, else `DEFAULT_QOL_SETTINGS`;
 *   · `savePreferences` fires the host's `persist` callback with the
 *     exact settings snapshot on every change;
 *   · a host without `persist` is a safe no-op;
 *   · the store-level chain (`setQol` → `persistQol` effect →
 *     `savePreferences`) reaches the host callback — the same path
 *     the Phase 8 `Console.setQolSettings` handle funnels through.
 */

import { describe, expect, test, vi } from 'vitest';

import { DEFAULT_QOL_SETTINGS } from '../../../src/config';
import { loadPreferences, savePreferences } from '../../../src/qol/preferences';
import { INITIAL_CONSOLE_STATE, reduce } from '../../../src/state/reducer';
import type { ConsoleState, QoLSettings } from '../../../src/state/types';

describe('loadPreferences', () => {
  test('defaults when the host has nothing persisted', () => {
    expect(loadPreferences({})).toEqual(DEFAULT_QOL_SETTINGS);
    expect(loadPreferences({ qolSettings: undefined })).toEqual(DEFAULT_QOL_SETTINGS);
  });

  test('the persisted override wins over the defaults', () => {
    const persisted: QoLSettings = {
      soundOn: true,
      animation: 'reduced',
      tooltips: false,
      theme: 'dark',
      ownerColorRing: false,
    };
    expect(loadPreferences({ qolSettings: persisted })).toBe(persisted);
  });
});

describe('savePreferences', () => {
  test('fires persist with the exact snapshot', () => {
    const persist = vi.fn();
    const settings: QoLSettings = { ...DEFAULT_QOL_SETTINGS, soundOn: true };
    savePreferences(settings, { persist });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(settings);
  });

  test('a host without persist is a no-op', () => {
    const settings: QoLSettings = { ...DEFAULT_QOL_SETTINGS };
    expect(() => savePreferences(settings, {})).not.toThrow();
  });
});

describe('store → persistQol effect → savePreferences chain', () => {
  test('every setQol change reaches the host exactly once', () => {
    const persist = vi.fn();
    let state: ConsoleState = INITIAL_CONSOLE_STATE;
    for (const patch of [{ soundOn: true }, { theme: 'light' as const }]) {
      const { state: next, effects } = reduce(state, { kind: 'setQol', patch }, { nowMs: 0 });
      state = next;
      for (const effect of effects) {
        if (effect.kind === 'persistQol') {
          savePreferences(effect.settings, { persist });
        }
      }
    }
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith({
      ...DEFAULT_QOL_SETTINGS,
      soundOn: true,
      theme: 'light',
    });
  });
});
