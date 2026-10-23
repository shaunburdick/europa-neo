/**
 * Contract Conformance Test — Feature 005 Polish (T089).
 *
 * Enforces the console package's boundary rule per plan.md
 * §"Constitution Check" Principle I, research.md §"Locked stack", and
 * the no-additive-changes mandate:
 *
 *   (b) **Type conformance** — the engine's 8-variant `Order` union,
 *       the fog `PlayerView`, networking's `ConnectionState` and
 *       `MatchClient`, and the engine `World` re-exported through
 *       `src/state/types.ts` are mutually assignable with their
 *       canonical declarations. Enforced by `pnpm typecheck:conformance`
 *       (a dedicated strict tsc program over this file — tests are
 *       otherwise excluded from every package's tsconfig, a known
 *       repo-wide gap documented in spec Implementation Notes).
 *
 *   (c) **Surface completeness** — every type/const name exported by
 *       any of the four contract mirrors is reachable from the built
 *       package root (`dist/index.js` values via runtime keys;
 *       type-only exports via the indexed-access witness list, which
 *       fails `typecheck:conformance` if any name is missing or
 *       misspelled). Requires `pnpm build` first.
 *
 *   (d) **Cross-package API-version boundary witness** — every shipped
 *       API-version constant is pinned in ONE place and stays in
 *       lock-step across runtime values and source-file literals.
 *
 * NOTE: Part (a) -- byte-identity comparisons between src/contracts/
 * and specs/005-client-console/contracts/ -- was removed because the
 * spec-side .ts files no longer exist. The package copies in
 * each package's src/contracts/ are now the sole source of truth.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePlayerId } from '@europa/core';
import type { Order, World } from '@europa/engine';
import { ENGINE_API_VERSION } from '@europa/engine';
import type { PlayerView } from '@europa/fog';
import { FOG_API_VERSION } from '@europa/fog';
import { MATCHMAKING_API_VERSION } from '@europa/matchmaking';
import type { ConnectionState, MatchClient } from '@europa/networking';
import { NETWORK_API_VERSION } from '@europa/networking';
import { TERRAIN_API_VERSION } from '@europa/terrain';
import { describe, expect, expectTypeOf, it } from 'vitest';
// Type-only namespace (erased at runtime; checked by tsc program).
import type * as DistTypes from '../../src/index';
// Runtime value surface of the package source (no build needed).
import * as Dist from '../../src/index';
import type {
    ConnectionState as ConnectionStateReexport,
    MatchClient as MatchClientReexport,
    Order as OrderReexport,
    PlayerView as PlayerViewReexport,
    World as WorldReexport,
} from '../../src/state/types';

/** Resolve a path relative to the monorepo root. */
function repoPath(relativePath: string): string {
    // packages/console/tests/integration/… → 4 levels up.
    return resolve(__dirname, '..', '..', '..', '..', relativePath);
}

/** Read a file relative to the console package root. */
function packagePath(relativePath: string): string {
    return resolve(__dirname, '..', '..', relativePath);
}

// ---------------------------------------------------------------------------
// (b) Compile-time type conformance. `expectTypeOf` mutual assignability
// proves set equality for unions and field-for-field equality for objects;
// `pnpm typecheck:conformance` enforces it.
// ---------------------------------------------------------------------------

/**
 * Exhaustive witness for the engine `Order` union: each of the eight
 * documented variants must be handled, so adding or removing a
 * variant without updating this switch fails
 * `pnpm typecheck:conformance` (the `never` guard collapses).
 */
function orderVariantWitness(order: OrderReexport): string {
    switch (order.kind) {
        case 'setPipe':
            return `setPipe:${order.cell.x},${order.cell.y}:${order.direction}`;
        case 'clearPipe':
            return `clearPipe:${order.cell.x},${order.cell.y}:${order.direction}`;
        case 'setPipesExclusive':
            return `setPipesExclusive:${order.cell.x},${order.cell.y}:${order.direction}`;
        case 'clearAllPipes':
            return `clearAllPipes:${order.cell.x},${order.cell.y}`;
        case 'setReserves':
            return `setReserves:${order.cell.x},${order.cell.y}:${order.percent}`;
        case 'paratroop':
            return `paratroop:${order.source.x},${order.source.y}->${order.target.x},${order.target.y}`;
        case 'gun':
            return `gun:${order.source.x},${order.source.y}->${order.target.x},${order.target.y}`;
        case 'surrender':
            return 'surrender';
        default: {
            const unreachable: never = order;
            return unreachable;
        }
    }
}

