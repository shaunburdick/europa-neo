/**
 * Keyboard → PlayerAction translation — Feature 005 (T054).
 *
 * The keyboard half of the US2 pipe pipeline (spec US2 AC-3/4,
 * FR-004; research.md §7 "Keyboard"). A document-level `keydown`
 * listener translates the original Europa key set — read from
 * `DEFAULT_INPUT_MAPPING` (contracts/console-types.ts), never
 * hard-coded — into `PlayerAction`s dispatched into the store:
 *
 *   · i/j/k/l        toggle N/W/S/E pipes on the focused cell;
 *     Alt+key issues the exclusive variant (US2 AC-3);
 *   · space          clears all pipes on the focused cell (AC-4);
 *   · p/h, g/o       paratroop / gun via the subcell targeting core
 *     ({@link buildAbilityAction}, T061);
 *   · 0–9            set reserves to 10×digit on the focused cell;
 *   · Arrow keys     move the selection (keyboard anchor) within the
 *     board via {@link KeyboardNavigator};
 *   · Escape         cancels: clears the selection.
 *
 * Ordering semantics follow research.md §7's table: pipe keys TOGGLE
 * (setPipe or clearPipe depending on existing state) so keyboard and
 * mouse button 1 behave identically; Alt+key always issues
 * `setPipesExclusive` (the original's "mutually exclusive" command).
 *
 * Gating: order-producing keys no-op unless `state.inputEnabled`
 * (`status === 'live'`, data-model.md §1); local-only keys (arrows,
 * Escape) stay usable. Ctrl/Meta chords are ignored wholesale so
 * browser shortcuts never fire orders. Key repeats are ignored — a
 * held key must not toggle-storm the wire.
 *
 * Constitution Principle II: the controller reads `performance.now()`
 * ONLY at the DOM boundary (the sanctioned UI clock) to age cursor
 * samples; every decision function is pure.
 *
 * JSDoc references: spec US2 AC-3/4 + FR-004.
 */

import { type FocusDirection, KeyboardNavigator } from '../a11y/keyboard';
import type { ConsoleStore } from '../state/store';
import type {
  ConsoleState,
  Coord,
  CursorTarget,
  Direction,
  PlayerAction,
  ReservesPct,
} from '../state/types';
import { DEFAULT_INPUT_MAPPING } from '../state/types';
import { pipePresentInDirection } from './region-select';
import { type AbilityKind, buildAbilityAction, type TargetingOutcome } from './subcell-target';

/**
 * Why a keypress produced no action. `preflight-rejected` carries the
 * engine-shaped reason so callers can surface it (FR-007).
 */
export type DraftIgnoreReason =
  | 'unbound-key'
  | 'not-live'
  | 'no-selection'
  | 'no-view'
  | 'no-launch'
  | 'preflight-rejected';

/** The outcome of translating one keydown. */
export type DraftOutcome =
  | { readonly kind: 'action'; readonly action: PlayerAction }
  | {
      readonly kind: 'ignore';
      readonly reason: DraftIgnoreReason;
      /** Present only for `preflight-rejected`: why the order was blocked. */
      readonly detail?: import('../state/types').ValidationError;
    };

/** Arguments for {@link translateKey}. */
export interface TranslateKeyArgs {
  /** Raw `KeyboardEvent.key` value. */
  readonly key: string;
  /** Alt modifier (exclusive-pipe variants). */
  readonly altKey: boolean;
  /** Ctrl modifier — any Ctrl/Meta chord suppresses all bindings. */
  readonly ctrlKey: boolean;
  /** Meta modifier — any Ctrl/Meta chord suppresses all bindings. */
  readonly metaKey: boolean;
  /** Console snapshot (selection, inputEnabled, view, session, camera). */
  readonly state: ConsoleState;
  /** Last-known cursor sample for subcell aims, or `null`. */
  readonly cursor: CursorTarget | null;
  /** Age of the cursor sample in ms (`null` = never moved). */
  readonly cursorAgeMs: number | null;
}

/**
 * Translate one keydown into a `PlayerAction` (or an explained
 * ignore). Pure (spec US2 AC-3/4 + FR-004).
 *
 * @param args The key event fields plus console snapshot + cursor aim.
 */
