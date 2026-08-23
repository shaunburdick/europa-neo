/**
 * QoL settings persistence — Feature 005 (T082).
 *
 * The console-side half of the persistence contract
 * (data-model.md §9): the console NEVER touches `localStorage` — the
 * host owns storage. The console reads initial values from
 * `ConsoleConfig.qolSettings` and writes changes through the host's
 * `ConsoleConfig.persist` callback:
 *
 *   loadPreferences(host)  → host.qolSettings ?? DEFAULT_QOL_SETTINGS
 *   savePreferences(s, h)  → h.persist?.(s)
 *
 * Flow: a `setQol` action reduces to a `persistQol` effect; the
 * runtime's effect sink calls {@link savePreferences}; the Phase 8
 * `Console.setQolSettings` handle method funnels through the same
 * path so every change reaches the host exactly once.
 *
 * JSDoc reference: data-model.md §9 persistence contract + FR-011.
 */

import { DEFAULT_QOL_SETTINGS } from '../config';
import type { QoLSettings } from '../state/types';

/**
 * The slice of `ConsoleConfig` persistence needs. Structural subset
 * so tests and callers can pass any object carrying these fields.
 */
export interface PreferencesHost {
  /** Previously-persisted settings, or `undefined` for defaults. */
  readonly qolSettings?: QoLSettings | undefined;
  /** Host write callback, or `undefined` (changes stay in-memory). */
  readonly persist?: ((settings: QoLSettings) => void) | undefined;
}

/**
 * Resolve the effective QoL settings at boot: the host's persisted
 * values when provided, otherwise the contractual defaults. Pure.
 *
 * @param host Config bag (see {@link PreferencesHost}).
 */
export function loadPreferences(host: PreferencesHost): QoLSettings {
  return host.qolSettings ?? DEFAULT_QOL_SETTINGS;
}

/**
 * Hand a settings snapshot to the host's persistence callback.
 * No-op when the host did not provide `persist`. Pure modulo the
 * callback invocation itself.
 *
 * @param settings The complete settings snapshot to persist.
 * @param host     Config bag (see {@link PreferencesHost}).
 */
export function savePreferences(settings: QoLSettings, host: PreferencesHost): void {
  host.persist?.(settings);
}