// ---------------------------------------------------------------------------
// (c) Type-only export witnesses. Each entry of DIST_TYPE_WITNESS
// proves — at compile time, via property access on the namespace type
// (bracket-indexed access cannot see `export *` members) — that the
// named type is exported from the built package. The table's KEYS are
// cross-checked against the mirrors at runtime, so the witness can
// neither lag the mirrors nor invent names. Value exports (consts)
// need no witnessing: they appear in Object.keys(dist) at runtime.
// ---------------------------------------------------------------------------

const DIST_TYPE_WITNESS = {
    ActionId: null as unknown as DistTypes.ActionId,
    CameraState: null as unknown as DistTypes.CameraState,
    CellRegion: null as unknown as DistTypes.CellRegion,
    CellRenderInfo: null as unknown as DistTypes.CellRenderInfo,
    CellView: null as unknown as DistTypes.CellView,
    CommandResult: null as unknown as DistTypes.CommandResult,
    ConnectionId: null as unknown as DistTypes.ConnectionId,
    ConnectionState: null as unknown as DistTypes.ConnectionState,
    Console: null as unknown as DistTypes.Console,
    ConsoleAction: null as unknown as DistTypes.ConsoleAction,
    ConsoleClient: null as unknown as DistTypes.ConsoleClient,
    ConsoleClientConfig: null as unknown as DistTypes.ConsoleClientConfig,
    ConsoleClientDeps: null as unknown as DistTypes.ConsoleClientDeps,
    ConsoleClientState: null as unknown as DistTypes.ConsoleClientState,
    ConsoleConfig: null as unknown as DistTypes.ConsoleConfig,
    ConsoleConnectionStatus: null as unknown as DistTypes.ConsoleConnectionStatus,
    ConsoleParticipant: null as unknown as DistTypes.ConsoleParticipant,
    ConsoleConstants: null as unknown as DistTypes.ConsoleConstants,
    ConsoleDeps: null as unknown as DistTypes.ConsoleDeps,
    ConsoleFeatureFlags: null as unknown as DistTypes.ConsoleFeatureFlags,
    ConsoleInput: null as unknown as DistTypes.ConsoleInput,
    ConsoleLogger: null as unknown as DistTypes.ConsoleLogger,
    ConsoleRenderer: null as unknown as DistTypes.ConsoleRenderer,
    ConsoleSession: null as unknown as DistTypes.ConsoleSession,
    ConsoleSoundPlayer: null as unknown as DistTypes.ConsoleSoundPlayer,
    ConsoleState: null as unknown as DistTypes.ConsoleState,
    Coord: null as unknown as DistTypes.Coord,
    CursorTarget: null as unknown as DistTypes.CursorTarget,
    DEFAULT_CAMERA: null as unknown as typeof DistTypes.DEFAULT_CAMERA,
    DEFAULT_CONSOLE_CLIENT_CONFIG: null as unknown as typeof DistTypes.DEFAULT_CONSOLE_CLIENT_CONFIG,
    DEFAULT_INPUT_MAPPING: null as unknown as typeof DistTypes.DEFAULT_INPUT_MAPPING,
    DEFAULT_QOL_SETTINGS: null as unknown as typeof DistTypes.DEFAULT_QOL_SETTINGS,
    Direction: null as unknown as DistTypes.Direction,
    EnvelopeContext: null as unknown as DistTypes.EnvelopeContext,
    ErrorCode: null as unknown as DistTypes.ErrorCode,
    FeedbackMessage: null as unknown as DistTypes.FeedbackMessage,
    INITIAL_CONSOLE_STATE: null as unknown as typeof DistTypes.INITIAL_CONSOLE_STATE,
    InputMapping: null as unknown as DistTypes.InputMapping,
    MapEffect: null as unknown as DistTypes.MapEffect,
    MapLabel: null as unknown as DistTypes.MapLabel,
    MapView: null as unknown as DistTypes.MapView,
    MapViewId: null as unknown as DistTypes.MapViewId,
    MatchId: null as unknown as DistTypes.MatchId,
    MatchResult: null as unknown as DistTypes.MatchResult,
    NetEvent: null as unknown as DistTypes.NetEvent,
    NetworkPayload: null as unknown as DistTypes.NetworkPayload,
    Order: null as unknown as DistTypes.Order,
    OrderAckPayload: null as unknown as DistTypes.OrderAckPayload,
    OrderSubmissionPayload: null as unknown as DistTypes.OrderSubmissionPayload,
    PlayerAction: null as unknown as DistTypes.PlayerAction,
    PLAYER_COLOR_PALETTE: null as unknown as typeof DistTypes.PLAYER_COLOR_PALETTE,
    PlayerId: null as unknown as DistTypes.PlayerId,
    PlayerView: null as unknown as DistTypes.PlayerView,
    PointerBinding: null as unknown as DistTypes.PointerBinding,
    ProtocolEnvelope: null as unknown as DistTypes.ProtocolEnvelope<DistTypes.NetworkPayload>,
    QoLSettings: null as unknown as DistTypes.QoLSettings,
    ReduceOptions: null as unknown as DistTypes.ReduceOptions,
    ReducerCorrelation: null as unknown as DistTypes.ReducerCorrelation,
    ReducerEffect: null as unknown as DistTypes.ReducerEffect,
    RejectedOrder: null as unknown as DistTypes.RejectedOrder,
    RenderFeedback: null as unknown as DistTypes.RenderFeedback,
    ReservesPct: null as unknown as DistTypes.ReservesPct,
    ReplayTape: null as unknown as DistTypes.ReplayTape,
    ScreenPoint: null as unknown as DistTypes.ScreenPoint,
    SequenceNumber: null as unknown as DistTypes.SequenceNumber,
    SessionToken: null as unknown as DistTypes.SessionToken,
    SoundClip: null as unknown as DistTypes.SoundClip,
    SubcellPosition: null as unknown as DistTypes.SubcellPosition,
    SUBCELL_RANGE: null as unknown as typeof DistTypes.SUBCELL_RANGE,
    TickBroadcastPayload: null as unknown as DistTypes.TickBroadcastPayload,
    TickEvents: null as unknown as DistTypes.TickEvents,
    ValidationError: null as unknown as DistTypes.ValidationError,
    World: null as unknown as DistTypes.World,
};

