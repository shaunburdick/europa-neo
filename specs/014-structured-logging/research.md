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

**Level filtering**: `LEVEL_ORDER` array `['debug', 'info', 'warn', 'error']` mapped to numeric indices via `LEVEL_INDEX`. A logger with level `warn` (index 2) drops `debug` (0) and `info` (1) calls. (Earlier drafts of this doc called the array `LEVELS`; the implementation name is `LEVEL_ORDER`.)

**Env var handling**:
- `LOG_LEVEL`: parsed at `createLogger()` time, default `"info"`, invalid values default to `"info"` with one stderr warning
- `LOG_FORMAT`: parsed at `createLogger()` time, default `"json"`, invalid values default to `"json"` with one stderr warning
- Both warnings pass the raw env value through `sanitizeLogText()` before interpolation (v1.2) — bounded, no raw newline/ANSI/bidi

**Reserved field stripping**: Context fields named `timestamp`, `level`, or `message` are stripped — they never appear in the context subkey. The logger's structural fields always occupy their fixed positions.

## Reference: sanitizeLogText()

The function is moved from `packages/console/scripts/host-config.ts` (line 79) to `@europa/logging`. Behavior (expanded in v1.2):
- Control characters (`\p{Cc}`) replaced with spaces
- Format characters (`\p{Cf}`) replaced with spaces — includes bidi isolates (U+202A–U+202E, U+2066–U+2069), soft hyphen (U+00AD), word joiner (U+2060)
- Line/paragraph separators (`\p{Zl}` = U+2028, `\p{Zp}` = U+2029) replaced with spaces — neither control nor format characters, but treated as line terminators by every log viewer/terminal, so a smuggled separator forges a log line like `\n` (v1.2)
- Trimmed
- Truncated to `maxLength` (default 200) with ellipsis

Final regex: `/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu`. This is a pure function with no dependencies — ideal for extraction.

## Reference: Fail-soft JSON.stringify (v1.1)

`JSON.stringify` throws on cyclic references, BigInt values, and objects whose `toJSON()` throws. The logger wraps the serialization in a try/catch — on failure, context falls back to `context: {}` in JSON mode (the key's presence distinguishes "serialization failed" from "caller passed no context"); pretty mode never calls `JSON.stringify`, so an unreadable context there renders with no braces. One diagnostic warning is emitted to stderr on the first failure per logger instance. The log line is always written regardless of serialization outcome.

## Reference: Pretty-mode sanitization (v1.1)

In pretty mode, the logger applies `sanitizeLogText()` to the message string and all string-valued context fields before interpolation. This prevents:
- **Log forging**: injected `\n` or `\r\n` creating fake log entries
- **Terminal escape injection**: ESC sequences (e.g., `\x1b[31m` for red text) or CSI sequences
- **Bidi spoofing**: bidi override characters (U+202E) reordering displayed text

JSON mode is machine-parseable and does not need this treatment — callers are responsible for ensuring context values are safe for structured consumption.

## Reference: Fail-soft hardening (v1.2)

Beyond `JSON.stringify` failures (v1.1), every remaining escape path is closed so `logger.*()` never throws at its caller:
- **Hostile coercions**: message/context values with throwing `toString()`/`valueOf()`/`Symbol.toPrimitive` render as `[unprintable message]` / `[unprintable]` (guarded `String()` coercion).
- **Throwing getters/proxy traps** on the context object: the copy is abandoned (partial copies discarded) → `context: {}` in JSON mode, no braces in pretty mode.
- **Throwing writers**: wrapped once at creation and invoked through a swallow-everything helper — including startup diagnostics; no fallback diagnostic is attempted (reporting through the fallible channel could throw again).
- **Last-resort guard**: the whole write body sits in a final try/catch so unforeseen failures degrade instead of propagating. Severity filtering runs first, so dropped messages never touch the caller's object.

Env diagnostics (`unknown LOG_LEVEL "..."`) run the raw value through `sanitizeLogText()` before interpolation — bounded, no raw newline/ANSI/bidi.
