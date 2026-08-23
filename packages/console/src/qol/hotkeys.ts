/**
 * Configurable hotkey dispatcher — Feature 005 (T079).
 *
 * The US5 QoL layer over the keyboard pipeline (research.md §7
 * "Hotkey mapping table"): every binding lives in a declarative
 * `InputMapping` table (contracts/console-types.ts), the host can
 * replace it wholesale via `ConsoleConfig.inputMapping`, and this
 * module routes each keydown to its semantic action.
 *
 * Layering (single source of truth):
 *   1. {@link buildHotkeyTable} — pure projection of an `InputMapping`
 *      into a `key → HotkeyId` routing table. This is the testable
 *      contract surface for Q-U10 ("every default key is bound; no
 *      two bindings share the same key string").
 *   2. {@link findHotkeyCollisions} — pure duplicate-key detector used
 *      by tests and by {@link buildHotkeyTable} (a colliding table is
 *      rejected loudly rather than silently shadowing a binding).
 *   3. {@link resolveInputMapping} — `config.inputMapping ??
 *      DEFAULT_INPUT_MAPPING` (the contract's override mechanism: the
 *      host supplies a complete replacement table).
 *   4. {@link HotkeyController} — the document-level listener. It
 *      delegates translation to `translateKey(args, mapping)`
 *      (order-draft.ts), so configurable bindings flow through the
 *      EXACT same semantics as the default set — one implementation,
 *      zero drift.
 *
 * Pointer bindings (`pipeToggle` / `pipeExclusive`) are consumed by
 * the region-select layer and intentionally absent from the key
 * table. The original's F-key extras (F2 sound / F10 surrender /
 * F11 fullscreen — research.md §7) are not part of the contractual
 * `InputMapping` union and are therefore not bound here (documented
 * deviation; surrender ships as a visible HUD control instead).
 *
 * Gating: order-producing keys respect `state.inputEnabled` via
 * translateKey; local-only keys (arrows, Escape) stay usable.
 *
 * JSDoc references: FR-004 + research.md §7 + Q-U10.
 */

import { shouldIgnoreKeyEvent, translateKey } from '../input/order-draft';
import type { ConsoleStore } from '../state/store';
import type { CursorTarget, InputMapping } from '../state/types';
import { DEFAULT_INPUT_MAPPING } from '../state/types';

/**
 * Semantic identifier for one keyboard binding. Derived strictly
 * from the `InputMapping` fields (plus the per-digit reserve keys).
 */
