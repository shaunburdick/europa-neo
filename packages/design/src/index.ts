/**
 * Public surface of the `@europa/design` package.
 *
 * T-001 scaffold — placeholder barrel so `tsup` has an entry and
 * `pnpm --filter @europa/design build` emits `dist/index.{js,d.ts}`.
 * Tokens (`src/tokens.ts`), the deterministic CSS emitter, and the
 * component catalog land in T-005 → T-008. This file will re-export
 * them; the placeholder is intentionally trivial and lint-clean.
 */

/** Scaffold marker — replaced by `TOKENS` in T-005. */
export const DESIGN_PLACEHOLDER = 'scaffold' as const;
