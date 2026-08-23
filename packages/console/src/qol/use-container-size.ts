/**
 * Container-size observation — Integration wave (review follow-up
 * T-I3, original task intent: T081's minimap viewport rectangle).
 *
 * Measures a live element's CSS-pixel box and keeps the measurement
 * current via `ResizeObserver`, so the minimap's viewport indicator
 * reflects the REAL visible window instead of defaulting to the full
 * board (the T081 fallback when no container size was available).
 *
 * Determinism discipline: reads happen only at the sanctioned UI
 * boundary (layout observation), never inside logic modules.
 */

import { type RefObject, useEffect, useState } from 'react';

/** A measured content-box size in CSS pixels. */
export interface ContainerSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Observe the referenced element's size. Returns `null` until a
 * non-degenerate (non-zero) measurement exists, so callers can fall
 * back cleanly (e.g., the minimap's full-board default).
 *
 * @param ref Ref to the element to observe (may be unmounted → `null`).
 * @returns The latest non-degenerate size, or `null`.
 */
export function useContainerSize(ref: RefObject<HTMLElement | null>): ContainerSize | null {
  const [size, setSize] = useState<ContainerSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }

    /**
     * Read the element's box; zero-sized boxes (display:none, detached)
     * are reported as `null` rather than poisoning the viewport math.
     */
    const measure = (): void => {
      const rect = element.getBoundingClientRect();
      setSize(
        rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null,
      );
    };

    // Synchronous first read: avoids one paint with the fallback
    // viewport before the observer's initial callback lands.
    measure();

    if (typeof ResizeObserver === 'undefined') {
      // Environments without ResizeObserver keep the initial measure.
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return size;
}
