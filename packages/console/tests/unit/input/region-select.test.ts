/**
 * Region-select unit tests — Feature 005 (T049).
 *
 * Covers FR-002 + spec US2 AC-1/2: region clicks classify into the
 * correct pipe `PlayerAction`s per the original Europa mouse
 * semantics (toggle on primary; exclusive on secondary/middle/Alt),
 * and the resulting orders reach a FakeMatchClient with the exact
 * wire shape through the store → reducer → bridge pipeline.
 *
 * Enemy-cell clicks emit the action anyway (the engine rejects per
 * FR-006; the client preflight only blocks out-of-range
 * paratroop/gun). Shift+click is reserved for v1.1 (research.md §12)
 * and behaves as a plain primary click.
 */

import { describe, expect, test } from 'vitest';
import { DEFAULT_CAMERA } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';
import { decideRegionClick, pipePresentInDirection, RegionSelectController } from '../../../src/input/region-select';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { createOrderBridge } from '../../../src/state/order-actions';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type { CursorTarget, Direction, PlayerView } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

/** A friendly cell with an existing east pipe (toggle target). */
function acceptanceView(): PlayerView {
    return buildPlayerView({
        width: 16,
        height: 16,
        playerId: 1,
        visibleCells: [
            // Friendly city with pipes N + E already set.
            buildCellView({
                coord: { x: 5, y: 5 },
                elevation: 60,
                troops: 12,
                owner: 1,
                isCity: true,
                pipes: new Set<Direction>(['N', 'E']),
            }),
            // Friendly plain cell without pipes.
            buildCellView({ coord: { x: 6, y: 5 }, elevation: 40, troops: 4, owner: 1 }),
            // Enemy-held cell (pipes must still emit; server is authority).
            buildCellView({ coord: { x: 7, y: 5 }, elevation: 30, troops: 9, owner: 2 }),
        ],
    });
}

/** Hit-test helper: screen point at fraction `(fx, fy)` inside cell (cx, cy). */
function targetInCell(cx: number, cy: number, fx: number, fy: number): CursorTarget {
    const { zoom } = DEFAULT_CAMERA;
    return hitTest({ x: (cx + fx) * zoom, y: (cy + fy) * zoom }, DEFAULT_CAMERA);
}

