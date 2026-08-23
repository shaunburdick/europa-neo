/**
 * Order test fixtures — Feature 005 (T035).
 *
 * Typed builders for every engine `Order` variant (data-model.md §11
 * mapping table), so tests construct wire orders without hand-writing
 * object literals. Pure.
 */

import type { Coord, Direction, Order, PlayerId, ReservesPct } from '../../src/state/types';

/**
 * Build an order of exactly the requested kind. The generic return
 * type means `buildOrder('setPipe', { direction: 'N' })` type-checks
 * field names against `OrderSetPipe` specifically — a typo in
 * `overrides` is a compile error, not a runtime surprise.
 *
 * Default player is 1; default coords are (0, 0); default percent 0;
 * default directions 'N'. All fields overridable.
 *
 * @param kind      Discriminant of the order to build.
 * @param overrides Field overrides for the chosen variant.
 * @returns A complete engine `Order` of the narrowed variant type.
 */
export function buildOrder<K extends Order['kind']>(
  kind: K,
  overrides?: Partial<Extract<Order, { kind: K }>>,
): Extract<Order, { kind: K }> {
  const player = 1 as PlayerId;
  const origin: Coord = { x: 0, y: 0 };
  let base: Extract<Order, { kind: K }>;
  switch (kind) {
    case 'setPipe':
      base = { kind, player, cell: origin, direction: 'N' } as Extract<Order, { kind: K }>;
      break;
    case 'clearPipe':
      base = { kind, player, cell: origin, direction: 'N' } as Extract<Order, { kind: K }>;
      break;
    case 'setPipesExclusive':
      base = { kind, player, cell: origin, direction: 'N' } as Extract<Order, { kind: K }>;
      break;
    case 'clearAllPipes':
      base = { kind, player, cell: origin } as Extract<Order, { kind: K }>;
      break;
    case 'setReserves':
      base = { kind, player, cell: origin, percent: 0 } as Extract<Order, { kind: K }>;
      break;
    case 'paratroop':
      base = { kind, player, source: origin, target: { x: 1, y: 0 } } as Extract<
        Order,
        { kind: K }
      >;
      break;
    case 'gun':
      base = { kind, player, source: origin, target: { x: 1, y: 0 } } as Extract<
        Order,
        { kind: K }
      >;
      break;
    case 'surrender':
      base = { kind, player } as Extract<Order, { kind: K }>;
      break;
    default:
      base = kind as never;
  }
  if (overrides === undefined) {
    return base;
  }
  return { ...base, ...overrides };
}

/** Convenience: pipe toggle order at `coord` toward `direction`. */
export function buildPipeToggle(coord: Coord, direction: Direction): Order {
  return buildOrder('setPipe', { cell: coord, direction });
}

/** Convenience: reserves order at `coord` for `percent` (0..9). */
export function buildReserves(coord: Coord, percent: ReservesPct): Order {
  return buildOrder('setReserves', { cell: coord, percent });
}

/** Convenience: paratroop attack from `source` to `target`. */
export function buildParatroop(source: Coord, target: Coord): Order {
  return buildOrder('paratroop', { source, target });
}

/** Convenience: gun fire from `source` to `target`. */
export function buildGun(source: Coord, target: Coord): Order {
  return buildOrder('gun', { source, target });
}
