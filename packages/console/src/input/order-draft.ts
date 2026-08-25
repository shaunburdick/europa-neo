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
import type { ConsoleState, Coord, CursorTarget, Direction, InputMapping, PlayerAction } from '../state/types';
import { DEFAULT_INPUT_MAPPING } from '../state/types';
import { buildReservesAction, type ReservesOutcome } from './order-reserves';
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
    /**
     * Control table to translate against. Defaults to
     * `DEFAULT_INPUT_MAPPING`; the US5 hotkey layer (T079) passes the
     * host-overridden table so configurable bindings flow through the
     * exact same semantics.
     */
    readonly mapping?: InputMapping;
}

/**
 * Translate one keydown into a `PlayerAction` (or an explained
 * ignore). Pure (spec US2 AC-3/4 + FR-004).
 *
 * @param args The key event fields plus console snapshot + cursor aim.
 */
export function translateKey(args: TranslateKeyArgs): DraftOutcome {
    const { key, altKey, ctrlKey, metaKey, state, cursor, cursorAgeMs } = args;
    const mapping = args.mapping ?? DEFAULT_INPUT_MAPPING;

    // Browser chords win — never fight the host shortcuts.
    if (ctrlKey || metaKey) {
        return { kind: 'ignore', reason: 'unbound-key' };
    }

    const normalized = key.length === 1 ? key.toLowerCase() : key;

    // --- Pipe keys (i/j/k/l, Alt = exclusive) — US2 AC-3 ---
    const pipeDirection = lookupPipeDirection(normalized, altKey, mapping);
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
    if (normalized === mapping.clearCellPipes) {
        if (!state.inputEnabled) {
            return { kind: 'ignore', reason: 'not-live' };
        }
        if (state.selection === null) {
            return { kind: 'ignore', reason: 'no-selection' };
        }
        return { kind: 'action', action: { kind: 'clearAllPipes', cell: state.selection } };
    }

    // --- Paratroop / gun via the subcell targeting core — US3 AC-1/2/3 ---
    const ability = lookupAbility(normalized, mapping);
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

    // --- Reserves digits 0-9 (10×digit percent) — delegated to the
    // --- dedicated US4 module (T070); `null` = not a reserve key.
    const reservesOutcome = buildReservesAction(state, normalized, mapping);
    if (reservesOutcome !== null) {
        return outcomeToDraft(reservesOutcome);
    }

    // --- Escape cancels: clear the selection (local-only) ---
    if (key === mapping.cancel) {
        return { kind: 'action', action: { kind: 'selectCell', cell: null } };
    }

    // --- Arrows move the keyboard anchor (local-only) ---
    const arrowDirection = lookupArrowDirection(key, mapping);
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

/**
 * Convert a targeting or reserves outcome into a draft outcome (no
 * information loss). The two unions use different discriminants
 * (`status` vs `kind`), so they are narrowed structurally first.
 */
function outcomeToDraft(outcome: TargetingOutcome | ReservesOutcome): DraftOutcome {
    if ('status' in outcome) {
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
    switch (outcome.kind) {
        case 'action':
            return { kind: 'action', action: outcome.action };
        case 'ignore':
            return { kind: 'ignore', reason: outcome.reason };
        default:
            return outcome satisfies never;
    }
}

/**
 * Resolve a keydown to its pipe direction under `mapping`. Without
 * Alt the base `pipeKeys` table decides; with Alt the chord must
 * match a `pipeExclusiveKeys` entry (`Alt+<key>`), so custom tables
 * can bind exclusive variants to different letters than the toggles.
 * Returns `null` for non-pipe keys. Pure.
 */
function lookupPipeDirection(key: string, altKey: boolean, mapping: InputMapping): Direction | null {
    if (altKey) {
        const chord = `alt+${key}`;
        const exclusive = mapping.pipeExclusiveKeys;
        if (chord === exclusive.pipeNorth.toLowerCase()) {
            return 'N';
        }
        if (chord === exclusive.pipeWest.toLowerCase()) {
            return 'W';
        }
        if (chord === exclusive.pipeSouth.toLowerCase()) {
            return 'S';
        }
        if (chord === exclusive.pipeEast.toLowerCase()) {
            return 'E';
        }
        return null;
    }
    const table = mapping.pipeKeys;
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
 * Resolve p/h/g/o to their ability kind from `mapping`. Returns
 * `null` for other keys. Pure.
 */
function lookupAbility(key: string, mapping: InputMapping): AbilityKind | null {
    if (key === mapping.paratroopPrimary || key === mapping.paratroopAlt) {
        return 'paratroop';
    }
    if (key === mapping.gunPrimary || key === mapping.gunAlt) {
        return 'gun';
    }
    return null;
}

/** Arrow-key → focus-direction mapping (KeyboardNavigator alphabet). */
function lookupArrowDirection(key: string, mapping: InputMapping): FocusDirection | null {
    switch (key) {
        case mapping.selectionMove.north:
            return 'N';
        case mapping.selectionMove.west:
            return 'W';
        case mapping.selectionMove.south:
            return 'S';
        case mapping.selectionMove.east:
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
 * Whether a keydown should be ignored before translation: repeats,
 * already-handled events, and events targeting interactive chrome
 * (palette buttons, modals, inputs — Space on a focused button must
 * activate the button, never clear pipes on the board). Shared by
 * {@link OrderDraftController} and the US5 hotkey layer (T079) so
 * both controllers gate identically.
 */
export function shouldIgnoreKeyEvent(event: {
    readonly defaultPrevented: boolean;
    readonly repeat: boolean;
    readonly target: EventTarget | null;
}): boolean {
    if (event.defaultPrevented || event.repeat) {
        return true;
    }
    const { target } = event;
    if (target instanceof Element && target.closest('button, a, input, textarea, select, [role="toolbar"]') !== null) {
        return true;
    }
    return target instanceof HTMLElement && target.isContentEditable;
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
        if (shouldIgnoreKeyEvent(event)) {
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