describe('decideRegionClick (US2 AC-1/2)', () => {
    test('primary click over a region without a pipe issues setPipe', () => {
        const decision = decideRegionClick({
            target: targetInCell(6, 5, 0.75, 0.5), // eastern half of (6,5)
            button: 'left',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision).toEqual({ kind: 'setPipe', cell: { x: 6, y: 5 }, direction: 'E' });
    });

    test('primary click over a region whose pipe exists issues clearPipe (AC-1 toggle)', () => {
        const decision = decideRegionClick({
            target: targetInCell(5, 5, 0.75, 0.5), // east half of (5,5); E pipe present
            button: 'left',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: true,
        });
        expect(decision).toEqual({ kind: 'clearPipe', cell: { x: 5, y: 5 }, direction: 'E' });
    });

    test('each half of the cell maps to its direction (N/E/S/W)', () => {
        const cases: [number, number, Direction][] = [
            [0.5, 0.25, 'N'],
            [0.75, 0.5, 'E'],
            [0.5, 0.75, 'S'],
            [0.25, 0.5, 'W'],
        ];
        for (const [fx, fy, direction] of cases) {
            const decision = decideRegionClick({
                target: targetInCell(6, 5, fx, fy),
                button: 'left',
                altKey: false,
                shiftKey: false,
                exclusiveMode: false,
                hasExistingPipe: false,
            });
            expect(decision).toMatchObject({ kind: 'setPipe', direction });
        }
    });

    test('right-click issues setPipesExclusive regardless of existing pipes (AC-2)', () => {
        const decision = decideRegionClick({
            target: targetInCell(6, 5, 0.25, 0.25), // western half (X axis decides first)
            button: 'right',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision).toEqual({ kind: 'setPipesExclusive', cell: { x: 6, y: 5 }, direction: 'W' });
    });

    test('middle-click issues setPipesExclusive (single-button fallback path)', () => {
        const decision = decideRegionClick({
            target: targetInCell(6, 5, 0.75, 0.5),
            button: 'middle',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision).toEqual({ kind: 'setPipesExclusive', cell: { x: 6, y: 5 }, direction: 'E' });
    });

    test('Alt+primary issues setPipesExclusive (FR-003 keyboard-equivalent path)', () => {
        const decision = decideRegionClick({
            target: targetInCell(6, 5, 0.75, 0.5),
            button: 'left',
            altKey: true,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision).toEqual({ kind: 'setPipesExclusive', cell: { x: 6, y: 5 }, direction: 'E' });
    });

    test('sticky exclusive mode promotes primary clicks to exclusive', () => {
        const decision = decideRegionClick({
            target: targetInCell(6, 5, 0.75, 0.5),
            button: 'left',
            altKey: false,
            shiftKey: false,
            exclusiveMode: true,
            hasExistingPipe: false,
        });
        expect(decision.kind).toBe('setPipesExclusive');
    });

    test('Shift+primary behaves as a plain primary click (v1.1 reserved, research.md §12)', () => {
        const decision = decideRegionClick({
            target: targetInCell(6, 5, 0.75, 0.5),
            button: 'left',
            altKey: false,
            shiftKey: true,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision).toEqual({ kind: 'setPipe', cell: { x: 6, y: 5 }, direction: 'E' });
    });

    test('clicks off the board produce none', () => {
        const decision = decideRegionClick({
            target: { screen: { x: -10, y: -10 }, cell: null, region: null, subcell: null },
            button: 'left',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision).toEqual({ kind: 'none', reason: 'no-cell' });
    });
});

describe('pipePresentInDirection', () => {
    test('reads existing pipes from the fog-filtered view', () => {
        const state = createLiveConsoleState(acceptanceView());
        expect(pipePresentInDirection(state, { x: 5, y: 5 }, 'E')).toBe(true);
        expect(pipePresentInDirection(state, { x: 5, y: 5 }, 'S')).toBe(false);
    });

    test('cells outside the horizon report no pipes (fail-open to setPipe)', () => {
        const state = createLiveConsoleState(acceptanceView());
        expect(pipePresentInDirection(state, { x: 15, y: 15 }, 'N')).toBe(false);
    });
});

/**
 * Store → reducer → bridge → fake-client pipeline: dispatching a
 * region decision's action sends the exact wire Order.
 */
function makePipeline(): {
    store: ConsoleStore;
    client: FakeMatchClient;
} {
    const client = new FakeMatchClient();
    let forward: ((effect: Parameters<ReturnType<typeof createOrderBridge>['handleEffect']>[0]) => void) | null = null;
    const store = createConsoleStore(createLiveConsoleState(acceptanceView()), (effect) => {
        forward?.(effect);
    });
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => bridge.handleEffect(effect);
    return { store, client };
}

describe('region click → wire order pipeline (T049 seam)', () => {
    test('enemy-cell clicks emit the order anyway (engine rejects per FR-006)', async () => {
        const { store, client } = makePipeline();
        const decision = decideRegionClick({
            target: targetInCell(7, 5, 0.75, 0.5), // enemy cell (7,5)
            button: 'left',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: false,
        });
        expect(decision.kind).toBe('setPipe');
        store.dispatch(decision);
        await Promise.resolve();
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toEqual({
            kind: 'setPipe',
            player: 1,
            cell: { x: 7, y: 5 },
            direction: 'E',
        });
    });

    test('exclusive click produces OrderSetPipesExclusive with the clicked direction', async () => {
        const { store, client } = makePipeline();
        const decision = decideRegionClick({
            target: targetInCell(5, 5, 0.75, 0.5),
            button: 'right',
            altKey: false,
            shiftKey: false,
            exclusiveMode: false,
            hasExistingPipe: true,
        });
        store.dispatch(decision);
        await Promise.resolve();
        expect(client.orders[0]?.order).toEqual({
            kind: 'setPipesExclusive',
            player: 1,
            cell: { x: 5, y: 5 },
            direction: 'E',
        });
    });

    test('input disabled (not live) swallows order clicks', async () => {
        const client = new FakeMatchClient();
        let forward: ((effect: Parameters<ReturnType<typeof createOrderBridge>['handleEffect']>[0]) => void) | null =
            null;
        const seeded = createLiveConsoleState(acceptanceView());
        const store = createConsoleStore({ ...seeded, status: 'reconnecting', inputEnabled: false }, (effect) => {
            forward?.(effect);
        });
        const bridge = createOrderBridge({ client, store });
        forward = (effect) => bridge.handleEffect(effect);

        const element = document.createElement('div');
        Object.defineProperty(element, 'getBoundingClientRect', {
            value: () => ({ left: 0, top: 0, right: 512, bottom: 512, width: 512, height: 512 }),
        });
        document.body.append(element);
        const controller = new RegionSelectController(element, store);
        const handle = controller.attach();
        try {
            const event = new PointerEvent('pointerdown', {
                clientX: (6 + 0.75) * DEFAULT_CAMERA.zoom,
                clientY: (5 + 0.5) * DEFAULT_CAMERA.zoom,
                button: 0,
                bubbles: true,
            });
            element.dispatchEvent(event);
            await Promise.resolve();
            expect(client.orders).toHaveLength(0);
        } finally {
            handle.dispose();
            element.remove();
        }
    });
});
