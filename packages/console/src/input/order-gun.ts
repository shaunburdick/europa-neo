/**
 * Gun keyboard hook — Feature 005 (T063).
 *
 * Thin wrapper around {@link fireAbility} for the `g` / `o` keys
 * (`DEFAULT_INPUT_MAPPING.gunPrimary` / `.gunAlt`, T019): builds the
 * gun action through the subcell targeting core (T061) and dispatches
 * it when — and only when — the local preflight passes (spec US3
 * AC-1/2/3).
 *
 * The document-level routing itself lives in the order draft
 * controller (T054); this module is the standalone programmatic
 * entry point (hotkey re-mapping in US5, tests, future UI buttons).
 */

import { type AbilityFireArgs, fireAbility, type TargetingOutcome } from './subcell-target';

/**
 * Fire a gun order from the focused cell toward the cursor's binned
 * target. Returns the outcome; only `ok` touched the store.
 *
 * @param args Store + cursor aim (see {@link AbilityFireArgs}).
 */
export function fireGun(args: AbilityFireArgs): TargetingOutcome {
  return fireAbility('gun', args);
}
