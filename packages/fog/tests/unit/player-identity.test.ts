/**
 * Universal Player Identity — Fog Boundary Tests (issue #74, T022)
 *
 * Fog's public visibility API accepts the branded, server-issued
 * `PlayerId` string and MUST resolve it through the engine's
 * authoritative `PlayerRegistry` before computing visibility
 * (spec 002 v1.5, FR-010 / FR-011).
 *
 * This suite exercises the identity boundary directly:
 *
 *   1. **Valid ID views** — a registered ID resolves to its dense owner
 *      byte and receives its own horizon.
 *   2. **Fail closed** — unknown/forged/malformed/numeric IDs yield no
 *      cells and no events (never a fallback seat, never coercion).
 *   3. **Reconnect / seat reassignment** — the view follows the stable
 *      universal ID even when the seat/dense-index assignment changes;
 *      recomputation (reconnect) is byte-identical.
 *   4. **Spectator null handling** — a spectator's target ID is
 *      correlation-only, so a null/unresolved target still receives the
 *      full board with `null` cell owners; spectator authority is the
 *      server session flag, never the ID (FR-009).
 *   5. **Zero hidden-state leakage** — a failed identity discloses
 *      nothing, including player-level events.
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView, hashPlayerView } from '../../src/index';
import { computeVisibleSet, resolvePlayerOwnerByte } from '../../src/visibleSet';
import { A0, FORGED_ID, MALFORMED_ID, NUMERIC_ID, P1, P2, untrustedPlayerId } from '../fixtures/ids';
import { buildWorldWithTroops, buildWorldWithTroopsAndIds, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

/** Adversarial identities: any of these must fail closed. */
const UNRESOLVED_IDS = [FORGED_ID, MALFORMED_ID, NUMERIC_ID] as const;

/** A 16×16 world with two disjoint single-stack seats. */
function twoPlayerWorld(): ReturnType<typeof buildWorldWithTroops> {
    return withVisibilityRadius(
        buildWorldWithTroops(16, [
            [8, 8, P1, 5],
            [13, 13, P2, 7],
        ]),
        RADIUS,
    );
}