export function translateKey(args: TranslateKeyArgs): DraftOutcome {
  const { key, altKey, ctrlKey, metaKey, state, cursor, cursorAgeMs } = args;

  // Browser chords win — never fight the host shortcuts.
  if (ctrlKey || metaKey) {
    return { kind: 'ignore', reason: 'unbound-key' };
  }

  const normalized = key.length === 1 ? key.toLowerCase() : key;

  // --- Pipe keys (i/j/k/l, Alt = exclusive) — US2 AC-3 ---
  const pipeDirection = lookupPipeDirection(normalized);
  if (pipeDirection !== null) {
    if (!state.inputEnabled) {
      return { kind: 'ignore', reason: 'not-live' };
    }
    if (state.selection === null) {
      return { kind: 'ignore', reason: 'no-selection' };
    }
    const cell = state.selection;
    if (altKey) {
      return {
        kind: 'action',
        action: { kind: 'setPipesExclusive', cell, direction: pipeDirection },
      };
    }
    const present = pipePresentInDirection(state, cell, pipeDirection);
    return {
      kind: 'action',
      action: present
        ? { kind: 'clearPipe', cell, direction: pipeDirection }
        : { kind: 'setPipe', cell, direction: pipeDirection },
    };
  }

  // --- Space clears all pipes on the focused cell — US2 AC-4 ---
  if (normalized === DEFAULT_INPUT_MAPPING.clearCellPipes) {
    if (!state.inputEnabled) {
      return { kind: 'ignore', reason: 'not-live' };
    }
    if (state.selection === null) {
      return { kind: 'ignore', reason: 'no-selection' };
    }
    return { kind: 'action', action: { kind: 'clearAllPipes', cell: state.selection } };
  }

  // --- Paratroop / gun via the subcell targeting core — US3 AC-1/2/3 ---
  const ability = lookupAbility(normalized);
  if (ability !== null) {
    if (!state.inputEnabled) {
      return { kind: 'ignore', reason: 'not-live' };
    }
    const outcome = buildAbilityAction({
      kind: ability,
      selection: state.selection,
      cursor,
      cursorAgeMs,
      state,
    });
    return outcomeToDraft(outcome);
  }

  // --- Reserves digits 0-9 (10×digit percent) ---
  const reservePercent = lookupReservePercent(normalized);
  if (reservePercent !== null) {
    if (!state.inputEnabled) {
      return { kind: 'ignore', reason: 'not-live' };
    }
    if (state.selection === null) {
      return { kind: 'ignore', reason: 'no-selection' };
    }
    return {
      kind: 'action',
      action: { kind: 'setReserves', cell: state.selection, percent: reservePercent },
    };
  }

  // --- Escape cancels: clear the selection (local-only) ---
  if (key === DEFAULT_INPUT_MAPPING.cancel) {
    return { kind: 'action', action: { kind: 'selectCell', cell: null } };
  }

  // --- Arrows move the keyboard anchor (local-only) ---
  const arrowDirection = lookupArrowDirection(key);
  if (arrowDirection !== null) {
    if (state.latestView === null) {
      return { kind: 'ignore', reason: 'no-view' };
    }
    const navigator = new KeyboardNavigator();
    const size = state.latestView.config.boardSize;
    const next: Coord = navigator.moveFocus(state.selection, arrowDirection, {
      width: size,
      height: size,
    });
    return { kind: 'action', action: { kind: 'selectCell', cell: next } };
  }

  return { kind: 'ignore', reason: 'unbound-key' };
}

/** Convert a targeting outcome into a draft outcome (no information loss). */
function outcomeToDraft(outcome: TargetingOutcome): DraftOutcome {
  switch (outcome.status) {
    case 'ok':
      return { kind: 'action', action: outcome.action };
    case 'no_launch':
      return { kind: 'ignore', reason: 'no-launch' };
    case 'rejected':
      return { kind: 'ignore', reason: 'preflight-rejected', detail: outcome.reason };
    default:
      return outcome satisfies never;
  }
}

/**
 * Resolve i/j/k/l to their pipe direction from
 * `DEFAULT_INPUT_MAPPING.pipeKeys`. The Alt variants
 * (`pipeExclusiveKeys`) carry the same base letters — Alt only flips
 * the issued action, handled by the caller — so one table serves both.
 * Returns `null` for non-pipe keys. Pure.
 */
