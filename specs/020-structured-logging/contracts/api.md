# Contracts: @europa/logging

## Public API Surface

The package exports five symbols from its barrel (`src/index.ts`):

| Export | Kind | Description |
|--------|------|-------------|
| `Logger` | type (interface) | Minimal 4-method logger interface (debug/info/warn/error) |
| `LogContext` | type (alias) | Typed context fields for structured log lines |
| `createLogger` | function | Factory returning a Logger that writes JSON or pretty lines |
| `NULL_LOGGER` | const (Logger) | No-op logger — calling any method produces no output |
| `sanitizeLogText` | function | Control-char stripping, trimming, truncation for untrusted text |

## Interface Contract: Logger

```typescript
interface Logger {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}
```

**Methods**: Each accepts a string message and an optional context object.
**Behavior**: debug/info → stdout; warn/error → stderr. Below-threshold calls are silently dropped (no serialization).
**Side effects**: Synchronous `process.stdout.write` / `process.stderr.write` only. No async, no buffering, no events.

## Factory Contract: createLogger

```typescript
function createLogger(opts?: {
  level?: string;      // override LOG_LEVEL env var
  format?: string;     // override LOG_FORMAT env var
  stdout?: (chunk: string) => boolean;  // override stdout writer
  stderr?: (chunk: string) => boolean;  // override stderr writer
}): Logger;
```

**Env var behavior**:
- `LOG_LEVEL`: default `"info"`, invalid → `"info"` + one stderr warning
- `LOG_FORMAT`: default `"json"`, invalid → `"json"` + one stderr warning

**Output format (JSON)**:
```json
{"timestamp":"<ISO-8601>","level":"<level>","message":"<msg>","context":{...<ctx>}}
```

**Output format (pretty)**:
```
[<timestamp>] <LEVEL_PAD8>  <msg> {<ctx>}
```

## Re-export Contract (networking backward compat)

`@europa/networking` re-exports `Logger` type and `NULL_LOGGER` constant from its public barrel. Existing import paths (`import { Logger, NULL_LOGGER } from '@europa/networking'`) continue to resolve unchanged.

## Migration Contract (host-config backward compat)

`packages/console/scripts/host-config.ts` re-exports `sanitizeLogText` from `@europa/logging`. Existing import paths continue to resolve unchanged.
