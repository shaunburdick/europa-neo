# Tasks: Structured Logging for Server Processes (Feature 020)

## Overview

Create `@europa/logging` package, migrate Logger interface + NULL_LOGGER + sanitizeLogText, consolidate duplicates, and wire the host script to structured output.

## Tasks

### Wave 1: Package Scaffold

- [x] **T-001**: Create `packages/logging/` scaffold — `package.json` (private, `type: "module"`, zero deps), `tsconfig.json` (extends `../../tsconfig.base.json`), `tsup.config.ts`, `vitest.config.ts` (80% thresholds on `src/**/*.ts`), `biome.jsonc` (extends root). Mirror `packages/version/` structure exactly. [Foundation]

### Wave 2: Core Implementation [P — T-002 and T-003 are parallel-safe]

- [x] **T-002**: Implement `src/logger.ts` — `Logger` interface + `createLogger(opts?)` factory. Reads `LOG_LEVEL`/`LOG_FORMAT` from env, validates, emits one stderr warning on invalid values. JSON mode: `{timestamp, level, message, context?: {...ctx}}` via `JSON.stringify` → `process.stdout.write` (debug/info) or `process.stderr.write` (warn/error). Pretty mode: `[<timestamp>] <LEVEL_PAD8>  <msg> {<ctx>}`. Level filtering via numeric index comparison. Reserved field stripping (timestamp/level/message from ctx are never included in context subkey). [Core — FR-002, FR-003, FR-004, FR-005, FR-010]

- [x] **T-003**: Implement `src/sanitize.ts` — move `sanitizeLogText()` from `packages/console/scripts/host-config.ts` (line 79). Copy the function verbatim: `LOG_CONTROL_CHARS` regex, `LOG_TEXT_MAX_LENGTH` constant, the `sanitizeLogText` function. Zero behavior changes. [Core — FR-008]

- [x] **T-004**: Implement `src/null-logger.ts` — `NULL_LOGGER` constant (no-op Logger). Identical to current `packages/networking/src/contracts/network-api.ts` line 600. [Core — FR-007]

- [x] **T-005**: Implement `src/types.ts` — `LogContext` type alias. [Core — FR-010]

- [x] **T-006**: Implement `src/index.ts` — public barrel exporting `Logger` (type), `LogContext` (type), `createLogger`, `NULL_LOGGER`, `sanitizeLogText`. [Core — FR-011]

### Wave 3: Tests [P — T-007, T-008, T-009 are parallel-safe]

- [x] **T-007**: Write `tests/logger.test.ts` — unit tests for `createLogger()`:
  - JSON output to stdout with correct structure (AC-011)
  - JSON output to stderr for warn/error (AC-012)
  - Level filtering: below-threshold messages produce no output (AC-013)
  - Pretty format matches expected pattern (AC-014)
  - Invalid LOG_LEVEL defaults to "info" + stderr warning
  - Invalid LOG_FORMAT defaults to "json" + stderr warning
  - Empty message produces valid JSON with `"message": ""`
  - Reserved context field names overwritten by logger fields
  - Custom stdout/stderr writer overrides (for test injection)
  - Coverage ≥ 80% on all metrics (AC-010)

- [x] **T-008**: Write `tests/null-logger.test.ts` — verify NULL_LOGGER is no-op (AC-005):
  - Calling debug/info/warn/error produces no output
  - Calling with context produces no output
  - No side effects (no throws, no writes)

- [x] **T-009**: Write `tests/sanitize.test.ts` — verify sanitizeLogText behavior (AC-006):
  - Control characters replaced with spaces
  - Trimmed
  - Truncated to default maxLength (200) with ellipsis
  - Custom maxLength respected
  - Empty string returns empty string
  - Non-control text passes through unchanged

### Wave 4: Integration Wiring

- [x] **T-010**: Update `packages/networking/src/contracts/network-api.ts` — replace Logger interface + NULL_LOGGER with re-exports from `@europa/logging`. Add `@europa/logging` as a dependency in `packages/networking/package.json`. Keep `Logger` type export and `NULL_LOGGER` value export in networking's public barrel unchanged. [FR-006, AC-007]

- [x] **T-011**: Update `packages/networking/src/types.ts` — ensure `Logger` type and `NULL_LOGGER` value re-export chain still works (`types.ts` → `index.ts`). Verify all networking test imports still resolve. [FR-006, AC-007]

- [x] **T-012**: Update `packages/matchmaking/src/internal/lobbyService.ts` — remove local `NULL_LOGGER` definition (line 179-185), import from `@europa/networking`. [FR-007, AC-008]

- [x] **T-013**: Update `packages/matchmaking/src/matchmaker.ts` — remove local `NULL_LOGGER` definition (line 157-163), import from `@europa/networking`. [FR-007, AC-008]

- [x] **T-014**: Update `packages/console/scripts/host-config.ts` — replace `sanitizeLogText` function body with re-export from `@europa/logging`. Add `@europa/logging` as a dependency in `packages/console/package.json`. Keep the re-export so existing imports in host.ts and tests continue to work. [FR-008, AC-006]