/** Runtime keys of the compile-time witness table. */
const TYPE_ONLY_WITNESSES: readonly string[] = Object.keys(DIST_TYPE_WITNESS);

/**
 * The barrel previously exported the contract's `ConsoleRuntime`
 * INTERFACE under the alias `ConsoleRuntimeContract`. Issue #129
 * (005 FR-038) REMOVED that `@internal` re-export — the negative
 * pin for the removal lives in the "(e) public barrel hygiene"
 * section below (a type-level absence witness would need a
 * `@ts-expect-error` suppression, which this repo forbids).
 */

// ---------------------------------------------------------------------------
// Mirror-name extraction
// ---------------------------------------------------------------------------

/** The four contract mirrors. */
const CONTRACT_FILES = ['console-types.ts', 'console-state.ts', 'console-to-networking.ts', 'console-api.ts'] as const;

/**
 * Extract every top-level TYPE / CONST / INTERFACE name declared in a
 * contract mirror, plus every name in its `export { … }` re-export
 * blocks. Declare-function names are deliberately excluded: per
 * src/state/types.ts's header decision they are implemented by real
 * modules, not re-exported verbatim from the contracts.
 */
function extractPublicNames(source: string): Set<string> {
    const names = new Set<string>();
    const declaration = /^export\s+(?:declare\s+)?(?:type|interface|const|enum)\s+([A-Za-z0-9_]+)/gm;
    for (const match of source.matchAll(declaration)) {
        const [, name] = match;
        if (name !== undefined) {
            names.add(name);
        }
    }
    const block = /export\s+(?:type\s+)?\{([^}]*)\}/g;
    for (const match of source.matchAll(block)) {
        const [, body] = match;
        if (body === undefined) {
            continue;
        }
        for (const raw of body.split(',')) {
            const name = raw
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (name !== undefined && name.length > 0) {
                names.add(name);
            }
        }
    }
    return names;
}

