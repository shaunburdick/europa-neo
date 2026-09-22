# Contracts: @europa/logging

## Public API Surface

The package exports five symbols from its barrel (`src/index.ts`):

| Export | Kind | Description |
|--------|------|-------------|
| `Logger` | type (interface) | Minimal 4-method logger interface (debug/info/warn/error) |
| `LogContext` | type (alias) | Typed context fields for structured log lines |
| `createLogger` | function | Factory returning a Logger that writes JSON or pretty lines |
| `NULL_LOGGER` | const (Logger) | No-op logger — calling any method produces no output |
| `sanitizeLogText` | function | Control-char (`\p{Cc}`) and format-char (`\p{Cf}`) stripping, trimming, truncation for untrusted text |

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

## Factory Contract: createLogger

```typescript
function createLogger(opts?: {
  level?: string;      // override LOG_LEVEL env var
  format?: string;     // override LOG_FORMAT env var
  stdout?: (chunk: string) => void;  // override stdout writer (fire-and-forget)
  stderr?: (chunk: string) => void;  // override stderr writer (fire-and-forget)
}): Logger;
```

**Writer return type**: `void` — the logger is fire-and-forget; it does not inspect the writer's return value. `process.stdout.write` returns `boolean` (backpressure), but the logger ignores it. Writer overrides (primarily for testing) return `void` for simplicity.

**Env var behavior**:
- `LOG_LEVEL`: default `"info"`, invalid → `"info"` + one stderr warning
- `LOG_FORMAT`: default `"json"`, invalid → `"json"` + one stderr warning

**Fail-soft serialization (v1.1)**: When `JSON.stringify` throws on context values (cyclic references, BigInt, throwing `toJSON()`), the logger catches the exception and falls back to `{}` for the context key in JSON mode, or omits context in pretty mode. A single diagnostic warning is emitted to stderr on the first failure per logger instance.

**Output format (JSON)**:
```json
{"timestamp":"<ISO-8601>","level":"<level>","message":"<msg>","context":{...<ctx>}}
```

**Output format (pretty)**:
```
[<timestamp>] <LEVEL_PAD8>  <sanitized-msg> {<sanitized-ctx>}
```

In pretty mode, the message and all string context values are passed through `sanitizeLogText()` before interpolation — control characters (`\p{Cc}`) and format characters (`\p{Cf}`, including bidi isolates) are stripped.

## Re-export Contract (networking backward compat)

`@europa/networking` re-exports `Logger` type and `NULL_LOGGER` constant from its public barrel. Existing import paths (`import { Logger, NULL_LOGGER } from '@europa/networking'`) continue to resolve unchanged.

## Migration Contract (host-config backward compat)

`packages/console/scripts/host-config.ts` re-exports `sanitizeLogText` from `@europa/logging`. Existing import paths continue to resolve unchanged.
