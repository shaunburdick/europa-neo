# Research: Structured Logging Technology Choices

## Decision: Zero-dependency JSON logger using Node.js builtins

### Chosen approach

`@europa/logging` uses only `process.stdout.write`, `process.stderr.write`, `JSON.stringify`, and `Date`. No npm dependencies.

### Alternatives considered

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| **pino** | Fast, widely used, PM2 integration | External dependency; violates zero-dep constraint (FR-011); adds ~200KB to dep tree | Rejected |
| **winston** | Feature-rich, transports | Heavy dependency; async buffering adds complexity; overkill for structured JSON lines | Rejected |
| **console + custom formatter** | Zero deps, simple | `console.log` goes to stdout but adds colors/timestamps in Node; no level filtering without wrapper | Rejected — use raw process.stdout.write for full control |
| **process.stdout.write + JSON.stringify** | Zero deps, synchronous, < 0.01ms, PM2-compatible | Must handle our own formatting | **Chosen** |

### Rationale

The project's constitution demands simplicity (Principle V), zero unnecessary dependencies (Principle VII self-hostable), and the spec explicitly requires zero external deps (FR-011). A structured JSON logger that calls `JSON.stringify` + `process.stdout.write` is trivially simple, trivially testable, and produces output that PM2 captures natively without any configuration.

### Implementation details

**JSON format** (default):
```json
{"timestamp":"2026-09-06T14:30:00.123Z","level":"info","message":"match started","context":{"matchId":"m-abc-123"}}
```

**Pretty format** (TTY):
```
[2026-09-06T14:30:00.123Z] INFO   match started { matchId: "m-abc-123" }
```

**Level filtering**: `LEVELS` array `['debug', 'info', 'warn', 'error']` with numeric indices. A logger with level `warn` (index 2) drops `debug` (0) and `info` (1) calls.

**Env var handling**:
- `LOG_LEVEL`: parsed at `createLogger()` time, default `"info"`, invalid values default to `"info"` with one stderr warning
- `LOG_FORMAT`: parsed at `createLogger()` time, default `"json"`, invalid values default to `"json"` with one stderr warning

**Reserved field stripping**: Context fields named `timestamp`, `level`, or `message` are stripped — they never appear in the context subkey. The logger's structural fields always occupy their fixed positions.

## Reference: sanitizeLogText()

The function is moved from `packages/console/scripts/host-config.ts` (line 79) to `@europa/logging`. Behavior (expanded in v1.1):
- Control characters (`\p{Cc}`) replaced with spaces
- Format characters (`\p{Cf}`) replaced with spaces — includes bidi isolates (U+202A–U+202E, U+2066–U+2069), soft hyphen (U+00AD), word joiner (U+2060)
- Trimmed
- Truncated to `maxLength` (default 200) with ellipsis

This is a pure function with no dependencies — ideal for extraction.

## Reference: Fail-soft JSON.stringify (v1.1)

`JSON.stringify` throws on cyclic references, BigInt values, and objects whose `toJSON()` throws. The logger wraps the serialization in a try/catch — on failure, context falls back to `{}` (JSON mode) or is omitted (pretty mode). One diagnostic warning is emitted to stderr on the first failure per logger instance. The log line is always written regardless of serialization outcome.

## Reference: Pretty-mode sanitization (v1.1)

In pretty mode, the logger applies `sanitizeLogText()` to the message string and all string-valued context fields before interpolation. This prevents:
- **Log forging**: injected `\n` or `\r\n` creating fake log entries
- **Terminal escape injection**: ESC sequences (e.g., `\x1b[31m` for red text) or CSI sequences
- **Bidi spoofing**: bidi override characters (U+202E) reordering displayed text

JSON mode is machine-parseable and does not need this treatment — callers are responsible for ensuring context values are safe for structured consumption.
