import type { Board } from '@europa/engine';

/**
 * Hash a `Board` into a stable 16-character hex string using integer-only
 * FNV-1a-style 64-bit arithmetic.
 *
 * @param board The Board to hash.
 * @returns 16-character lowercase hex string.
 */
export function hashBoard(board: Readonly<Board>): string {
  const fnvOffsetLo = 0xcbf29ce4;
  const fnvOffsetHi = 0x84222325;
  const fnvPrimeLo = 0x01000193;
  const fnvPrimeHi = 0x000001b3;
  let lo = fnvOffsetLo >>> 0;
  let hi = fnvOffsetHi >>> 0;
  const step = (byte: number): void => {
    lo ^= byte & 0xff;
    const loTimesPrime = Math.imul(lo, fnvPrimeLo);
    const carry = Math.floor((lo * fnvPrimeLo) / 0x100000000);
    lo = (loTimesPrime >>> 0) & 0xffffffff;
    const hiTimesPrime = Math.imul(hi, fnvPrimeLo) >>> 0;
    const hiPlus = Math.imul(lo, fnvPrimeHi) >>> 0;
    hi = ((hiTimesPrime + hiPlus + carry) >>> 0) & 0xffffffff;
  };
  for (const cell of board.cells) {
    if (!cell) {
      continue;
    }
    step(cell.x);
    step(cell.y);
    step(cell.elevation);
    step(cell.terrain === 'water' ? 1 : 0);
  }
  for (const city of board.cities) {
    step(city.cell.x);
    step(city.cell.y);
    step(city.owner as number);
  }
  let h = lo ^ Math.imul(hi, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const combined = (BigInt(hi) * 0x100000000n + BigInt(lo)).toString(16).padStart(16, '0');
  return combined.slice(-16);
}
