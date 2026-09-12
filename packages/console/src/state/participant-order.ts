/**
 * Participant presentation helpers — issue #74 (universal `PlayerId`).
 *
 * The console keys every participant by the server-issued canonical
 * `PlayerId`. Presentation order is the match's terrain placement-slot
 * (seat) order — the same order the engine's `MatchConfig.playerIds`
 * carries — so the participant strip is stable regardless of the
 * canonical UTF-16 ordering the engine registry uses internally.
 *
 * Shared by the player reducer (`reducer.ts`) and the spectator session
 * fold (`spectator-session.ts`) so both legs present participants
 * identically. Pure — no side effects, no clocks.
 *
 * @module
 */

import type { ConsoleParticipant, Player, PlayerId } from './types';

/**
 * Extract a real human handle from a server roster entry, or `null`
 * when the entry carries only the engine's raw-ID placeholder (issue
 * #74): the engine's `displayName` is the raw ID unless the matchmaker
 * overlaid a registered handle, so a placeholder is rejected here — the
 * ID stays the fallback label, never a handle. Pure.
 *
 * @param player Server roster entry.
 * @returns The registered handle, or `null`.
 */
export function humanHandleOf(player: Player): string | null {
    if (player.displayName === '' || player.displayName === player.id) {
        return null;
    }
    return player.displayName;
}

/**
 * Order the server roster into terrain placement-slot (seat) order,
 * keyed by each participant's server-issued `PlayerId`. Players absent
 * from `playerIds` are appended in roster order so a defensive server
 * shape still renders every known participant. Pure.
 *
 * @param playerIds The view's placement-slot identity order.
 * @param players The server roster (engine registry order).
 * @param localId The local viewer's identity, or `null` for spectators.
 * @returns Participants in placement-slot order.
 */
export function orderParticipants(
    playerIds: readonly PlayerId[],
    players: readonly Player[],
    localId: PlayerId | null,
): ReadonlyArray<ConsoleParticipant> {
    const byId = new Map<PlayerId, Player>();
    for (const player of players) {
        byId.set(player.id, player);
    }
    const ordered: ConsoleParticipant[] = [];
    const seen = new Set<PlayerId>();
    for (const id of playerIds) {
        const player = byId.get(id);
        if (player === undefined) {
            continue;
        }
        seen.add(id);
        ordered.push({ id, name: humanHandleOf(player), isLocal: id === localId });
    }
    for (const player of players) {
        if (!seen.has(player.id)) {
            ordered.push({ id: player.id, name: humanHandleOf(player), isLocal: player.id === localId });
        }
    }
    return ordered;
}
