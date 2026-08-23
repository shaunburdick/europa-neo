/**
 * Region-of-cell pointer input — Feature 005 (T053).
 *
 * The pointer half of the US2 pipe pipeline (spec US2 AC-1/2, FR-002,
 * FR-003; research.md §7 "Pointer events"). A thin DOM binding layer
 * around two pure functions:
 *
 *   - {@link decideRegionClick} — gesture → pipe `PlayerAction`
 *     decision implementing the original Europa mouse semantics
 *     (`europa-source/.../controls.html`, transcribed behavior only):
 *       · primary button  → toggle the region's pipe (create if
 *         absent, remove if present);
 *       · secondary button OR middle button OR Alt+primary → mutually
 *         exclusive pipe (replaces all others in the cell);
 *       · Shift+primary → reserved for v1.1 multi-select
 *         (research.md §12); behaves as a plain primary click.
 *   - {@link pipePresentInDirection} — reads the fog-filtered view to
 *     decide toggle direction.
 *
 * The controller subscribes `pointermove` / `pointerdown` /
 * `pointerleave` / `contextmenu` on the map element, hit-tests through
 * `hitTest` (T032), and dispatches `hoverCell` + order-producing
 * actions into the store. Order-producing dispatches are gated on
 * `state.inputEnabled` (data-model.md §1: inputs live only when
 * status === 'live'); hover tracking is always allowed.
 *
 * JSDoc references: spec US2 AC-1/2 + FR-002/FR-003.
 */

import type { ConsoleStore } from '../state/store';
import type {
  ConsoleState,
  Coord,
  CursorTarget,
  Direction,
  PlayerAction,
  ScreenPoint,
} from '../state/types';
import { directionFromRegion, hitTest } from './hit-test';

/** Physical pointer button, mirroring `PointerBinding['button']`. */
export type PointerButton = 'left' | 'middle' | 'right';

/**
 * The outcome of classifying one region click. `'none'` means "no
 * board cell under the cursor" (the click landed on chrome/void).
 */
export type RegionClickDecision =
  | { readonly kind: 'setPipe'; readonly cell: Coord; readonly direction: Direction }
  | { readonly kind: 'clearPipe'; readonly cell: Coord; readonly direction: Direction }
  | { readonly kind: 'setPipesExclusive'; readonly cell: Coord; readonly direction: Direction }
  | { readonly kind: 'none'; readonly reason: 'no-cell' };

/** Arguments for {@link decideRegionClick}. */
export interface RegionClickArgs {
  /** Hit-test output for the click point. */
  readonly target: CursorTarget;
  /** Pressed pointer button. */
  readonly button: PointerButton;
  /** Alt held (exclusive-pipe modifier per FR-003). */
  readonly altKey: boolean;
  /**
   * Shift held. Reserved for v1.1 multi-select (research.md §12); v1
   * treats Shift+primary exactly like a plain primary click.
   */
  readonly shiftKey: boolean;
  /** Sticky exclusive mode from console state (`exclusiveMode`). */
  readonly exclusiveMode: boolean;
  /**
   * Whether the fog-filtered view shows a pipe already present in the
   * clicked region (drives toggle vs clear). Ignored for exclusive
   * clicks, which always issue `setPipesExclusive`.
   */
  readonly hasExistingPipe: boolean;
}

/**
 * Classify one pointer click against the original Europa semantics.
 * Pure (US2 AC-1/2).
 *
 * Exclusive intent = non-primary button OR Alt held OR sticky
 * exclusive mode → `setPipesExclusive`. Otherwise the region's pipe is
 * toggled: present → `clearPipe`, absent → `setPipe`.
 *
 * @param args The gesture description plus current mode flags.
 */
export function decideRegionClick(args: RegionClickArgs): RegionClickDecision {
  const { target, button, altKey, exclusiveMode } = args;
  if (target.cell === null || target.region === null) {
    return { kind: 'none', reason: 'no-cell' };
  }
  const direction = directionFromRegion(target.region);
  const exclusive = button !== 'left' || altKey || exclusiveMode;
  if (exclusive) {
    return { kind: 'setPipesExclusive', cell: target.cell, direction };
  }
  // Toggle semantics need existing pipe state, supplied by the caller.
  return args.hasExistingPipe === true
    ? { kind: 'clearPipe', cell: target.cell, direction }
    : { kind: 'setPipe', cell: target.cell, direction };
}

/**
 * Whether the fog-filtered view shows a pipe in `direction` on
 * `cell`. Unknown cells (outside the horizon) report `false`, so a
 * toggle there issues `setPipe` and lets the server be final
 * authority (FR-006). Pure.
 *
 * @param state    Console snapshot carrying `latestView`.
 * @param cell     The clicked cell.
 * @param direction The region's pipe direction.
 */
export function pipePresentInDirection(
  state: ConsoleState,
  cell: Coord,
  direction: Direction,
): boolean {
  const view = state.latestView;
  if (view === null) {
    return false;
  }
  const found = view.visibleCells.find((c) => c.coord.x === cell.x && c.coord.y === cell.y);
  if (found === undefined) {
    return false;
  }
  return found.pipes.has(direction);
}

