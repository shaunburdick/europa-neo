/**
 * MapView construction — Feature 005 (T024).
 *
 * Builds the renderer-facing `MapView` snapshot from the latest
 * fog-filtered `PlayerView` plus view state (data-model.md §2).
 * Pure data in, pure data out: no DOM, no canvas, no clock reads
 * (`nowMs` arrives via the args bag).
 *
 * Responsibilities:
 *   - Convert every `PlayerView.visibleCells[i]` to a `CellRenderInfo`
 *     via `cellViewToRenderInfo`, keyed by `coordKey(coord)`.
 *   - Flag cells whose gameplay-relevant state changed since the
 *     previous snapshot via `diffCellChanges` (T025).
 *   - Translate the view's `TickEvents` combat/capture entries into
 *     transient `MapEffect`s via `eventToEffect`.
 *   - Raise transient `%` labels on cells whose reserves changed.
 *
 * Cells outside the visibility horizon are absent from `cells`; the
 * renderer paints their pixels as void (fog FR-002).
 */

import { CONSOLE_CONSTANTS, DEFAULT_PLAYER_COLORS } from '../config';
import { classifyPipeSlope, PIPE_SLOPE_CONSTANTS, type PipeSlope, pipeIntensity } from '../render/pipe-slope';
import { diffCellChanges } from './diff';
import type {
    CameraState,
    CellRenderInfo,
    CellView,
    Coord,
    Direction,
    MapEffect,
    MapLabel,
    MapView,
    MapViewId,
    PlayerView,
} from './types';

/**
 * Build the canonical string map key for a board coordinate.
 * Format: `"x,y"` (decimal integers, comma-separated). Inverse of
 * `keyToCoord`. Pure.
 */
export function coordKey(coord: Coord): string {
    return `${coord.x},${coord.y}`;
}

/**
 * Parse a `coordKey`-format string back to a `Coord`. Round-trips
 * with `coordKey` for any key `coordKey` produced. Pure.
 */
export function keyToCoord(key: string): Coord {
    const commaIndex = key.indexOf(',');
    const x = Number.parseInt(key.slice(0, commaIndex), 10);
    const y = Number.parseInt(key.slice(commaIndex + 1), 10);
    return { x, y };
}

/**
 * Convert an engine `CellView` (fog read-view) to a console
 * `CellRenderInfo` (render model). Pure.
 *
 * Field mapping (engine → console):
 *   - `troopCount` → `troops`, `troopOwner` → `owner`,
 *     `reservesPercent` → `reservesPct`.
 *   - `isCity` is derived as `cityOwner !== null`: the engine's read
 *     view carries city ownership but no boolean, and a city always
 *     has an owner (or a capture in flight from a previous owner).
 */
export function cellViewToRenderInfo(cell: CellView): CellRenderInfo {
    return {
        coord: cell.coord,
        elevation: cell.cell.elevation,
        terrain: cell.cell.terrain,
        troops: cell.troopCount,
        owner: cell.troopOwner,
        isCity: cell.cityOwner !== null,
        cityOwner: cell.cityOwner,
        pipes: cell.pipes,
        // Default: no slopes. buildMapView fills this for cells with
        // pipes (005 FR-013) — the renderer only reads entries for
        // directions present in `pipes`, so an empty map is correct
        // for pipe-less cells.
        pipeSlopes: new Map<Direction, PipeSlope>(),
        // Default: no intensities. buildMapView fills this alongside
        // pipeSlopes for cells with pipes (issue #43).
        pipeIntensities: new Map<Direction, number>(),
        reservesPct: cell.reservesPercent,
        changedThisTick: false, // set by buildMapView after diffing
    };
}

/**
 * The board coordinate one step in `direction` from `coord`. Pure.
 * Out-of-bounds results are legal — the caller's `rawCells` lookup
 * simply misses, which classifies the pipe as flat (fog fallback,
 * 005 FR-013).
 */
function destinationCoord(coord: Coord, direction: Direction): Coord {
    switch (direction) {
        case 'N':
            return { x: coord.x, y: coord.y - 1 };
        case 'S':
            return { x: coord.x, y: coord.y + 1 };
        case 'W':
            return { x: coord.x - 1, y: coord.y };
        case 'E':
            return { x: coord.x + 1, y: coord.y };
    }
}

/**
 * Build a `MapEffect` from an engine `TickEvents` entry. Returns
 * `null` for events without a cell marker — eliminations are match-
 * level facts announced via HUD feedback, not painted at a cell.
 * Pure.
 *
 * @param event  A combat, capture, or elimination event.
 * @param options `nowMs` (monotonic clock reading) and the `tick`
 *                the events belong to (carried for diagnostics).
 */
export function eventToEffect(
    event: TickEventsCombat | TickEventsCapture | TickEventsElimination,
    options: { readonly nowMs: number; readonly tick: number },
): MapEffect | null {
    const expiresAtMs = options.nowMs + CONSOLE_CONSTANTS.effectTtlMs;

    // Discriminate the union structurally: CaptureEvent carries
    // `toOwner`, CombatEvent carries `attacker`, EliminationEvent
    // carries neither (and has no cell to paint).
    if ('toOwner' in event) {
        return { kind: 'capture', cell: event.cell, expiresAtMs };
    }
    if ('attacker' in event) {
        return { kind: 'combat', cell: event.cell, expiresAtMs };
    }
    // EliminationEvent: match-level fact, announced via HUD feedback
    // by the reducer — no cell marker to paint.
    return null;
}

