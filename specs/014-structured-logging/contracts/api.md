# Contracts: @europa/logging

## Public API Surface

The package's documented public surface is six symbols from its barrel (`src/index.ts`); the barrel additionally exports the `CreateLoggerOptions` and `LogLevel` types (see the exact export block below).

| Export | Kind | Description |
|--------|------|-------------|
| `Logger` | type (interface) | Minimal 4-method logger interface (debug/info/warn/error) |
| `LogContext` | type (interface) | Typed context fields for structured log lines |
| `createLogger` | function | Factory returning a Logger that writes JSON or pretty lines |
| `NULL_LOGGER` | const (Logger) | No-op logger — calling any method produces no output |
| `sanitizeLogText` | function | Control-char (`\p{Cc}`), format-char (`\p{Cf}`), and separator-char (`\p{Zl}`/`\p{Zp}`) stripping, trimming, truncation for untrusted text |
| `formatError` | function | Fail-soft formatting of arbitrary caught values for log fields |

Exact barrel (`src/index.ts`):

```typescript
export type { CreateLoggerOptions, LogContext, Logger, LogLevel } from './logger';
export { createLogger, formatError } from './logger';
export { NULL_LOGGER } from './null-logger';
export { sanitizeLogText } from './sanitize';
```

## Interface Contract: Logger

```typescript
interface Logger {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}
```

**Methods**: Each accepts a string message and an optional context object. Callers may pass `LogContext`-typed objects — `LogContext` is structurally identical to `Record<string, unknown>` and is compatible with this interface.
**Behavior**: debug/info → stdout; warn/error → stderr. Below-threshold calls are silently dropped (no serialization).
**Pretty-mode sanitization (v1.1)**: In pretty mode, the logger applies `sanitizeLogText()` to the message and all string context values before interpolation. This prevents log forging and terminal escape injection.
**Side effects**: Synchronous `process.stdout.write` / `process.stderr.write` only. No async, no buffering, no events.
**Fail-soft invariant (v1.2)**: No `logger.*()` call ever throws at its caller. Hostile message/context coercions (`toString()`/`valueOf()`/`Symbol.toPrimitive` that throws) render as `[unprintable message]` / `[unprintable]`; a context object whose getters or proxy traps throw is abandoned — JSON mode emits `context: {}`, pretty mode emits no context braces; a writer that throws (injected override or broken stream) is swallowed silently, with no fallback diagnostic; a last-resort guard around the whole write body swallows anything unforeseen. Severity filtering runs before coercion, so dropped messages never touch the caller's object.

## Formatter Contract: formatError

```typescript
function formatError(err: unknown): string;
```

The formatter never throws. An `Error` returns its safely coerced `message`, preserving message-only logging. A non-`Error` returns safely coerced `String(err)`. Error detection, message access, or coercion failures return the literal `[unprintable]`.

## Factory Contract: createLogger

```typescript
function createLogger(opts?: CreateLoggerOptions): Logger;

interface CreateLoggerOptions {
  readonly level?: string;   // override LOG_LEVEL env var
  readonly format?: string;  // override LOG_FORMAT env var
  readonly stdout?: (data: string) => void;  // override stdout writer (fire-and-forget)
  readonly stderr?: (data: string) => void;  // override stderr writer (fire-and-forget)
}
```

**Writer return type**: `void` — the logger is fire-and-forget; it does not inspect the writer's return value. `process.stdout.write` returns `boolean` (backpressure), but the logger ignores it. Writer overrides (primarily for testing) return `void` for simplicity.

**Env var behavior**:
- `LOG_LEVEL`: default `"info"`, invalid → `"info"` + one stderr warning
- `LOG_FORMAT`: default `"json"`, invalid → `"json"` + one stderr warning
- The raw value in both warnings is passed through `sanitizeLogText()` (v1.2) — bounded, no raw newline/ANSI/bidi — so a hostile env value cannot forge or escape the warning line. Startup diagnostics are written through the same fail-soft sink wrappers as log lines.

**Fail-soft serialization (v1.1)**: When `JSON.stringify` throws on context values (cyclic references, BigInt, throwing `toJSON()`), the logger catches the exception and falls back to `context: {}` in JSON mode. Pretty mode never calls `JSON.stringify`; the pretty-mode analog of an unreadable context is emitting no context braces. A single diagnostic warning is emitted to stderr on the first failure per logger instance.

**`context` key semantics (JSON mode)**: absent `context` key = caller passed no context; `"context": {}` = failure fallback (context could not be read or serialized). The key is never emitted as `{}` merely because no context was passed, and never omitted on failure.

**Output format (JSON)**:
```json
{"timestamp":"<ISO-8601>","level":"<level>","message":"<msg>","context":{...<ctx>}}
```
(`context` present only when the caller passed context or a failure fallback applies — see above.)

**Output format (pretty)**:
```
[<timestamp>] <LEVEL_PAD8>  <sanitized-msg> {<sanitized-ctx>}
```

In pretty mode, the message and all string context values are passed through `sanitizeLogText()` before interpolation — control characters (`\p{Cc}`), format characters (`\p{Cf}`, including bidi isolates), and line/paragraph separators (`\p{Zl}`/`\p{Zp}`, U+2028/U+2029) are stripped.

## Re-export Contract (networking backward compat)

`@europa/networking` re-exports `Logger` type and `NULL_LOGGER` constant from its public barrel. Existing import paths (`import { Logger, NULL_LOGGER } from '@europa/networking'`) continue to resolve unchanged.

## Migration Contract (host-config backward compat)

`packages/console/scripts/host-config.ts` re-exports `sanitizeLogText` from `@europa/logging`. Existing import paths continue to resolve unchanged.
