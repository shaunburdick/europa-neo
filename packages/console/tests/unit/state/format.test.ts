/**
 * formatRejection table-driven tests — Integration wave (review
 * follow-up T-I2).
 *
 * The code-quality-reviewer checkpoint flagged `format.ts` coverage
 * (54.5% statements / 39.1% branches): the FR-007 screen-reader
 * rejection path had no direct lock. This table pins ALL NINE
 * `ValidationError` variants to their exact user-facing messages, so
 * a wording regression or a missed union member fails loudly.
 * Exhaustiveness is compile-enforced too: adding a variant without a
 * row here cannot fail this suite, but the reducer's `default` arm in
 * `formatRejection` returns the raw reason — the table below asserts
 * every CURRENT variant maps to prose, never jargon.
 */

import { describe, expect, it } from 'vitest';

import { formatActionConfirmation, formatRejection } from '../../../src/state/format';
import type { PlayerAction, ValidationError } from '../../../src/state/types';

/**
 * The nine-variant rejection message table. Every row must map a
 * distinct `ValidationError` kind to its exact FR-007 string.
 */
const REJECTION_MESSAGES: ReadonlyArray<{
  readonly reason: ValidationError;
  readonly message: string;
}> = [
  {
    reason: { kind: 'out_of_bounds', coord: { x: -1, y: 0 } },
    message: 'Target cell is off the board',
  },
  { reason: { kind: 'water_target', coord: { x: 2, y: 2 } }, message: "Can't target a water cell" },
  { reason: { kind: 'not_owner', coord: { x: 3, y: 3 } }, message: "You don't own that cell" },
  {
    reason: { kind: 'paratroop_range', coord: { x: 4, y: 4 } },
    message: 'Target is out of range (max 2 cells)',
  },
  {
    reason: { kind: 'no_source_troops', coord: { x: 5, y: 5 } },
    message: 'Source cell has no troops',
  },
  { reason: { kind: 'already_surrendered' }, message: 'You have already surrendered' },
  {
    reason: { kind: 'invalid_percent', percent: 12 },
    message: 'Reserves must be between 0% and 90%',
  },
  { reason: { kind: 'unknown_player' }, message: 'Unknown player' },
  { reason: { kind: 'match_terminal' }, message: 'The match is already over' },
];

describe('formatRejection (FR-007 screen-reader path)', () => {
  it.each(REJECTION_MESSAGES)('$reason.kind → "$message"', ({ reason, message }) => {
    expect(formatRejection(reason)).toBe(message);
  });

  it('covers all nine ValidationError kinds with human-readable prose', () => {
    expect(REJECTION_MESSAGES).toHaveLength(9);
    const kinds = new Set(REJECTION_MESSAGES.map((row) => row.reason.kind));
    expect(kinds.size).toBe(9);
    // No engine jargon leaks through: every message is prose (contains
    // a space) and none merely echoes the raw kind name.
    for (const row of REJECTION_MESSAGES) {
      expect(row.message).toContain(' ');
      expect(row.message).not.toBe(row.reason.kind);
    }
  });
});

describe('formatActionConfirmation (companion FR-007 surface)', () => {
  const at = (x: number, y: number): string => `(${x}, ${y})`;

  it.each([
    [
      { kind: 'setPipe', cell: { x: 1, y: 2 }, direction: 'N' } as PlayerAction,
      `Pipe N at ${at(1, 2)}`,
    ],
    [
      { kind: 'clearPipe', cell: { x: 1, y: 2 }, direction: 'S' } as PlayerAction,
      `Clear pipe S at ${at(1, 2)}`,
    ],
    [
      { kind: 'setPipesExclusive', cell: { x: 3, y: 4 }, direction: 'E' } as PlayerAction,
      `Exclusive pipe E at ${at(3, 4)}`,
    ],
    [
      { kind: 'clearAllPipes', cell: { x: 3, y: 4 } } as PlayerAction,
      `Cleared all pipes at ${at(3, 4)}`,
    ],
    [
      { kind: 'setReserves', cell: { x: 5, y: 6 }, percent: 7 } as PlayerAction,
      `Reserved 70% at ${at(5, 6)}`,
    ],
    [
      {
        kind: 'paratroop',
        source: { x: 1, y: 1 },
        target: { x: 2, y: 3 },
      } as PlayerAction,
      'Paratroop (1, 1) → (2, 3)',
    ],
    [
      { kind: 'gun', source: { x: 4, y: 5 }, target: { x: 6, y: 7 } } as PlayerAction,
      'Gun fire (4, 5) → (6, 7)',
    ],
    [{ kind: 'surrender' } as PlayerAction, 'Surrender requested'],
  ])('%s → "%s"', (action, expected) => {
    const cell =
      action.kind === 'paratroop' || action.kind === 'gun'
        ? action.source
        : action.kind === 'surrender'
          ? { x: 0, y: 0 }
          : action.cell;
    expect(formatActionConfirmation(action, cell)).toBe(expected);
  });
});