/** Structural aliases keeping `eventToEffect`'s signature readable. */
type TickEventsCombat = import('@europa/engine').TickEvents['combat'][number];
type TickEventsCapture = import('@europa/engine').TickEvents['captures'][number];
type TickEventsElimination = import('@europa/engine').TickEvents['eliminations'][number];

/**
 * Arguments bag for `buildMapView` (mirrors the contract declaration;
 * `prevView` accepts `null` on the first frame of a match, per the
 * contract's JSDoc).
 */
export interface BuildMapViewArgs {
    /** Unique id for this snapshot (branded string). */
    readonly id: MapViewId;
    /** Latest fog-filtered view from the server. */
    readonly view: PlayerView;
    /** Current camera transform. */
    readonly camera: CameraState;
    /** Hovered cell, or `null`. */
    readonly hover: Coord | null;
    /** Keyboard-selected cell, or `null`. */
    readonly selection: Coord | null;
    /** Whether exclusive-pipe mode is active. */
    readonly exclusiveMode: boolean;
    /** Previous snapshot for change detection; `null` on first frame. */
    readonly prevView: MapView | null;
    /** Monotonic clock reading stamping effect/label expiry. */
    readonly nowMs: number;
}

/**
 * Build the render snapshot for one frame. Pure.
 *
 * Labels: raised on every cell whose `reservesPct` differs from the
 * previous snapshot ("70%" flash after a reserve change, per
 * data-model.md §6), expiring after `CONSOLE_CONSTANTS.labelTtlMs`.
 *
 * @param args Snapshot inputs (see {@link BuildMapViewArgs}).
 * @returns The immutable `MapView` the renderer paints.
 */
export function buildMapView(args: BuildMapViewArgs): MapView {
    const { id, view, camera, hover, selection, exclusiveMode, prevView, nowMs } = args;

    // 1. Convert visible cells and index them by coord key.
    const rawCells = new Map<string, CellRenderInfo>();
    for (const cellView of view.visibleCells) {
        rawCells.set(coordKey(cellView.coord), cellViewToRenderInfo(cellView));
    }

    // 2. Diff against the previous snapshot and stamp changedThisTick;
    //    precompute per-direction pipeSlopes for cells with pipes
    //    (005 FR-013): look up each destination in rawCells (absent →
    //    null → 'flat' fog fallback) and classify by elevation delta.
    const changed = diffCellChanges(prevView?.cells ?? new Map(), rawCells);
    const cells = new Map<string, CellRenderInfo>();
    for (const [key, info] of rawCells) {
        let next: CellRenderInfo = info;
        if (changed.has(key)) {
            next = { ...next, changedThisTick: true };
        }
        if (info.pipes.size > 0) {
            const pipeSlopes = new Map<Direction, PipeSlope>();
            const pipeIntensities = new Map<Direction, number>();
            for (const direction of info.pipes) {
                const dst = destinationCoord(info.coord, direction);
                const dstInfo = rawCells.get(coordKey(dst));
                const dstElev = dstInfo?.elevation ?? null;
                const slope = classifyPipeSlope(info.elevation, dstElev, PIPE_SLOPE_CONSTANTS);
                pipeSlopes.set(direction, slope);
                pipeIntensities.set(direction, pipeIntensity(info.elevation, dstElev, slope, PIPE_SLOPE_CONSTANTS));
            }
            next = { ...next, pipeSlopes, pipeIntensities };
        }
        cells.set(key, next);
    }

    // 3. Translate tick events into transient effects.
    const effects: MapEffect[] = [];
    for (const combat of view.events.combat) {
        const effect = eventToEffect(combat, { nowMs, tick: view.tick });
        if (effect !== null) {
            effects.push(effect);
        }
    }
    for (const capture of view.events.captures) {
        const effect = eventToEffect(capture, { nowMs, tick: view.tick });
        if (effect !== null) {
            effects.push(effect);
        }
    }

    // 4. Raise "%" labels where reserves changed since last frame.
    const labels: MapLabel[] = [];
    if (prevView !== null) {
        for (const [key, info] of cells) {
            const prevInfo = prevView.cells.get(key);
            if (prevInfo !== undefined && prevInfo.reservesPct !== info.reservesPct) {
                labels.push({
                    cell: info.coord,
                    text: `${info.reservesPct * 10}%`,
                    expiresAtMs: nowMs + CONSOLE_CONSTANTS.labelTtlMs,
                });
            }
        }
    }

    // The engine generates square boards (MatchConfig.boardSize); the
    // console keeps separate width/height fields defensively.
    const size = view.config.boardSize;

    return {
        id,
        tick: view.tick,
        width: size,
        height: size,
        cells,
        playerColors: DEFAULT_PLAYER_COLORS,
        effects,
        labels,
        camera,
        hover,
        selection,
        dragSelection: null, // v1: single-cell targeting only (research.md §12)
        exclusiveMode,
    };
}
