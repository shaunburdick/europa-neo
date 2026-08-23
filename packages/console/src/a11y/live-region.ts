/**
 * aria-live announcer — Feature 005 (T021).
 *
 * Mounts two visually-hidden live-region nodes (`polite` + `assertive`)
 * inside a host container and routes announcement text into them
 * (research.md §6). The renderer owns one instance per mount; the
 * runtime feeds it from `announce` reducer effects.
 *
 * Repeat suppression: an identical message within 500 ms of the last
 * announcement is dropped, so per-tick event storms don't turn into
 * screen-reader spam.
 *
 * WCAG reference:
 *   - 4.1.3 Status Messages (Level AA): status changes are announced
 *     via role/status semantics without moving focus — exactly what
 *     the polite/assertive split provides.
 */

/** Announcement politeness levels mapped 1:1 to `aria-live` values. */
export type LivePoliteness = 'polite' | 'assertive';

/** Window (ms) within which an identical message is suppressed. */
const DEBOUNCE_MS = 500;

/**
 * Hidden live-region announcer bound to a host container element.
 */
export class LiveRegionAnnouncer {
  /** The two mounted live nodes, keyed by politeness. */
  private readonly politenessNodes: Readonly<Record<LivePoliteness, HTMLElement>>;

  /** Last announcement text + monotonic timestamp for debouncing. */
  private lastAnnouncement: { readonly text: string; readonly atMs: number } | null = null;

  /**
   * Mount the hidden live regions inside `container`. The nodes use
   * the clip pattern (1px, clipped) rather than `display: none` —
   * assistive tech ignores elements removed from the accessibility
   * tree.
   *
   * @param container Host element (the console root).
   */
  constructor(container: HTMLElement) {
    const polite = createLiveNode('polite');
    const assertive = createLiveNode('assertive');
    container.append(polite, assertive);
    this.politenessNodes = { polite, assertive };
  }

  /**
   * Announce a message at the given politeness level. Identical text
   * within {@link DEBOUNCE_MS} of the previous announcement is
   * suppressed (WCAG 4.1.3 anti-spam).
   *
   * @param text Message to announce.
   * @param politeness `'polite'` (default) queues behind current
   *                   speech; `'assertive'` interrupts — reserve it
   *                   for errors and connection failures.
   */
  announce(text: string, politeness: LivePoliteness = 'polite'): void {
    const nowMs = performance.now();
    if (
      this.lastAnnouncement !== null &&
      this.lastAnnouncement.text === text &&
      nowMs - this.lastAnnouncement.atMs < DEBOUNCE_MS
    ) {
      return;
    }
    this.politenessNodes[politeness].textContent = text;
    this.lastAnnouncement = { text, atMs: nowMs };
  }

  /**
   * Clear both live regions (e.g., on unmount or after a modal
   * takes over narration).
   */
  clear(): void {
    this.politenessNodes.polite.textContent = '';
    this.politenessNodes.assertive.textContent = '';
    this.lastAnnouncement = null;
  }
}

/**
 * Build one hidden aria-live node with `aria-atomic="true"` so the
 * full message re-reads on change. Uses inline styles (no stylesheet
 * dependency) implementing the standard visually-hidden clip pattern.
 */
function createLiveNode(politeness: LivePoliteness): HTMLElement {
  const node = document.createElement('div');
  node.setAttribute('aria-live', politeness);
  node.setAttribute('aria-atomic', 'true');
  node.setAttribute('data-europa-live', politeness);
  applyVisuallyHiddenStyles(node);
  return node;
}

/**
 * Apply the visually-hidden clip pattern inline. Kept as a function
 * so the styling lives in exactly one place.
 */
function applyVisuallyHiddenStyles(node: HTMLElement): void {
  const style = node.style;
  style.position = 'absolute';
  style.width = '1px';
  style.height = '1px';
  style.margin = '-1px';
  style.padding = '0';
  style.border = '0';
  style.overflow = 'hidden';
  style.clipPath = 'inset(50%)';
  style.whiteSpace = 'nowrap';
}
