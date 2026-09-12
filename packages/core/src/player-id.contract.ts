/**
 * Compile-time contract witnesses: canonical player identity (issue #74).
 *
 * `packages/core/tests/` is excluded from the package `tsconfig.json`, so
 * type-level assertions placed in tests are never checked by
 * `pnpm --filter @europa/core typecheck`. This module lives in `src/` so
 * the strict program typechecks it, but it is unreachable from the
 * package entry (`index.ts`) and therefore never emitted or bundled —
 * every symbol is a type alias that erases completely.
 *
 * If a brand ever stops being nominal (e.g. `PlayerId` and
 * `GuestPlayerId` collapse to plain `string`), these witnesses stop
 * compiling and the `typecheck` gate fails loudly. That is the point.
 */

import type { GuestPlayerId, PlayerId } from './player-id';

/** `true` iff `From` is assignable to `To`. */
type IsAssignable<From, To> = [From] extends [To] ? true : false;

/** Compile-time assertion that `T` is exactly `true`. */
type AssertTrue<T extends true> = T;

/** Compile-time assertion that `T` is exactly `false`. */
type AssertFalse<T extends false> = T;

/** Both identity brands are usable as ordinary strings. */
export type PlayerIdIsString = AssertTrue<IsAssignable<PlayerId, string>>;

/** Both identity brands are usable as ordinary strings. */
export type GuestPlayerIdIsString = AssertTrue<IsAssignable<GuestPlayerId, string>>;

/** A `PlayerId` must never be silently accepted where a guest identity is expected. */
export type PlayerIdIsNotGuestPlayerId = AssertFalse<IsAssignable<PlayerId, GuestPlayerId>>;

/** A guest identity must never be silently accepted where a `PlayerId` is expected. */
export type GuestPlayerIdIsNotPlayerId = AssertFalse<IsAssignable<GuestPlayerId, PlayerId>>;
