/**
 * Contract Conformance Test — Feature 005 Polish (T089).
 *
 * Enforces the console package's boundary rule per plan.md
 * §"Constitution Check" Principle I, research.md §"Locked stack", and
 * the no-additive-changes mandate:
 *
 *   (a) **Byte-identity** — every contract mirror under `contracts/`
 *       is BYTE-identical to its source of truth at
 *       `.specify/features/005-client-console/contracts/`. The mirrors
 *       were cut verbatim; even a whitespace drift is a bug (same
 *       strictness as feature 004's conformance suite).
 *
 *   (b) **Type conformance** — the engine's 8-variant `Order` union,
 *       the fog `PlayerView`, networking's `ConnectionState` and
 *       `MatchClient`, and the engine `World` re-exported through
 *       `src/state/types.ts` are mutually assignable with their
 *       canonical declarations. Enforced by `pnpm typecheck:conformance`
 *       (a dedicated strict tsc program over this file — tests are
 *       otherwise excluded from every package's tsconfig, a known
 *       repo-wide gap documented in spec Implementation Notes); the
 *       runtime assertions below keep the witnesses "used".
 *
 *   (c) **Surface completeness** — every type/const name exported by
 *       any of the four contract mirrors is reachable from the built
 *       package root (`dist/index.js` values via runtime keys;
 *       type-only exports via the indexed-access witness list, which
 *       fails `typecheck:conformance` if any name is missing or
 *       misspelled). Requires `pnpm build` first.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Order, World } from '@europa/engine';
import type { PlayerView } from '@europa/fog';
import type { ConnectionState, MatchClient } from '@europa/networking';
import { describe, expect, it } from 'vitest';
// Type-only namespace (erased at runtime; checked by tsc program).
import type * as DistTypes from '../../dist/index';
// Runtime value surface of the BUILT package (requires pnpm build).
import * as Dist from '../../dist/index';
import type { ConsoleRuntime } from '../../src/runtime';
import type {
  ConnectionState as ConnectionStateReexport,
  MatchClient as MatchClientReexport,
  Order as OrderReexport,
  PlayerId,
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
// (b) Compile-time type conformance. Mutual assignability proves set
// equality for unions and field-for-field equality for objects. These
// aliases are enforced by `pnpm typecheck:conformance`.
// ---------------------------------------------------------------------------

/**
 * Mutual-assignability witness: `true` exactly when A and B are
 * mutually assignable (set equality for unions, field-for-field
 * equality for objects). The conditional form avoids the circular-
 * constraint error a two-parameter `extends` pair would raise.
 */
type AssertMutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

type OrderConforms = AssertMutuallyAssignable<Order, OrderReexport>;
type WorldConforms = AssertMutuallyAssignable<World, WorldReexport>;
type PlayerViewConforms = AssertMutuallyAssignable<PlayerView, PlayerViewReexport>;
type ConnectionStateConforms = AssertMutuallyAssignable<ConnectionState, ConnectionStateReexport>;
type MatchClientConforms = AssertMutuallyAssignable<MatchClient, MatchClientReexport>;

const ORDER_CONFORMS: OrderConforms = true;
const WORLD_CONFORMS: WorldConforms = true;
const PLAYER_VIEW_CONFORMS: PlayerViewConforms = true;
const CONNECTION_STATE_CONFORMS: ConnectionStateConforms = true;
const MATCH_CLIENT_CONFORMS: MatchClientConforms = true;

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
  DEFAULT_PLAYER_COLORS: null as unknown as typeof DistTypes.DEFAULT_PLAYER_COLORS,
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
  NetEvent: null as unknown as DistTypes.NetEvent,
  NetworkPayload: null as unknown as DistTypes.NetworkPayload,
  Order: null as unknown as DistTypes.Order,
  OrderAckPayload: null as unknown as DistTypes.OrderAckPayload,
  OrderSubmissionPayload: null as unknown as DistTypes.OrderSubmissionPayload,
  PlayerAction: null as unknown as DistTypes.PlayerAction,
  PlayerId: null as unknown as DistTypes.PlayerId,
  PlayerView: null as unknown as DistTypes.PlayerView,
  PointerBinding: null as unknown as DistTypes.PointerBinding,
  ProtocolEnvelope: null as unknown as DistTypes.ProtocolEnvelope<DistTypes.NetworkPayload>,
  QoLSettings: null as unknown as DistTypes.QoLSettings,
  ReduceOptions: null as unknown as DistTypes.ReduceOptions,
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
 * The barrel exports the contract's `ConsoleRuntime` INTERFACE under
 * the alias `ConsoleRuntimeContract` (the concrete class owns the
 * plain name). Prove the alias exists and that the class satisfies
 * it — one-directional: the class carries extra lifecycle members.
 */
type AssertExtends<A, B> = [A] extends [B] ? true : never;

type RuntimeAliasExists = AssertExtends<ConsoleRuntime, DistTypes.ConsoleRuntimeContract>;
const RUNTIME_ALIAS: RuntimeAliasExists = true;

// ---------------------------------------------------------------------------
// Mirror-name extraction
// ---------------------------------------------------------------------------

/** The four contract mirrors. */
const CONTRACT_FILES = [
  'console-types.ts',
  'console-state.ts',
  'console-to-networking.ts',
  'console-api.ts',
] as const;

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
    for (const name of extractPublicNames(
      readFileSync(packagePath(`contracts/${file}`), 'utf-8'),
    )) {
      all.add(name);
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contract conformance (T089)', () => {
  describe('(a) byte-identity of contract mirrors vs spec source-of-truth', () => {
    for (const file of CONTRACT_FILES) {
      it(`contracts/${file} is byte-identical to the spec copy`, () => {
        const local = readFileSync(packagePath(`contracts/${file}`), 'utf-8');
        const spec = readFileSync(
          repoPath(`.specify/features/005-client-console/contracts/${file}`),
          'utf-8',
        );
        expect(local).toBe(spec);
      });
    }
  });

  describe('(b) upstream types re-exported from src/state/types conform', () => {
    it('engine/fog/networking declarations are mutually assignable with canon', () => {
      // Compile-time proof lives in the aliases above (enforced by
      // typecheck:conformance); these assertions keep them used.
      expect(ORDER_CONFORMS).toBe(true);
      expect(WORLD_CONFORMS).toBe(true);
      expect(PLAYER_VIEW_CONFORMS).toBe(true);
      expect(CONNECTION_STATE_CONFORMS).toBe(true);
      expect(MATCH_CLIENT_CONFORMS).toBe(true);
      expect(RUNTIME_ALIAS).toBe(true);
      expect(TYPE_ONLY_WITNESSES.length).toBeGreaterThan(0);
    });

    it('the Order union exposes exactly the eight documented variants', () => {
      const player = 1 as PlayerId;
      expect(
        orderVariantWitness({ kind: 'setPipe', player, cell: { x: 1, y: 2 }, direction: 'N' }),
      ).toBe('setPipe:1,2:N');
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
      expect(Object.keys(Dist.DEFAULT_PLAYER_COLORS)).toHaveLength(4);
    });
  });
});