/** Every public name across all four mirrors. */
function expectedContractNames(): Set<string> {
    const all = new Set<string>();
    for (const file of CONTRACT_FILES) {
        for (const name of extractPublicNames(readFileSync(packagePath(`src/contracts/${file}`), 'utf-8'))) {
            all.add(name);
        }
    }
    return all;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contract conformance (T089)', () => {
    describe('(b) upstream types re-exported from src/state/types conform', () => {
        it('engine/fog/networking declarations are mutually assignable with canon', () => {
            // Compile-time proof: mutual assignability, enforced by tsc.
            expectTypeOf<OrderReexport>().toExtend<Order>();
            expectTypeOf<Order>().toExtend<OrderReexport>();
            expectTypeOf<WorldReexport>().toExtend<World>();
            expectTypeOf<World>().toExtend<WorldReexport>();
            expectTypeOf<PlayerViewReexport>().toExtend<PlayerView>();
            expectTypeOf<PlayerView>().toExtend<PlayerViewReexport>();
            expectTypeOf<ConnectionStateReexport>().toExtend<ConnectionState>();
            expectTypeOf<ConnectionState>().toExtend<ConnectionStateReexport>();
            expectTypeOf<MatchClientReexport>().toExtend<MatchClient>();
            expectTypeOf<MatchClient>().toExtend<MatchClientReexport>();
            expect(TYPE_ONLY_WITNESSES.length).toBeGreaterThan(0);
        });

        it('the Order union exposes exactly the eight documented variants', () => {
            const player = parsePlayerId('TestPlayer01');
            expect(orderVariantWitness({ kind: 'setPipe', player, cell: { x: 1, y: 2 }, direction: 'N' })).toBe(
                'setPipe:1,2:N',
            );
            expect(orderVariantWitness({ kind: 'surrender', player })).toBe('surrender');
        });
    });

    describe('(c) the built package exposes the full contractual surface', () => {
        it('every mirror type/const name is exported from dist/index', () => {
            const expected = expectedContractNames();
            const actual = new Set<string>([...Object.keys(Dist), ...TYPE_ONLY_WITNESSES]);
            const missing = [...expected].filter((name) => !actual.has(name));
            expect(missing, `contract names missing from the package root`).toEqual([]);
        });

        it('the type-witness list contains no invented names', () => {
            const expected = expectedContractNames();
            const invented = TYPE_ONLY_WITNESSES.filter((name) => !expected.has(name));
            expect(invented, `witness names not present in any contract mirror`).toEqual([]);
        });

        it('key embedding symbols are real at runtime', () => {
            expect(typeof Dist.createConsole).toBe('function');
            expect(typeof Dist.ConsoleRuntime).toBe('function');
            expect(Dist.CONSOLE_API_VERSION).toBeTypeOf('string');
            expect(Object.keys(Dist.CONSOLE_CONSTANTS).length).toBeGreaterThan(0);
            expect(Dist.PLAYER_COLOR_PALETTE).toHaveLength(4);
        });
    });
});

// ---------------------------------------------------------------------------
// (d) Cross-package API-version boundary witness (issue #74 T042)
//
// Every shipped API-version constant is pinned in ONE place. This suite
// runs in `client-ci.yml`, whose path filter includes every workspace
// package, so a bump in any package fails this test instead of hiding
// behind a path-gated per-package workflow. The values are checked both
// as imported runtime constants AND as literals in their canonical
// source files, so the public value and the single source cannot drift
// apart.
// ---------------------------------------------------------------------------

/** The expected shipped API version for every cross-package surface. */
const EXPECTED_API_VERSIONS: Readonly<Record<string, string>> = {
    ENGINE_API_VERSION: '0.2.0',
    TERRAIN_API_VERSION: '0.2.0',
    FOG_API_VERSION: '0.2.0',
    MATCHMAKING_API_VERSION: '0.2.0',
    NETWORK_API_VERSION: '0.3.0',
    CONSOLE_API_VERSION: '0.5.0',
};

/** Canonical source file declaring each API-version literal. */
const API_VERSION_SOURCES: Readonly<Record<string, string>> = {
    ENGINE_API_VERSION: 'packages/core/src/types.ts',
    TERRAIN_API_VERSION: 'packages/terrain/src/contracts/terrain-types.ts',
    FOG_API_VERSION: 'packages/fog/src/contracts/fog-types.ts',
    MATCHMAKING_API_VERSION: 'packages/matchmaking/src/contracts/match-types.ts',
    NETWORK_API_VERSION: 'packages/networking/src/contracts/network-types.ts',
    CONSOLE_API_VERSION: 'packages/console/src/contracts/console-types.ts',
};

