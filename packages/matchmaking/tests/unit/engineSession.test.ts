/**
 * Unit tests for the engine session adapter — Feature 006
 *
 * The adapter (see `src/engineSession.ts` for the documented
 * deviation from T028's `createMatchSession` prose) wraps the engine
 * primitives into the contract's `EngineSession` handle. These tests
 * prove the wrapping behaves per the contract: orders apply, ticks
 * advance, terminal detection flows through, and the config builder
 * freezes the engine-facing shape.
 */

import type { Board, Cell, CityPlacement, PlayerId } from '@europa/engine';
import { ENGINE_CONSTANTS } from '@europa/engine';
import { describe, expect, it } from 'vitest';

import type { MatchSettings } from '../../contracts/match-types';
import { DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';
import { buildEngineSession, buildMatchConfig } from '../../src/engineSession';

/** Flat all-land 8×8 board with one home city per player (deterministic). */
function scriptedBoard(size: number, playerCount: 2 | 3 | 4): Board {
    const cells: Cell[] = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells.push({ x, y, elevation: 0, terrain: 'land' });
        }
    }
    const cities: CityPlacement[] = [];
    const homes: ReadonlyArray<readonly [number, number]> = [
        [1, 1],
        [size - 2, size - 2],
    ];
    for (let seat = 1; seat <= playerCount; seat++) {
        const home = homes[seat - 1];
        if (home === undefined) {
            throw new Error('fixture home missing');
        }
        cities.push({ cell: { x: home[0], y: home[1] }, owner: seat });
    }
    return { width: size, height: size, cells: Object.freeze(cells), cities: Object.freeze(cities) };
}

const SETTINGS: MatchSettings = DEFAULT_MATCH_SETTINGS;

describe('buildMatchConfig', () => {
    it('maps settings + seed onto the frozen engine config', () => {
        const config = buildMatchConfig(SETTINGS, 1234);
        expect(config.boardSize).toBe(SETTINGS.boardSize);
        expect(config.playerIds).toHaveLength(SETTINGS.playerCount);
        for (const pid of config.playerIds) {
            expect(typeof pid).toBe('string');
        }
        expect(config.tickIntervalMs).toBe(SETTINGS.tickIntervalMs);
        expect(config.seed).toBe(1234);
        expect(config.visibilityRadius).toBe(ENGINE_CONSTANTS.visibilityRadiusDefault);
    });

    it('freezes the config against later mutation', () => {
        const config = buildMatchConfig(SETTINGS, 1);
        expect(Object.isFrozen(config)).toBe(true);
    });
});

describe('buildEngineSession', () => {
    it('starts from a world matching the given config and board', () => {
        const config = buildMatchConfig({ ...SETTINGS, boardSize: 8 }, 7);
        const session = buildEngineSession(config, scriptedBoard(8, 2));

        const world = session.world();
        expect(world.config).toBe(config);
        expect(world.tick).toBe(0);
        expect(world.board.width).toBe(8);
        expect(world.players).toHaveLength(2);
        expect(session.status()).toBeUndefined(); // two alive → not terminal
        session.close(); // no-op, but must exist
    });

    it('threads submit through applyCommand and advance through tick', () => {
        const config = buildMatchConfig({ ...SETTINGS, boardSize: 8 }, 7);
        const session = buildEngineSession(config, scriptedBoard(8, 2));
        // Engine's playerRegistry sorts IDs — city at (1,1) has owner: 1
        // which corresponds to the first SORTED PlayerId.
        const sortedIds = [...config.playerIds].sort((a, b) => a.localeCompare(b));
        const firstPlayer = sortedIds[0] as PlayerId;
        expect(firstPlayer).toBeDefined();

        // Player at sorted position 0 lays a pipe east from their home city (FR-018 order set).
        const submitted = session.submit({
            kind: 'setPipe',
            player: firstPlayer,
            cell: { x: 1, y: 1 },
            direction: 'E',
        });
        expect(submitted.ok).toBe(true);

        const before = session.world().tick;
        const advanced = session.advance();
        expect(advanced.world.tick).toBe(before + 1);
        expect(session.world().tick).toBe(before + 1); // closure cell updated

        session.close();
    });

    it('surfaces terminal results through status()', () => {
        const config = buildMatchConfig({ ...SETTINGS, boardSize: 8 }, 7);
        const session = buildEngineSession(config, scriptedBoard(8, 2));
        // Surrender the second sorted player → first sorted player wins.
        const sortedIds = [...config.playerIds].sort((a, b) => a.localeCompare(b));
        session.submit({ kind: 'surrender', player: sortedIds[1] as PlayerId });

        const terminal = session.status();
        expect(terminal).toBeDefined();
        expect(terminal?.kind).toBe('win');
        if (terminal?.kind === 'win') {
            expect(terminal.winner).toBe(sortedIds[0]);
        }

        // advance() past the boundary is frozen-once-terminal.
        const advanced = session.advance();
        expect(advanced.terminal?.kind).toBe('win');
        session.close();
    });
});
