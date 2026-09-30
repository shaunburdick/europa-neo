# Data Model: @europa/logging

## Types

### Logger (interface)

```typescript
/**
 * Minimal logger interface for server-side processes.
 * Four severity levels: debug < info < warn < error.
 */
export interface Logger {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}
```

**Source of truth**: `packages/logging/src/logger.ts` (migrated from `packages/networking/src/contracts/network-api.ts` lines 592-597; networking now re-exports it).

### LogContext (interface)

```typescript
/**
 * Typed context fields for structured log lines.
 * Structurally identical to Record<string, unknown> — callers may use
 * this type for ergonomic context objects, or pass ad-hoc records.
 */
export interface LogContext {
    readonly [key: string]: unknown;
}
```

**Note (v1.1)**: `LogContext` is now structurally identical to `Record<string, unknown>` and is compatible with the `Logger` interface's `ctx` parameter. The Logger interface accepts `Readonly<Record<string, unknown>>` — callers may use `LogContext` or pass ad-hoc objects. The named properties (`matchId`, `playerId`, `tick`, `event`) from v1.0 were removed — they were illustrative examples, not enforced constraints.

### LogLevel (exported type)

```typescript
/**
 * Log severity levels in ascending order of importance.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'] as const;
const LEVEL_INDEX: ReadonlyMap<LogLevel, number> = new Map(LEVEL_ORDER.map((level, index) => [level, index]));
```

Exported from the barrel as a type (see `src/index.ts` below); `LEVEL_ORDER`/`LEVEL_INDEX` are internal to the logger implementation. The array index IS the numeric severity — higher index = more severe.

## Constants

### NULL_LOGGER

```typescript
/**
 * No-op logger. Used as default when no logger is provided.
 *
 * Calling any method produces no output and no side effects.
 * This is the canonical definition — consumers in networking,
 * matchmaking, and test harnesses should import from
 * `@europa/logging` (or the networking re-export).
 */
export const NULL_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
```

**Migrated from**: `packages/networking/src/contracts/network-api.ts` line 600.
**Consolidates**: 3 copies (networking, matchmaking lobbyService, matchmaking matchmaker).

## Functions

### createLogger(opts?)

```typescript
/**
 * Configuration options for {@link createLogger}. All fields optional;
 * defaults read from process.env at call time (not import time), so
 * tests can override env vars before creating loggers.
 */
export interface CreateLoggerOptions {
  /** Minimum severity level to emit. @default process.env.LOG_LEVEL ?? "info" */
  readonly level?: string;
  /** Output format: "json" | "pretty". @default process.env.LOG_FORMAT ?? "json" */
  readonly format?: string;
  /** Override stdout writer (default: process.stdout.write). Injected for testability. */
  readonly stdout?: (data: string) => void;
  /** Override stderr writer (default: process.stderr.write). Injected for testability. */
  readonly stderr?: (data: string) => void;
}

export function createLogger(opts?: CreateLoggerOptions): Logger;
```

**Key behaviors**:
- Reads `LOG_LEVEL` from `process.env` (default `"info"`)
- Reads `LOG_FORMAT` from `process.env` (default `"json"`)
- Invalid `LOG_LEVEL` → default to `"info"` + one stderr warning (raw value passed through `sanitizeLogText()` — bounded, no raw newline/ANSI)
- Invalid `LOG_FORMAT` → default to `"json"` + one stderr warning (sanitized the same way)
- Context fields with reserved names (`timestamp`, `level`, `message`) are stripped from context subkey
- Writer return type is `void` — fire-and-forget, no backpressure handling
- **Fail-soft (v1.1)**: When `JSON.stringify` throws on context values, falls back to `context: {}` (JSON mode — present-but-empty, not omitted). Pretty mode never calls `JSON.stringify`; an unreadable context renders with no braces. One diagnostic warning emitted to stderr on first failure per instance.
- **Fail-soft hardening (v1.2)**: No `logger.*()` call ever throws at the caller. Message coercion failures render `[unprintable message]`; context-value coercion failures render `[unprintable]`; a context object whose getters/proxies throw is abandoned → `context: {}` (JSON) / no braces (pretty); throwing writers are swallowed silently (including during startup diagnostics); a last-resort guard wraps the whole write body. Severity filtering runs before coercion, so dropped messages never touch the caller's object.

### sanitizeLogText(text, maxLength?)

```typescript
/**
 * Make wire-derived text safe to interpolate into a diagnostics line:
 * control characters become spaces and the result is trimmed and
 * length-capped. Plain string interpolation of the returned text is
 * then fine. Structural facts (ports, seat numbers, enum reasons) never
 * need this; apply it to anything not fully host-controlled.
 *
 * @param text      Raw text (error messages, handles, any untrusted string).
 * @param maxLength Truncation cap (default {@link LOG_TEXT_MAX_LENGTH}).
 * @returns Sanitized single-line text.
 */
export function sanitizeLogText(text: string, maxLength?: number): string;
```

**Migrated from**: `packages/console/scripts/host-config.ts` line 79.
**Behavior (v1.2)**: Control chars (`\p{Cc}`), format chars (`\p{Cf}`, including bidi isolates U+202A–U+202E, U+2066–U+2069, soft hyphen U+00AD, word joiner U+2060), and line/paragraph separators (`\p{Zl}` U+2028 / `\p{Zp}` U+2029) → spaces, trim, truncate to maxLength with ellipsis. Regex: `/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu`. The separators are not control or format characters, but log viewers treat them as line terminators — a smuggled U+2028/U+2029 forges a log line like `\n`.
**Pretty-mode usage (v1.1)**: In pretty mode, the logger applies `sanitizeLogText()` to the message string, every context key, and every rendered context value before interpolation — strings are quoted then sanitized, non-strings stringified then sanitized (hostile coercions render as `[unprintable]`) — preventing log forging and terminal escape injection. Invalid `LOG_LEVEL`/`LOG_FORMAT` startup warnings also pass the raw value through `sanitizeLogText()` (v1.2).

## Exported Barrel (`src/index.ts`)

```typescript
export type { CreateLoggerOptions, LogContext, Logger, LogLevel } from './logger';
export { createLogger } from './logger';
export { NULL_LOGGER } from './null-logger';
export { sanitizeLogText } from './sanitize';
```

## JSON Output Shape

```json
{
  "timestamp": "2026-09-06T14:30:00.123Z",
  "level": "info",
  "message": "match started",
  "context": {
    "matchId": "m-abc-123",
    "playerCount": 2
  }
}
```

Context fields are nested under a `context` subkey. The `context` key is omitted entirely when no context fields were passed by the caller. A present-but-empty `"context": {}` is the failure fallback — emitted when the context could not be read (hostile getters/proxy traps) or could not be serialized (`JSON.stringify` failure) — so consumers can distinguish "serialization failed" from "caller passed no context".

## Pretty Output Shape

```
[2026-09-06T14:30:00.123Z] INFO   match started { matchId: "m-abc-123", playerCount: 2 }
```

Format: `[<timestamp>] <LEVEL_PAD8>  <message> {<ctx>}` where ctx is a single-line JSON object of context fields (excluding timestamp/level/message).
