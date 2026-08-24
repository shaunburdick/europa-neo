/**
 * Terminal resolution phase — Feature 001, T048
 *
 * Pure `resolveTerminal(state, prevPlayers, constants, tickNumber): { players, events, terminal? }`.
 *
 * Per FR-015, a player is eliminated when they hold zero troops AND
 * zero cities. Per FR-016, surrender immediately marks the player
 * eliminated (handled in `applyCommand`).
 *
 * **Elimination detection** (FR-015):
 *   - For each player who was alive at the start of this tick (per
 *     `prevPlayers`), check `troopsHeld === 0 && citiesOwned === 0`.
 *   - If true, emit `EliminationEvent { reason: 'no_troops_no_cities' }`
 *     and mark the player `'eliminated'` in the returned `players`.
 *   - Already-eliminated/surrendered players are NOT re-emitted
 *     (idempotent).
 *
 * **Match resolution**:
 *   - Count alive players after this tick's elimination pass.
 *   - If 0 alive (mutual elimination): emit `MatchResult { kind: 'draw',
 *     reason: 'mutual_elimination' }`.
 *   - If 1 alive: emit `MatchResult { kind: 'win', winner: <id>,
 *     reason: 'last_standing' }`.
 *   - Otherwise (≥ 2 alive): no terminal; match continues.
 *
 * **Determinism**: row-major iteration; integer math only.
 */

import type { EngineConstants } from '../contracts/engine-api';
import { emptyTickEvents, pushEliminationEvent } from '../events';
import type { EliminationEvent, MatchResult, Player, PlayerId, TickEvents, WorldState } from '../types';

interface TerminalResolutionResult {
    players: readonly Player[];
    events: TickEvents;
    terminal?: MatchResult | undefined;
}

/**
 * Resolve one tick's terminal detection. Pure.
 *
 * @param state        Current (post-decay) world state.
 * @param prevPlayers  Player snapshot from BEFORE this tick's terminal
 *                     phase. Used to know each player's pre-tick
 *                     `status`, `troopsHeld`, and `citiesOwned` so we
 *                     can distinguish "always at 0/0" spectators from
 *                     "just lost everything" eliminated players.
 * @param constants    Engine rule constants (reserved for future
 *                     tunables; unused today).
 * @param tickNumber   Tick number to stamp on every emitted EliminationEvent.
 * @returns `{ players, events, terminal? }`.
 */
export function resolveTerminal(
    state: Readonly<WorldState>,
    prevPlayers: readonly Player[],
    constants: EngineConstants,
    tickNumber: number,
): TerminalResolutionResult {
    void constants;

    // Recompute troopsHeld + citiesOwned per player from `state` (the
    // post-decay snapshot).
    const troopsByPlayer = new Map<PlayerId, number>();
    const citiesByPlayer = new Map<PlayerId, number>();
    for (let i = 0; i < state.troopCounts.length; i++) {
        const owner = state.troopOwners[i] ?? 0;
        if (owner === 0) {
            continue;
        }
        const prev = troopsByPlayer.get(owner as PlayerId) ?? 0;
        troopsByPlayer.set(owner as PlayerId, prev + (state.troopCounts[i] ?? 0));
    }
    for (let i = 0; i < state.cityOwners.length; i++) {
        const owner = state.cityOwners[i] ?? 0;
        if (owner === 0) {
            continue;
        }
        const prev = citiesByPlayer.get(owner as PlayerId) ?? 0;
        citiesByPlayer.set(owner as PlayerId, prev + 1);
    }

    let events: TickEvents = emptyTickEvents();
    const updatedPlayers: Player[] = [];

    for (const prev of prevPlayers) {
        const troops = troopsByPlayer.get(prev.id) ?? 0;
        const cities = citiesByPlayer.get(prev.id) ?? 0;

        // Already out — preserve status, don't re-emit.
        if (prev.status === 'eliminated' || prev.status === 'surrendered') {
            updatedPlayers.push({
                id: prev.id,
                displayName: prev.displayName,
                status: prev.status,
                citiesOwned: cities,
                troopsHeld: troops,
            });
            continue;
        }

        // FR-015: zero troops AND zero cities → eliminated.
        if (troops === 0 && cities === 0) {
            const ev: EliminationEvent = {
                tick: tickNumber,
                player: prev.id,
                reason: 'no_troops_no_cities',
            };
            events = pushEliminationEvent(events, ev);
            updatedPlayers.push({
                id: prev.id,
                displayName: prev.displayName,
                status: 'eliminated',
                citiesOwned: cities,
                troopsHeld: troops,
            });
            continue;
        }

        // Still alive (either has troops/cities now, or never had any).
        updatedPlayers.push({
            id: prev.id,
            displayName: prev.displayName,
            status: 'alive',
            citiesOwned: cities,
            troopsHeld: troops,
        });
    }

    // Count alive players in ascending PlayerId order (deterministic).
    const alive = updatedPlayers.filter((p) => p.status === 'alive');
    alive.sort((a, b) => a.id - b.id);

    let terminal: MatchResult | undefined;
    if (alive.length === 0) {
        terminal = { kind: 'draw', tick: tickNumber, reason: 'mutual_elimination' };
    } else if (alive.length === 1) {
        const [winner] = alive;
        if (winner !== undefined) {
            terminal = {
                kind: 'win',
                winner: winner.id,
                tick: tickNumber,
                reason: 'last_standing',
            };
        }
    }

    return { players: updatedPlayers, events, terminal };
}