function lookupPipeDirection(key: string): Direction | null {
  const table = DEFAULT_INPUT_MAPPING.pipeKeys;
  if (key === table.pipeNorth.toLowerCase()) {
    return 'N';
  }
  if (key === table.pipeWest.toLowerCase()) {
    return 'W';
  }
  if (key === table.pipeSouth.toLowerCase()) {
    return 'S';
  }
  if (key === table.pipeEast.toLowerCase()) {
    return 'E';
  }
  return null;
}

/**
 * Resolve p/h/g/o to their ability kind from `DEFAULT_INPUT_MAPPING`.
 * Returns `null` for other keys. Pure.
 */
function lookupAbility(key: string): AbilityKind | null {
  if (
    key === DEFAULT_INPUT_MAPPING.paratroopPrimary ||
    key === DEFAULT_INPUT_MAPPING.paratroopAlt
  ) {
    return 'paratroop';
  }
  if (key === DEFAULT_INPUT_MAPPING.gunPrimary || key === DEFAULT_INPUT_MAPPING.gunAlt) {
    return 'gun';
  }
  return null;
}

/**
 * Resolve a digit to its reserves percent (10×digit, engine
 * `ReservesPct` domain 0..9). Returns `null` for non-digits. Pure.
 */
function lookupReservePercent(key: string): ReservesPct | null {
  const index = DEFAULT_INPUT_MAPPING.reserveKeys.indexOf(key);
  if (index < 0) {
    return null;
  }
  return index as ReservesPct;
}

/** Arrow-key → focus-direction mapping (KeyboardNavigator alphabet). */
function lookupArrowDirection(key: string): FocusDirection | null {
  switch (key) {
    case DEFAULT_INPUT_MAPPING.selectionMove.north:
      return 'N';
    case DEFAULT_INPUT_MAPPING.selectionMove.west:
      return 'W';
    case DEFAULT_INPUT_MAPPING.selectionMove.south:
      return 'S';
    case DEFAULT_INPUT_MAPPING.selectionMove.east:
      return 'E';
    default:
      return null;
  }
}

/** Cursor sample bookkeeping for the controller. */
interface CursorSample {
  readonly target: CursorTarget;
  readonly atMs: number;
}

/**
 * Document-level keydown controller. Keeps the last-known cursor
 * sample (fed by the pointer layer) and dispatches translated actions
 * into the store.
 */
export class OrderDraftController {
  private readonly store: ConsoleStore;

  private sample: CursorSample | null = null;

  private handler: ((event: KeyboardEvent) => void) | null = null;

  /**
   * @param store Dispatch target + state source.
   */
  constructor(store: ConsoleStore) {
    this.store = store;
  }

  /**
   * Record a fresh cursor sample (call from the pointer layer's move
   * path). The timestamp ages against `performance.now()` at keydown
   * time (sanctioned UI boundary).
   *
   * @param target Hit-test result for the current pointer position.
   * @param atMs Monotonic sample timestamp.
   */
  notePointer(target: CursorTarget, atMs: number): void {
    this.sample = { target, atMs };
  }

  /** Attach the document keydown listener. Idempotent per attach cycle. */
  attach(): void {
    if (this.handler !== null) {
      return;
    }
    this.handler = (event: KeyboardEvent) => {
      this.handleKeyDown(event);
    };
    document.addEventListener('keydown', this.handler);
  }

  /** Remove the listener and drop the cursor sample. */
  dispose(): void {
    if (this.handler !== null) {
      document.removeEventListener('keydown', this.handler);
      this.handler = null;
    }
    this.sample = null;
  }

  /** Translate + dispatch one keydown; ignores repeats and edits. */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) {
      return;
    }
    const target = event.target;
    // Interactive chrome (palette buttons, future modals/inputs) owns
    // its own keys — Space on a focused button must activate the
    // button, never clear pipes on the board.
    if (
      target instanceof Element &&
      target.closest('button, a, input, textarea, select, [role="toolbar"]') !== null
    ) {
      return;
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      return;
    }
    const nowMs = performance.now();
    const ageMs = this.sample === null ? null : nowMs - this.sample.atMs;
    const outcome = translateKey({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      state: this.store.getState(),
      cursor: this.sample?.target ?? null,
      cursorAgeMs: ageMs,
    });
    if (outcome.kind === 'action') {
      event.preventDefault();
      this.store.dispatch(outcome.action);
    }
  }
}
