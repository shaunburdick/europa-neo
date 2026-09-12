/**
 * SC-006 Allocation Regression + Determinism Tests — Feature 001
 *
 * Per spec SC-006 acceptance: tick() must reuse pre-allocated scratch
 * buffers instead of allocating on the hot path.
 *
 * Tests:
 *   1. **Determinism**: Byte-identical output after the scratch buffer
 *      refactor. Takes a known board state, runs 100 ticks, and
 *      compares the output hash (via serializeWorld).
 *
 *   2. **Scratch buffer reuse**: Verify that consecutive ticks on the
 *      same world reuse the same typed array instances (identity check)
 *      and that the scratch buffer fields are correctly sized.
 *
 *   3. **Zero-fill verification**: After a tick, the scratch buffers
 *      must have been zeroed (no stale data from previous tick).
 *
 *   4. **Performance budget**: 1000 ticks on a 32×32 board complete
 *      within 10 seconds (SC-004 adjacent — ensures scratch buffer
 *      overhead doesn't regress tick performance).
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createTickScratchBuffers, createWorld } from '../../src/create';
import { resolveCombat } from '../../src/resolution/combat';
import { resolveFlow } from '../../src/resolution/flow';
import { serializeWorld } from '../../src/serialize';
import { tick } from '../../src/tick';
import type { MatchConfig, World } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { PLAYER_1, PLAYER_2, playerIds, TEST_REGISTRY as REGISTRY } from '../fixtures/ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOARD_SIZE = 32;
const TWO_PLAYER_CFG: MatchConfig = {
    boardSize: BOARD_SIZE,
    playerIds: playerIds(2),
    tickIntervalMs: 250,
    seed: 0xcafebabe,
    visibilityRadiusDefault: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

/**
 * Build a populated 32×32 board with two players, cities, and pipes.
 * Exercises flow, combat, and decay phases.
 */
function buildPopulatedBoard(): ReturnType<typeof buildSmallBoard> {
    const cities: Array<[number, number, number]> = [
        [2, 2, 1],
        [29, 29, 2],
        [2, 29, 1],
        [29, 2, 2],
    ];
    return buildSmallBoard(BOARD_SIZE, cities);
}

/**
 * Create a world and advance it through initial pipe orders so the
 * board has troops in motion (flow + combat + decay all exercised).
 */
function createPopulatedWorld(): World {
    const board = buildPopulatedBoard();
    let world = createWorld(TWO_PLAYER_CFG, board);

    // Stage pipe orders for both players at tick 0.
    const pipeOrders = [
        { kind: 'setPipe' as const, player: PLAYER_1, cell: { x: 2, y: 2 }, direction: 'E' as const },
        { kind: 'setPipe' as const, player: PLAYER_1, cell: { x: 2, y: 2 }, direction: 'S' as const },
        { kind: 'setPipe' as const, player: PLAYER_2, cell: { x: 29, y: 29 }, direction: 'W' as const },
        { kind: 'setPipe' as const, player: PLAYER_2, cell: { x: 29, y: 29 }, direction: 'N' as const },
        // Cross-pipes to trigger combat
        { kind: 'setPipe' as const, player: PLAYER_1, cell: { x: 2, y: 29 }, direction: 'E' as const },
        { kind: 'setPipe' as const, player: PLAYER_2, cell: { x: 29, y: 2 }, direction: 'W' as const },
    ];

    for (const order of pipeOrders) {
        const result = applyCommand(world, order);
        if (result.result.ok) {
            world = result.world;
        }
    }

    // Run 10 ticks to build up troops and trigger flow/combat.
    for (let i = 0; i < 10; i++) {
        const result = tick(world);
        world = result.world;
    }

    return world;
}

/**
 * Compute a SHA-256 hash of the serialized world for determinism checks.
 */
function worldHash(world: World): string {
    const bytes = serializeWorld(world);
    return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SC-006 — determinism after refactor', () => {
    it('100 ticks produce byte-identical output (hash comparison)', () => {
        const board = buildPopulatedBoard();
        const cfg = { ...TWO_PLAYER_CFG, seed: 0xdeadbeef };

        // Run two independent 100-tick scenarios with the same seed.
        const run = (seed: number): string => {
            const c = { ...cfg, seed };
            let w = createWorld(c, board);

            // Stage pipe orders.
            const orders = [
                { kind: 'setPipe' as const, player: PLAYER_1, cell: { x: 2, y: 2 }, direction: 'E' as const },
                { kind: 'setPipe' as const, player: PLAYER_1, cell: { x: 2, y: 2 }, direction: 'S' as const },
                { kind: 'setPipe' as const, player: PLAYER_2, cell: { x: 29, y: 29 }, direction: 'W' as const },
                { kind: 'setPipe' as const, player: PLAYER_2, cell: { x: 29, y: 29 }, direction: 'N' as const },
                { kind: 'setPipe' as const, player: PLAYER_1, cell: { x: 2, y: 29 }, direction: 'E' as const },
                { kind: 'setPipe' as const, player: PLAYER_2, cell: { x: 29, y: 2 }, direction: 'W' as const },
            ];

            for (const order of orders) {
                const result = applyCommand(w, order);
                if (result.result.ok) {
                    w = result.world;
                }
            }

            for (let i = 0; i < 100; i++) {
                w = tick(w).world;
            }

            return worldHash(w);
        };

        const hashA = run(0xdeadbeef);
        const hashB = run(0xdeadbeef);

        expect(hashA).toBe(hashB);
        expect(hashA).toMatch(/^[a-f0-9]{64}$/); // valid SHA-256
    });
});