- [x] **T-015**: Update `packages/console/scripts/host.ts` — replace `say()`/`complain()` helpers with `createLogger()` from `@europa/logging`. Wire the logger into `ServerDeps.logger`. Remove `NULL_LOGGER` import from host.ts (now uses createLogger). [FR-009, AC-009]

### Wave 5: Verification

- [x] **T-016**: Run `pnpm --filter @europa/logging test` — all tests pass, coverage ≥ 80% on all metrics. [AC-010]

- [x] **T-017**: Run `pnpm --filter @europa/networking test` — no regressions from interface migration. [AC-015]

- [x] **T-018**: Run `pnpm --filter @europa/matchmaking test` — no regressions from NULL_LOGGER consolidation. [AC-015]

- [x] **T-019**: Run `pnpm verify` — full suite passes across all packages. [AC-015]

- [ ] **T-020**: Manual smoke test — `LOG_LEVEL=debug LOG_FORMAT=pretty pnpm host --create` produces structured output with timestamps, levels, and context fields for match creation, seat fills, and server lifecycle events.

### Wave 6: Bug Fix — EUR-137 (F-LOG-001, F-LOG-002, F-LOG-005)

- [x] **T-021**: Update `packages/logging/src/sanitize.ts` — extend `LOG_CONTROL_CHARS` regex from `/\p{Cc}/gu` to `/[\p{Cc}\p{Cf}]/gu` to strip format characters (bidi isolates, soft hyphen, word joiner, etc.) in addition to control characters. Update JSDoc to reflect the expanded character class. [FR-008, AC-021]

- [x] **T-022**: Update `packages/logging/src/logger.ts` — add fail-soft `JSON.stringify` wrapper. Wrap the `JSON.stringify(envelope)` call (line 217) in a try/catch. On catch: fall back to `{}` for the context key (JSON mode) or omit context (pretty mode). Emit one diagnostic warning to stderr on the first failure per logger instance (use a `boolean` flag, not per-call). Log line is still written. [F-LOG-001, AC-016/017/018]

- [x] **T-023**: Update `packages/logging/src/logger.ts` — in pretty mode, apply `sanitizeLogText()` to the `message` parameter and all string-valued context fields before interpolation. Import `sanitizeLogText` from `./sanitize`. This prevents log forging (injected newlines) and terminal escape injection (ESC sequences, bidi overrides) in pretty output. [F-LOG-002, AC-019/020]

- [x] **T-024**: Update `packages/logging/src/logger.ts` — ensure `Logger` interface `ctx` parameter type is `Readonly<Record<string, unknown>>` (already the case). Verify that `LogContext` (from `./logger` or `./types`) is compatible — callers can pass `LogContext`-typed objects without type errors. No code change needed if already compatible; document in JSDoc. [F-LOG-005, AC-022]

- [x] **T-025**: Update `packages/logging/src/types.ts` — simplify `LogContext` to `{ readonly [key: string]: unknown }` (remove illustrative named properties `matchId`, `playerId`, `tick`, `event`). These were never enforced and the Logger interface accepts `Record<string, unknown>` anyway. [F-LOG-005]

- [x] **T-026**: Update `packages/logging/src/logger.ts` — change `CreateLoggerOptions.stdout` and `CreateLoggerOptions.stderr` writer types from `(data: string) => boolean` to `(data: string) => void` to match the actual `process.stdout.write` / `process.stderr.write` usage (fire-and-forget). Update JSDoc accordingly. [F-LOG-005]

- [x] **T-027**: Update `packages/logging/tests/sanitize.test.ts` — add tests for `\p{Cf}` character stripping:
  - Bidi override (U+202E) stripped → replaced with space
  - Bidi isolate (U+2066) stripped → replaced with space
  - Soft hyphen (U+00AD) stripped → replaced with space
  - Word joiner (U+2060) stripped → replaced with space
  - Mixed `\p{Cc}` and `\p{Cf}` characters all stripped
  [AC-021]

- [x] **T-028**: Update `packages/logging/tests/logger.test.ts` — add tests for:
  - Cyclic context value → `JSON.stringify` throws → log line written with `{}` context (JSON mode) or no context (pretty mode) [AC-016]
  - BigInt context value → `JSON.stringify` throws → log line written with `{}` context [AC-017]
  - Context value with throwing `toJSON()` → log line written with `{}` context [AC-018]
  - Pretty mode: message with `\n` sanitized (no raw newline in output) [AC-019]
  - Pretty mode: message with `\x1b[31m` sanitized (no ANSI escape in output) [AC-019]
  - Pretty mode: string context value with `\r\n` sanitized [AC-020]
  - Pretty mode: string context value with bidi override (U+202E) sanitized [AC-020]
  [AC-016/017/018/019/020]

- [x] **T-029**: Run `pnpm --filter @europa/logging test` — all new tests pass, coverage ≥ 80%. Verify no regressions in existing tests. [AC-010]

- [x] **T-030**: Run `pnpm verify` — full suite passes across all packages. No regressions from the bug fix changes. [AC-015]
