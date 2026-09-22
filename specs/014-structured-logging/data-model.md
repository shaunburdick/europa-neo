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

**Source of truth**: `packages/networking/src/contracts/network-api.ts` lines 592-597 (canonical definition being migrated here).

### LogContext (type alias)

```typescript
/**
 * Typed context fields for structured log lines.
 * Structurally identical to Record<string, unknown> — callers may use
 * this type for ergonomic context objects, or pass ad-hoc records.
 */
export type LogContext = {
  readonly [key: string]: unknown;
};
```

**Note (v1.1)**: `LogContext` is now structurally identical to `Record<string, unknown>` and is compatible with the `Logger` interface's `ctx` parameter. The Logger interface accepts `Readonly<Record<string, unknown>>` — callers may use `LogContext` or pass ad-hoc objects. The named properties (`matchId`, `playerId`, `tick`, `event`) from v1.0 were removed — they were illustrative examples, not enforced constraints.

### LogLevel (internal)

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'] as const;
```

Internal to the logger implementation. Not exported.

## Constants

### NULL_LOGGER

```typescript
/**
 * No-op logger. Used as default when a logger is optional.
 * Calling any method produces no output and no side effects.
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
 * Create a structured logger that writes JSON (or pretty) lines to stdout/stderr.
 *
 * Reads LOG_LEVEL and LOG_FORMAT from process.env at call time.
 * Messages below the configured level are silently dropped.
 *
 * @param opts  Optional overrides (primarily for testing).
 * @returns A Logger implementation.
 */
export function createLogger(opts?: {
  /** Override LOG_LEVEL env var. Default: process.env.LOG_LEVEL ?? 'info' */
  level?: string;
  /** Override LOG_FORMAT env var. Default: process.env.LOG_FORMAT ?? 'json' */
  format?: string;
  /** Override stdout writer. Default: process.stdout.write.bind(process.stdout). Fire-and-forget. */
  stdout?: (chunk: string) => void;
  /** Override stderr writer. Default: process.stderr.write.bind(process.stderr). Fire-and-forget. */
  stderr?: (chunk: string) => void;
}): Logger;
```

**Key behaviors**:
- Reads `LOG_LEVEL` from `process.env` (default `"info"`)
- Reads `LOG_FORMAT` from `process.env` (default `"json"`)
- Invalid `LOG_LEVEL` → default to `"info"` + one stderr warning
- Invalid `LOG_FORMAT` → default to `"json"` + one stderr warning
- Context fields with reserved names (`timestamp`, `level`, `message`) are stripped from context subkey
- Writer return type is `void` — fire-and-forget, no backpressure handling
- **Fail-soft (v1.1)**: When `JSON.stringify` throws on context values, falls back to `{}` (JSON mode) or omits context (pretty mode). One diagnostic warning emitted to stderr on first failure per instance.

### sanitizeLogText(text, maxLength?)

```typescript
/**
 * Make wire-derived text safe to interpolate into a diagnostics line:
 * control characters and format characters become spaces, result is
 * trimmed and length-capped.
 *
 * @param text      Raw text (error messages, handles, any untrusted string).
 * @param maxLength Truncation cap (default {@link LOG_TEXT_MAX_LENGTH}).
 * @returns Sanitized single-line text.
 */
export function sanitizeLogText(text: string, maxLength?: number): string;
```

**Migrated from**: `packages/console/scripts/host-config.ts` line 79.
**Behavior (v1.1)**: Control chars (`\p{Cc}`) and format chars (`\p{Cf}`, including bidi isolates U+202A–U+202E, U+2066–U+2069, soft hyphen U+00AD, word joiner U+2060) → spaces, trim, truncate to maxLength with ellipsis.
**Pretty-mode usage (v1.1)**: In pretty mode, the logger applies `sanitizeLogText()` to the message string and all string-valued context fields before interpolation — preventing log forging and terminal escape injection.

## Exported Barrel (`src/index.ts`)

```typescript
export type { Logger } from './logger';
export type { LogContext } from './types';
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

Context fields are nested under a `context` subkey. The `context` key is omitted entirely when no context fields are provided.

## Pretty Output Shape

```
[2026-09-06T14:30:00.123Z] INFO   match started { matchId: "m-abc-123", playerCount: 2 }
```

Format: `[<timestamp>] <LEVEL_PAD8>  <message> {<ctx>}` where ctx is a single-line JSON object of context fields (excluding timestamp/level/message).
