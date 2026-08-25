/**
 * Paratroop / gun targeting builder — Feature 005 (T061).
 *
 * The shared core of the US3 ability pipeline (spec US3 AC-1/2/3,
 * FR-005, FR-006): turns "the focused cell + the cursor's subcell
 * aim" into a validated `paratroop`/`gun` `PlayerAction`, or explains
 * why no order may be issued.
 *
 * Pipeline per task text:
 *   1. source = `state.selection` (the focused cell);
 *   2. aim    = last-known cursor subcell (`CursorTarget.subcell`);
 *   3. target = `subcellToTargetCoord(source, subcell)` (T033's
 *      5-bin rule; center bin ⇒ self ⇒ no launch);
 *   4. gate   = `localPreflightOrder` (T026) BEFORE the action is
 *      emitted toward the order bridge — out-of-range, water, and
 *      off-horizon targets never leave the client (US3 AC-3), while
 *      enemy-owned targets pass through (the server is final
 *      authority per FR-006).
 *
 * Cursor staleness (research.md §13 ambiguity #3): if the cursor has
 * not moved within {@link CURSOR_STALE_MS}, the aim defaults to the
 * cell center — which means "no launch". The caller supplies the age;
 * this module stays wall-clock-free (constitution Principle II).
 *
 * Pure: every function is a function of its arguments.
 */

import { localPreflightOrder } from '../state/local-preflight';
import type { ConsoleStore } from '../state/store';
import type { ConsoleState, Coord, CursorTarget, PlayerAction, ValidationError } from '../state/types';
import { subcellToTargetCoord } from './subcell';

/** The two special abilities sharing the subcell targeting scheme. */
export type AbilityKind = 'paratroop' | 'gun';

/**
 * Cursor recency window (ms). Aims older than this are treated as
 * "cursor centered" → no launch (research.md §13 #3).
 */
export const CURSOR_STALE_MS = 500;

/**
 * Why no launch happened. `center-subcell` and `stale-cursor` are the
 * documented silent cases (research.md §13 #3); the others are
 * missing-anchor guards.
 */
export type NoLaunchReason = 'no-selection' | 'no-cursor' | 'stale-cursor' | 'center-subcell' | 'self-target';

/**
 * The outcome of a targeting request:
 *   - `ok`        — dispatch `action` into the store (it will flow to
 *     the order bridge as a `sendOrder` effect);
 *   - `no_launch` — nothing to send (aim centered/stale or no anchor);
 *   - `rejected`  — local preflight blocked the order before any wire
 *     traffic (US3 AC-3); `reason` is the engine-shaped validation
 *     error for feedback formatting.
 */
export type TargetingOutcome =
    | {
          readonly status: 'ok';
          readonly action: Extract<PlayerAction, { readonly kind: AbilityKind }>;
      }
    | { readonly status: 'no_launch'; readonly reason: NoLaunchReason }
    | { readonly status: 'rejected'; readonly reason: ValidationError };

/** Arguments for {@link buildAbilityAction}. */
export interface AbilityArgs {
    /** Which ability to fire. */
    readonly kind: AbilityKind;
    /** The focused cell (`state.selection`) — the launch/origin source. */
    readonly selection: Coord | null;
    /** Last-known cursor hit-test result (aim provider), or `null`. */
    readonly cursor: CursorTarget | null;
    /**
     * Age of the cursor sample in ms (`null` = never moved). Ages above
     * {@link CURSOR_STALE_MS} count as centered (research.md §13 #3).
     */
    readonly cursorAgeMs: number | null;
    /** Fully resolved console snapshot (view + seat are read from it). */
    readonly state: ConsoleState;
}

/**
 * Build the paratroop/gun action for the current aiming posture,
 * gated by the local preflight. Pure (spec US3 AC-1/2/3).
 *
 * Fail-closed: a missing view, missing seat, missing anchor, or any
 * preflight rejection yields a non-`ok` outcome and NO action.
 *
 * @param args Targeting inputs (see {@link AbilityArgs}).
 */
export function buildAbilityAction(args: AbilityArgs): TargetingOutcome {
    const { kind, selection, cursor, cursorAgeMs, state } = args;

    if (selection === null) {
        return { status: 'no_launch', reason: 'no-selection' };
    }
    const {
        latestView: view,
        session: { playerId },
    } = state;
    if (view === null || playerId === null) {
        // No authoritative board / no seat: fail closed (FR-006).
        return { status: 'rejected', reason: { kind: 'out_of_bounds', coord: selection } };
    }

    const subcell =
        cursor === null || cursor.subcell === null
            ? null
            : cursorAgeMs !== null && cursorAgeMs > CURSOR_STALE_MS
              ? null
              : cursor.subcell;

    if (cursor === null || cursor.subcell === null) {
        return { status: 'no_launch', reason: 'no-cursor' };
    }
    if (subcell === null) {
        return { status: 'no_launch', reason: 'stale-cursor' };
    }

    const target = subcellToTargetCoord(selection, subcell);
    if (target.x === selection.x && target.y === selection.y) {
        // Center bin (or off-board fail-safe in subcell.ts): self-target
        // ⇒ no launch (contracts/console-types.ts §"Subcell targeting").
        const centered = subcell.x >= 0.4 && subcell.x < 0.6 && subcell.y >= 0.4 && subcell.y < 0.6;
        return {
            status: 'no_launch',
            reason: centered ? 'center-subcell' : 'self-target',
        };
    }

    const provisional = { kind, player: playerId, source: selection, target } as const;
    const rejection = localPreflightOrder(provisional, view, playerId);
    if (rejection !== null) {
        return { status: 'rejected', reason: rejection };
    }
    return {
        status: 'ok',
        action: { kind, source: selection, target },
    };
}

/**
 * Convenience probe: whether a cursor sample counts as fresh at the
 * given age. Exposed so callers share ONE staleness rule. Pure.
 *
 * @param cursorAgeMs Age in ms, or `null` when the cursor never moved.
 */
export function isCursorFresh(cursorAgeMs: number | null): boolean {
    return cursorAgeMs !== null && cursorAgeMs <= CURSOR_STALE_MS;
}

/** Arguments for {@link fireAbility} (the keyboard-hook entry point). */
export interface AbilityFireArgs {
    /** Dispatch target + state source. */
    readonly store: ConsoleStore;
    /** Last-known cursor sample for the aim, or `null`. */
    readonly cursor: CursorTarget | null;
    /** Age of the cursor sample in ms (`null` = never moved). */
    readonly cursorAgeMs: number | null;
}

/**
 * Build AND dispatch one ability action against a live store
 * (spec US3 AC-1/2). Shared implementation behind the thin
 * `order-paratroop` / `order-gun` keyboard hooks (T063): `ok`
 * outcomes are dispatched into the store (flowing to the order
 * bridge as a `sendOrder` effect); every other outcome leaves the
 * store untouched and is returned for caller-side feedback.
 *
 * @param kind  Which ability to fire.
 * @param args  Store + cursor aim (see {@link AbilityFireArgs}).
 */
export function fireAbility(kind: AbilityKind, args: AbilityFireArgs): TargetingOutcome {
    const state = args.store.getState();
    const outcome = buildAbilityAction({
        kind,
        selection: state.selection,
        cursor: args.cursor,
        cursorAgeMs: args.cursorAgeMs,
        state,
    });
    if (outcome.status === 'ok') {
        args.store.dispatch(outcome.action);
    }
    return outcome;
}