export type HotkeyId =
  | 'pipeNorth'
  | 'pipeWest'
  | 'pipeSouth'
  | 'pipeEast'
  | 'pipeNorthExclusive'
  | 'pipeWestExclusive'
  | 'pipeSouthExclusive'
  | 'pipeEastExclusive'
  | 'clearCellPipes'
  | 'paratroop'
  | 'gun'
  | `reserve${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'cancel'
  | 'moveNorth'
  | 'moveWest'
  | 'moveSouth'
  | 'moveEast';

/**
 * Project an `InputMapping` into the `key → HotkeyId` routing table.
 * Single-character keys are lower-cased; `Alt+<key>` chords are kept
 * as distinct entries. Throws when two bindings share a key string —
 * a collision would silently shadow one of the bindings. Pure.
 *
 * @param mapping Control table to project.
 */
export function buildHotkeyTable(mapping: InputMapping): ReadonlyMap<string, HotkeyId> {
  const collisions = findHotkeyCollisions(mapping);
  if (collisions.length > 0) {
    throw new Error(`InputMapping has duplicate key bindings: ${collisions.join(', ')}`);
  }
  const table = new Map<string, HotkeyId>();
  const bind = (key: string, id: HotkeyId): void => {
    table.set(normalizeKey(key), id);
  };

  bind(mapping.pipeKeys.pipeNorth, 'pipeNorth');
  bind(mapping.pipeKeys.pipeWest, 'pipeWest');
  bind(mapping.pipeKeys.pipeSouth, 'pipeSouth');
  bind(mapping.pipeKeys.pipeEast, 'pipeEast');
  // Exclusive chords are DISTINCT bindings (`Alt+i` ≠ `i`) and are
  // stored under their full chord string.
  bind(mapping.pipeExclusiveKeys.pipeNorth, 'pipeNorthExclusive');
  bind(mapping.pipeExclusiveKeys.pipeWest, 'pipeWestExclusive');
  bind(mapping.pipeExclusiveKeys.pipeSouth, 'pipeSouthExclusive');
  bind(mapping.pipeExclusiveKeys.pipeEast, 'pipeEastExclusive');
  bind(mapping.clearCellPipes, 'clearCellPipes');
  bind(mapping.paratroopPrimary, 'paratroop');
  bind(mapping.paratroopAlt, 'paratroop');
  bind(mapping.gunPrimary, 'gun');
  bind(mapping.gunAlt, 'gun');
  mapping.reserveKeys.forEach((key, digit) => {
    bind(key, `reserve${digit as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` as HotkeyId);
  });
  bind(mapping.cancel, 'cancel');
  bind(mapping.selectionMove.north, 'moveNorth');
  bind(mapping.selectionMove.west, 'moveWest');
  bind(mapping.selectionMove.south, 'moveSouth');
  bind(mapping.selectionMove.east, 'moveEast');
  return table;
}

/**
 * Return every key string bound more than once in `mapping`
 * (empty array = unique). Pure; the Q-U10 uniqueness check.
 *
 * @param mapping Control table to inspect.
 */
export function findHotkeyCollisions(mapping: InputMapping): ReadonlyArray<string> {
  const seen = new Map<string, number>();
  const count = (key: string): void => {
    const normalized = normalizeKey(key);
    seen.set(normalized, (seen.get(normalized) ?? 0) + 1);
  };
  count(mapping.pipeKeys.pipeNorth);
  count(mapping.pipeKeys.pipeWest);
  count(mapping.pipeKeys.pipeSouth);
  count(mapping.pipeKeys.pipeEast);
  // Exclusive chords count as their own key strings (`Alt+i` ≠ `i`).
  for (const chord of Object.values(mapping.pipeExclusiveKeys)) {
    count(chord);
  }
  count(mapping.clearCellPipes);
  count(mapping.paratroopPrimary);
  count(mapping.paratroopAlt);
  count(mapping.gunPrimary);
  count(mapping.gunAlt);
  for (const key of mapping.reserveKeys) {
    count(key);
  }
  count(mapping.cancel);
  count(mapping.selectionMove.north);
  count(mapping.selectionMove.west);
  count(mapping.selectionMove.south);
  count(mapping.selectionMove.east);
  return [...seen.entries()].filter(([, times]) => times > 1).map(([key]) => key);
}

/**
 * Resolve the effective control table: the host's
 * `ConsoleConfig.inputMapping` replaces the default wholesale (the
 * contract's documented override mechanism). Pure.
 *
 * @param override Host-supplied table, or `undefined`.
 */
export function resolveInputMapping(override?: InputMapping | undefined): InputMapping {
  return override ?? DEFAULT_INPUT_MAPPING;
}

/** Normalize a key string exactly like the translator does. */
function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Cursor sample bookkeeping shared with the pointer layer. */
interface CursorSample {
  readonly target: CursorTarget;
  readonly atMs: number;
}

/** Options for {@link HotkeyController}. */
export interface HotkeyControllerOptions {
  /** Replacement control table; defaults to the original mapping. */
  readonly mapping?: InputMapping | undefined;
}

/**
 * Document-level configurable hotkey dispatcher. Behaviorally a
 * superset of {@link OrderDraftController}: identical gating
 * (repeats, interactive chrome) and identical translation semantics
 * (delegates to `translateKey` with the resolved mapping), plus
 * per-host configurability.
 */
export class HotkeyController {
  private readonly store: ConsoleStore;

  private readonly mapping: InputMapping;

  private sample: CursorSample | null = null;

  private handler: ((event: KeyboardEvent) => void) | null = null;

  /**
   * @param store   Dispatch target + state source.
   * @param options Optional mapping override (see {@link HotkeyControllerOptions}).
   */
  constructor(store: ConsoleStore, options?: HotkeyControllerOptions) {
    this.store = store;
    this.mapping = resolveInputMapping(options?.mapping);
  }

  /**
   * Record a fresh cursor sample (call from the pointer layer's move
   * path) so subcell aims stay fresh for paratroop/gun.
   *
   * @param target Hit-test result for the current pointer position.
   * @param atMs   Monotonic sample timestamp.
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

  /** Translate + dispatch one keydown through the configured table. */
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
      mapping: this.mapping,
    });
    if (outcome.kind === 'action') {
      event.preventDefault();
      this.store.dispatch(outcome.action);
    }
  }
}