describe('fog universal PlayerId boundary (issue #74)', () => {
    describe('valid ID views', () => {
        it('resolves each registered ID to its own dense owner byte', () => {
            const world = twoPlayerWorld();
            expect(resolvePlayerOwnerByte(world, P1)).toBe(1);
            expect(resolvePlayerOwnerByte(world, P2)).toBe(2);
        });

        it('gives each registered ID its own horizon, not a shared seat', () => {
            const world = twoPlayerWorld();

            const p1View = computePlayerView(world, P1);
            const p2View = computePlayerView(world, P2);

            // P1 sees its own stack at (8,8); P2 sees its own at
            // (13,13). Each view is scoped to the matching identity.
            expect(p1View.player).toBe(P1);
            expect(p1View.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8)?.troopOwner).toBe(P1);
            expect(p2View.player).toBe(P2);
            expect(p2View.visibleCells.find((c) => c.coord.x === 13 && c.coord.y === 13)?.troopOwner).toBe(P2);

            // The stacks are 7 apart, so neither horizon reaches the
            // other stack's home cell.
            expect(p1View.visibleCells.find((c) => c.coord.x === 13 && c.coord.y === 13)).toBeUndefined();
            expect(p2View.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8)).toBeUndefined();
        });

        it('never compares a PlayerId string directly to a raw owner byte', () => {
            // The 1-based byte encoding means a valid ID always maps to
            // `index + 1`; a naive `troopOwners[idx] !== player` string
            // comparison used to silently produce an empty horizon.
            const world = twoPlayerWorld();
            // P1 at (8,8) is unclipped (49 cells); P2 at (13,13) is
            // clipped by the board's east/south edge (6×6 = 36).
            expect(computeVisibleSet(world, P1).visibleCells).toHaveLength(49);
            expect(computeVisibleSet(world, P2).visibleCells).toHaveLength(36);
        });
    });

    describe('unknown / forged / malformed / numeric IDs fail closed', () => {
        it('returns an empty VisibleSet and echoes the ID without selecting a seat', () => {
            const world = twoPlayerWorld();
            for (const unresolved of UNRESOLVED_IDS) {
                const visible = computeVisibleSet(world, unresolved, RADIUS);
                expect(visible.visibleCells).toHaveLength(0);
                expect(visible.player).toBe(unresolved);
            }
        });

        it('returns an empty PlayerView with no events for unresolved IDs', () => {
            const world = twoPlayerWorld();
            const events = {
                combat: [],
                captures: [],
                eliminations: [{ tick: world.tick, player: P2, reason: 'surrendered' as const }],
                appliedOrders: [],
                errors: [],
            };

            for (const unresolved of UNRESOLVED_IDS) {
                const view = computePlayerView(world, unresolved, { events });
                expect(view.player).toBe(unresolved);
                expect(view.visibleCells).toHaveLength(0);
                // Zero hidden-state leakage: not even player-level
                // events survive a failed identity resolution.
                expect(view.events).toEqual({
                    combat: [],
                    captures: [],
                    eliminations: [],
                    appliedOrders: [],
                    errors: [],
                });
            }
        });

        it('does not treat a numeric value as seat index 1', () => {
            const world = twoPlayerWorld();
            const numeric = computePlayerView(world, NUMERIC_ID);
            const seatOne = computePlayerView(world, P1);
            expect(numeric.visibleCells).toHaveLength(0);
            expect(seatOne.visibleCells).toHaveLength(49);
        });
    });

    describe('reconnect / seat reassignment preserves view association', () => {
        it('recomputes byte-identical output for the same ID (reconnect)', () => {
            const world = twoPlayerWorld();
            const first = hashPlayerView(computePlayerView(world, P1));
            const second = hashPlayerView(computePlayerView(world, P1));
            expect(second).toBe(first);
        });

        it('keeps the same horizon for an ID when the seat/index assignment changes', () => {
            // `A0` sorts before `P1` in UTF-16, so including it in the
            // roster shifts P1 from dense index 0 to dense index 1 (and
            // its 1-based owner byte from 1 to 2). The `PlayerId` itself
            // never changes; only the seat/index assignment does.
            const worldP1First = withVisibilityRadius(
                buildWorldWithTroopsAndIds(
                    16,
                    [
                        [8, 8, P1, 5],
                        [13, 13, P2, 7],
                    ],
                    [P1, P2],
                ),
                RADIUS,
            );
            const worldP1Second = withVisibilityRadius(
                buildWorldWithTroopsAndIds(
                    16,
                    [
                        [8, 8, P1, 5],
                        [13, 13, A0, 7],
                    ],
                    [A0, P1],
                ),
                RADIUS,
            );

            // The reassignment is real: P1's dense seat changed…
            expect(worldP1First.playerRegistry.indexOfId(P1)).toBe(0);
            expect(worldP1Second.playerRegistry.indexOfId(P1)).toBe(1);

            // …yet the view association follows the ID.
            const viewA = computePlayerView(worldP1First, P1);
            const viewB = computePlayerView(worldP1Second, P1);
            expect(viewA.player).toBe(P1);
            expect(viewB.player).toBe(P1);
            expect(viewB.visibleCells).toEqual(viewA.visibleCells);
            // P1 still sees P1's stack, not the reassigned seat's stack.
            expect(viewB.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8)?.troopOwner).toBe(P1);
            expect(viewB.visibleCells.find((c) => c.coord.x === 13 && c.coord.y === 13)).toBeUndefined();
        });
    });

    describe('spectator null handling (ID is metadata, not authority)', () => {
        it('honors a null spectator target: full board, null cell owners', () => {
            const world = twoPlayerWorld();
            const nullTarget = untrustedPlayerId(null);

            // Non-spectator null fails closed…
            expect(computePlayerView(world, nullTarget).visibleCells).toHaveLength(0);

            // …but a spectator session sees everything, because the
            // server's read-only flag — not the target ID — is the
            // authority.
            const view = computePlayerView(world, nullTarget, { spectator: true });
            expect(view.player).toBeNull();
            expect(view.visibleCells).toHaveLength(16 * 16);

            // Neutral cells decode owners as null (no numeric sentinel
            // leaks into the payload).
            const neutral = view.visibleCells.find((c) => c.coord.x === 0 && c.coord.y === 0);
            expect(neutral?.troopOwner).toBeNull();
            expect(neutral?.cityOwner).toBeNull();
        });

        it('does not let an unresolved spectator target select a horizon', () => {
            const world = twoPlayerWorld();
            const forged = computePlayerView(world, FORGED_ID, { spectator: true });
            // The spectator view is identity-independent — every cell,
            // regardless of the (unregistered) target.
            expect(forged.visibleCells).toHaveLength(16 * 16);
        });
    });
});