/** The runtime values imported through each package's public surface. */
const OBSERVED_API_VERSIONS: Readonly<Record<string, string>> = {
    ENGINE_API_VERSION,
    TERRAIN_API_VERSION,
    FOG_API_VERSION,
    MATCHMAKING_API_VERSION,
    NETWORK_API_VERSION,
    CONSOLE_API_VERSION: Dist.CONSOLE_API_VERSION,
};

/**
 * Compare observed API versions against the expected map, returning a
 * drift line per mismatch. Pure, so the mandatory self-test can prove
 * it detects a synthetic bump rather than trivially returning `[]`.
 *
 * @param observed - The version actually projected by each surface.
 * @param expected - The pinned expected version for each surface.
 * @returns One human-readable line per drift; empty when in lock-step.
 */
function findVersionDrift(
    observed: Readonly<Record<string, string>>,
    expected: Readonly<Record<string, string>>,
): string[] {
    const drift: string[] = [];
    for (const [surface, want] of Object.entries(expected)) {
        const got = observed[surface];
        if (got !== want) {
            drift.push(`${surface}: expected ${want}, got ${String(got)}`);
        }
    }
    return drift;
}

/**
 * Extract the `export const <name> = '<version>' as const;` literal
 * from a canonical source file.
 *
 * @param relativePath - Path relative to the monorepo root.
 * @param name - The exported constant name.
 * @returns The literal version, or `undefined` when not found.
 */
function versionLiteralIn(relativePath: string, name: string): string | undefined {
    const source = readFileSync(repoPath(relativePath), 'utf-8');
    const pattern = new RegExp(`export const ${name} = '([^']+)' as const;`);
    return pattern.exec(source)?.[1];
}

describe('(d) cross-package API-version boundary witness (issue #74 T042)', () => {
    it('every shipped API version matches the pinned cross-package map', () => {
        expect(findVersionDrift(OBSERVED_API_VERSIONS, EXPECTED_API_VERSIONS)).toEqual([]);
    });

    it('each runtime constant matches its canonical source-file literal', () => {
        const drift: string[] = [];
        for (const [surface, relativePath] of Object.entries(API_VERSION_SOURCES)) {
            const literal = versionLiteralIn(relativePath, surface);
            const observed = OBSERVED_API_VERSIONS[surface];
            if (literal !== observed) {
                drift.push(
                    `${surface}: source ${relativePath} declares ${String(literal)}, public value is ${String(observed)}`,
                );
            }
        }
        expect(drift).toEqual([]);
    });

    it('self-test: findVersionDrift flags a synthetic bump', () => {
        expect(findVersionDrift({ A: '1.0.0' }, { A: '1.0.0' })).toEqual([]);
        expect(findVersionDrift({ A: '1.1.0' }, { A: '1.0.0' })).toEqual(['A: expected 1.0.0, got 1.1.0']);
        expect(findVersionDrift({}, { A: '1.0.0' })).toEqual(['A: expected 1.0.0, got undefined']);
    });
});

// ---------------------------------------------------------------------------
// (e) Public barrel hygiene (issue #129, 005 FR-038)
//
// The public barrel MUST NOT export declarations marked `@internal`.
// The removed surface is a TYPE-only export, so its absence cannot be
// pinned at runtime or through a negative type witness (that would
// need a `@ts-expect-error` suppression, which the constitution
// forbids) — a source-level pin is the honest mechanism, in the same
// spirit as the (d) section's source-literal scan.
// ---------------------------------------------------------------------------

describe('(e) public barrel hygiene (005 FR-038)', () => {
    const barrelSource = readFileSync(repoPath('packages/console/src/index.ts'), 'utf-8');

    it('the barrel no longer re-exports the @internal ConsoleRuntimeContract alias', () => {
        expect(barrelSource).not.toContain('ConsoleRuntimeContract');
    });

    it('the barrel still exports the ConsoleRuntime CLASS embedding surface', () => {
        expect(barrelSource).toContain("export { ConsoleRuntime } from './runtime';");
        expect(typeof Dist.ConsoleRuntime).toBe('function');
    });

    it('no barrel export line references an @internal-tagged declaration by alias', () => {
        // The two `@internal — exported for tests` declarations in
        // contracts/console-to-networking.ts (buildOrderEnvelope,
        // netEventFromOrderAck) must stay unreachable from the barrel;
        // they are reachable through the module itself (FR-038).
        expect(barrelSource).not.toContain('buildOrderEnvelope');
        expect(barrelSource).not.toContain('netEventFromOrderAck');
    });
});