/** Callbacks the controller invokes for cross-layer coordination. */
export interface RegionSelectCallbacks {
  /**
   * Called on every pointer move with the fresh hit-test result and
   * a monotonic timestamp. The keyboard draft layer consumes this to
   * keep its last-known subcell aim fresh (research.md §13 #3).
   */
  readonly onCursor?: ((target: CursorTarget, atMs: number) => void) | undefined;
}

/** Handle returned by {@link RegionSelectController.attach}'s factory. */
export interface RegionSelectHandle {
  /** Remove all listeners; safe to call more than once. */
  dispose(): void;
}

/**
 * Pointer-binding controller for one map element. Attaches
 * `pointermove` / `pointerdown` / `pointerleave` / `contextmenu`
 * listeners and routes them through the pure decision functions into
 * the store.
 */
export class RegionSelectController {
  private readonly element: HTMLElement;

  private readonly store: ConsoleStore;

  private readonly onCursor: ((target: CursorTarget, atMs: number) => void) | undefined;

  private lastHover: Coord | null = null;

  private disposed = false;

  /** Bound listener references for exact removal. */
  private readonly listeners: Array<() => void> = [];

  /**
   * @param element    The map surface element (board area covering the canvas).
   * @param store      The console store (dispatch target + state source).
   * @param callbacks  Optional cross-layer hooks (cursor feed).
   */
  constructor(element: HTMLElement, store: ConsoleStore, callbacks?: RegionSelectCallbacks) {
    this.element = element;
    this.store = store;
    this.onCursor = callbacks?.onCursor;
  }

  /**
   * Attach all listeners. Returns a handle whose {@link dispose}
   * removes them.
   */
  attach(): RegionSelectHandle {
    const moveHandler = (event: PointerEvent): void => {
      this.handleMove(event);
    };
    const downHandler = (event: PointerEvent): void => {
      this.handleDown(event);
    };
    const leaveHandler = (): void => {
      this.handleLeave();
    };
    const menuHandler = (event: MouseEvent): void => {
      // Right button IS the exclusive-pipe command (FR-003); the
      // browser context menu must not swallow it.
      event.preventDefault();
    };
    this.element.addEventListener('pointermove', moveHandler);
    this.element.addEventListener('pointerdown', downHandler);
    this.element.addEventListener('pointerleave', leaveHandler);
    this.element.addEventListener('contextmenu', menuHandler);
    this.listeners.push(
      () => this.element.removeEventListener('pointermove', moveHandler),
      () => this.element.removeEventListener('pointerdown', downHandler),
      () => this.element.removeEventListener('pointerleave', leaveHandler),
      () => this.element.removeEventListener('contextmenu', menuHandler),
    );
    return {
      dispose: () => {
        if (this.disposed) {
          return;
        }
        this.disposed = true;
        for (const off of this.listeners) {
          off();
        }
      },
    };
  }

  /** Translate a client-space pointer event to a canvas-relative point. */
  private relativePoint(event: PointerEvent): ScreenPoint {
    const rect = this.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Hit-test + hover dispatch + cursor callback fan-out. */
  private handleMove(event: PointerEvent): void {
    const state = this.store.getState();
    const target = hitTest(this.relativePoint(event), state.camera);
    if (this.onCursor !== undefined) {
      this.onCursor(target, performance.now());
    }
    const nextCell = target.cell;
    const changed =
      (nextCell === null) !== (this.lastHover === null) ||
      (nextCell !== null &&
        this.lastHover !== null &&
        (nextCell.x !== this.lastHover.x || nextCell.y !== this.lastHover.y));
    if (changed) {
      this.lastHover = nextCell;
      this.store.dispatch({ kind: 'hoverCell', cell: nextCell });
    }
  }

  /** Classify + dispatch the click's pipe action (input-gated). */
  private handleDown(event: PointerEvent): void {
    // Canceling pointerdown suppresses the compatibility mousedown,
    // whose default action would focus the grid container (it carries
    // tabindex) and stomp the click anchor with the board-center
    // fallback. Keyboard Tab focus is unaffected.
    event.preventDefault();
    const state = this.store.getState();
    const target = hitTest(this.relativePoint(event), state.camera);
    const button = BUTTON_BY_INDEX[event.button] ?? 'left';
    const decision = decideRegionClick({
      target,
      button,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      exclusiveMode: state.exclusiveMode,
      hasExistingPipe:
        target.cell !== null && target.region !== null
          ? pipePresentInDirection(state, target.cell, directionFromRegion(target.region))
          : false,
    });
    if (decision.kind === 'none') {
      return;
    }
    // Order-producing gestures require live input (data-model.md §1);
    // the reducer re-guards defensively.
    if (!state.inputEnabled) {
      return;
    }
    const action: PlayerAction = decision;
    this.store.dispatch(action);
    // Establish the keyboard anchor on the clicked cell so mouse-only
    // players can follow with p/g/i/space without arrow-walking.
    this.store.dispatch({ kind: 'selectCell', cell: decision.cell });
  }

  /** Pointer left the map: clear hover. */
  private handleLeave(): void {
    if (this.lastHover !== null) {
      this.lastHover = null;
      this.store.dispatch({ kind: 'hoverCell', cell: null });
    }
  }
}

/** DOM `PointerEvent.button` index → semantic button name. */
const BUTTON_BY_INDEX: Readonly<Record<number, PointerButton>> = {
  0: 'left',
  1: 'middle',
  2: 'right',
};
