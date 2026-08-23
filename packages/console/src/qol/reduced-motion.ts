/**
 * `prefers-reduced-motion` guard — Feature 005 (T083).
 *
 * Honors the OS-level reduce-motion flag across the render stack
 * (Q-A07; WCAG 2.3.3 Animation from Interactions — new in 2.2;
 * research.md §6):
 *
 *   - when reduced motion is ON, `MapEffect`s of kinds
 *     `combat | capture` are skipped ENTIRELY
 *     ({@link filterEffectsForMotion}) — a flashing combat marker is
 *     exactly the "animation from interactions" the success
 *     criterion targets;
 *   - the transient TTLs are treated as 0 ({@link motionAdjustedTtls})
 *     so no timed fade/flash animation is scheduled (labels/effects
 *     resolve statically);
 *   - {@link subscribeReducedMotion} re-fires on live OS changes via
 *     the media query's `change` event.
 *
 * The remaining effect kinds (`paratroop_launch`, `paratroop_land`,
 * `gun_fire`) paint static positional markers rather than flashes and
 * stay visible — information, not decoration.
 *
 * Environment guard: `matchMedia` is feature-detected so non-browser
 * hosts (SSR-ish embeds, tests without the API) degrade to
 * "motion allowed" instead of throwing.
 *
 * JSDoc references: WCAG 2.3.3 + Q-A07 + research.md §6.
 */

import { CONSOLE_CONSTANTS } from '../config';
import type { MapEffect } from '../state/types';

/** The media query this module observes. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user currently prefers reduced motion. `false` when
 * the API is unavailable or the query does not match.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Subscribe to reduce-motion changes. Fires immediately with the
 * current value, then on every `change`. Returns an unsubscribe
 * function (safe to call more than once).
 *
 * @param callback Receives the current flag on each change.
 */
export function subscribeReducedMotion(callback: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    callback(prefersReducedMotion());
    return () => undefined;
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  const listener = (event: MediaQueryListEvent): void => {
    callback(event.matches);
  };
  callback(query.matches);
  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

/** Transient TTLs adjusted for the motion preference. */
export interface MotionAdjustedTtls {
  /** Effect flash budget: `0` under reduced motion. */
  readonly effectTtlMs: number;
  /** Label TTL budget: `0` under reduced motion. */
  readonly labelTtlMs: number;
}

/**
 * Effective transient TTLs for the current motion preference:
 * reduced motion treats both budgets as 0 (no animation is
 * scheduled); full motion uses the contractual constants. Pure.
 *
 * @param reduced The reduce-motion flag.
 */
export function motionAdjustedTtls(reduced: boolean): MotionAdjustedTtls {
  return reduced
    ? { effectTtlMs: 0, labelTtlMs: 0 }
    : {
        effectTtlMs: CONSOLE_CONSTANTS.effectTtlMs,
        labelTtlMs: CONSOLE_CONSTANTS.labelTtlMs,
      };
}

/**
 * Drop the flashing effect kinds under reduced motion. Pure.
 *
 * @param effects Candidate effects.
 * @param reduced The reduce-motion flag.
 */
export function filterEffectsForMotion(
  effects: ReadonlyArray<MapEffect>,
  reduced: boolean,
): ReadonlyArray<MapEffect> {
  if (!reduced) {
    return effects;
  }
  return effects.filter((effect) => effect.kind !== 'combat' && effect.kind !== 'capture');
}