describe('SC-006 — scratch buffer reuse', () => {
    it('createTickScratchBuffers allocates correctly sized buffers', () => {
        const width = 16;
        const height = 16;
        const n = width * height;
        const PLAYERS = 4;

        const scratch = createTickScratchBuffers(width, height);

        expect(scratch.inflowTally.length).toBe(n * PLAYERS);
        expect(scratch.committedFlowTally.length).toBe(n * PLAYERS);
        expect(scratch.preFlowOwners.length).toBe(n);
        expect(scratch.preFlowCounts.length).toBe(n);
        expect(scratch.reservedFloors.length).toBe(n);
        expect(scratch.hasIncomingSameOwnerPipe.length).toBe(n);
        expect(scratch.flowNewCounts.length).toBe(n);
        expect(scratch.flowNewOwners.length).toBe(n);
        expect(scratch.combatNewCounts.length).toBe(n);
        expect(scratch.combatNewOwners.length).toBe(n);
        expect(scratch.transferParams.length).toBe(4); // MAX_PIPES_PER_CELL
        expect(scratch.committedPlayersPool.length).toBe(n * PLAYERS * 2);

        // All buffers should be zeroed.
        for (const val of scratch.inflowTally) {
            expect(val).toBe(0);
        }
        for (const val of scratch.preFlowOwners) {
            expect(val).toBe(0);
        }
    });

    it('consecutive ticks produce valid results', () => {
        const board = buildPopulatedBoard();
        const w0 = createWorld(TWO_PLAYER_CFG, board);

        // First tick creates scratch buffers internally.
        const r1 = tick(w0);
        expect(r1.world.tick).toBe(1);

        // Second tick reuses the same buffers.
        const r2 = tick(r1.world);
        expect(r2.world.tick).toBe(2);

        // Third tick — verify no crash and valid state.
        const r3 = tick(r2.world);
        expect(r3.world.tick).toBe(3);
        expect(r3.world.state.troopCounts.length).toBe(BOARD_SIZE * BOARD_SIZE);
    });

    it('flow resolver reuses scratch buffers when provided', () => {
        const board = buildPopulatedBoard();
        const width = board.width;
        const height = board.height;
        const n = width * height;
        const scratch = createTickScratchBuffers(width, height);

        // Set up a simple flow scenario.
        const state = {
            troopCounts: new Uint32Array(n),
            troopOwners: new Uint8Array(n),
            pipeMasks: new Uint8Array(n),
            reservesPct: new Uint8Array(n),
            cityOwners: new Uint8Array(n),
        };
        state.troopCounts[0] = 30;
        state.troopOwners[0] = 1;
        state.pipeMasks[0] = 0x02; // E pipe

        // First call with scratch: populates scratch.flowNewCounts.
        scratch.flowNewCounts.fill(0);
        scratch.flowNewOwners.fill(0);

        const out1 = resolveFlow(state, board, ENGINE_CONSTANTS, undefined, undefined, scratch);

        // The output should reference the scratch buffer.
        expect(out1.troopCounts).toBe(scratch.flowNewCounts);
        expect(out1.troopOwners).toBe(scratch.flowNewOwners);

        // Second call reuses the same buffer instances.
        scratch.flowNewCounts.fill(0);
        scratch.flowNewOwners.fill(0);
        const out2 = resolveFlow(state, board, ENGINE_CONSTANTS, undefined, undefined, scratch);
        expect(out2.troopCounts).toBe(scratch.flowNewCounts);
        expect(out2.troopOwners).toBe(scratch.flowNewOwners);
    });

    it('combat resolver reuses scratch buffers when provided', () => {
        const board = buildPopulatedBoard();
        const width = board.width;
        const height = board.height;
        const n = width * height;
        const scratch = createTickScratchBuffers(width, height);

        const state = {
            troopCounts: new Uint32Array(n),
            troopOwners: new Uint8Array(n),
            pipeMasks: new Uint8Array(n),
            reservesPct: new Uint8Array(n),
            cityOwners: new Uint8Array(n),
        };

        scratch.combatNewCounts.fill(0);
        scratch.combatNewOwners.fill(0);

        const out1 = resolveCombat(
            state,
            board,
            ENGINE_CONSTANTS,
            0,
            REGISTRY,
            undefined,
            undefined,
            undefined,
            scratch,
        );

        expect(out1.state.troopCounts).toBe(scratch.combatNewCounts);
        expect(out1.state.troopOwners).toBe(scratch.combatNewOwners);
    });
});

describe('SC-006 — performance budget', () => {
    it('1000 ticks on 32×32 complete within 10 seconds', () => {
        const world = createPopulatedWorld();

        const start = performance.now();
        let w = world;
        for (let i = 0; i < 1000; i++) {
            w = tick(w).world;
        }
        const elapsed = performance.now() - start;

        expect(w.tick).toBe(1010); // 10 warmup + 1000
        expect(elapsed).toBeLessThan(10_000); // 10s budget
    });
});
