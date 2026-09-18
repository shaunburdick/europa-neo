# Feature 020: Structured Logging for Server Processes

> Version: 1.1
> Last Updated: 2026-09-17
**Status**: Implemented (2026-09-17) — bug fix for F-LOG-001/002/005 (EUR-137)
> Dependencies: None

## Problem Statement

Server-side processes (the host launcher, matchmaking, networking, and engine orchestration) use raw `process.stdout.write`/`process.stderr.write` via `say()`/`complain()` helpers — unstructured text lines with no log levels, no timestamps, no machine-parseable context. This makes production debugging difficult: there is no way to filter logs by severity, correlate events across subsystems, or pipe structured output to log aggregators. The host script (`packages/console/scripts/host.ts`, 689 lines) has ~18 `complain()` calls for CLI validation and runtime errors, plus ~10 `say()` calls for informational output — all plain text. The networking and matchmaking packages accept a `Logger` interface but default to `NULL_LOGGER` (a no-op), so structured diagnostics are silently swallowed in production.

## User Stories

- As a **self-hoster**, I want **structured JSON log lines with timestamps and severity levels** so that I can filter and search my server logs effectively when debugging match issues.
- As a **developer**, I want **a single logger implementation shared across all server packages** so that log behavior is consistent and I don't maintain duplicate `NULL_LOGGER` copies.
- As a **developer debugging locally**, I want **human-readable pretty-printed logs when my terminal is a TTY** so that I can read logs comfortably during development.
- As a **matchmaker operator**, I want **typed context fields (match ID, player ID, tick number) in log lines** so that I can correlate log entries to specific game events without regex.

## Functional Requirements

- **FR-001**: Create a new `@europa/logging` private workspace package containing the `Logger` interface, `NULL_LOGGER`, `createLogger()` factory, and `sanitizeLogText()` utility. The package follows the same workspace pattern as `@europa/version` (zero external dependencies, tsup build, private, `type: "module"`).
- **FR-002**: The `Logger` interface has four methods: `debug(msg, ctx?)`, `info(msg, ctx?)`, `warn(msg, ctx?)`, `error(msg, ctx?)` — each accepting a string message and an optional context object of type `Readonly<Record<string, unknown>>` (callers may pass a `LogContext`-typed object or an ad-hoc record — they are structurally compatible). This is the same shape as the existing interface in `packages/networking/src/contracts/network-api.ts` (lines 592-597).
- **FR-003**: `createLogger(opts?)` returns a `Logger` implementation that writes one JSON line per call to `process.stdout` (debug/info) or `process.stderr` (warn/error). Each line is a single JSON object: `{ "timestamp": "<ISO-8601>", "level": "<debug|info|warn|error>", "message": "<string>", "context": { ...<context fields> } }`. The `context` key is omitted entirely when no context fields are provided. The `timestamp` field uses `new Date().toISOString()`.
- **FR-004**: `createLogger()` reads `LOG_LEVEL` from `process.env` (default `"info"`). Messages below the configured level are silently dropped (not serialized). Level hierarchy: `debug < info < warn < error`.
- **FR-005**: `createLogger()` reads `LOG_FORMAT` from `process.env` (default `"json"`). When `LOG_FORMAT === "pretty"`, output is human-readable: `[2026-09-06T12:00:00.000Z] INFO  match started { matchId: "abc" }`. Pretty mode is intended for TTY use; JSON mode for PM2/production.
- **FR-006**: The `Logger` interface and `NULL_LOGGER` constant are migrated from `packages/networking/src/contracts/network-api.ts` to `@europa/logging`. The networking package re-exports them from its public API for backward compatibility — existing consumers (`@europa/matchmaking`, `@europa/console` scripts, tests) continue to work without import changes.
- **FR-007**: Consolidate the 3 duplicate `NULL_LOGGER` definitions: `packages/networking/src/contracts/network-api.ts` (canonical), `packages/matchmaking/src/internal/lobbyService.ts` (line 180), and `packages/matchmaking/src/matchmaker.ts` (line 158). All three import from `@europa/logging` (or `@europa/networking`'s re-export).
- **FR-008**: Move `sanitizeLogText()` from `packages/console/scripts/host-config.ts` into `@europa/logging` as a named export. The host-config.ts file re-exports it for backward compatibility. The function retains its current behavior — control characters (`\p{Cc}`) and format characters (`\p{Cf}`, including bidi isolates U+202A–U+202E, U+2066–U+2069, soft hyphen, etc.) replaced with spaces, trimmed, truncated to a configurable `maxLength` (default 200). In pretty mode, the logger applies `sanitizeLogText` to the message and all string context values before interpolation, preventing log forging and terminal escape injection.
- **FR-009**: The host launcher (`packages/console/scripts/host.ts`) is updated to use the structured logger for all `say()` and `complain()` call sites. `say()` calls become `logger.info(...)` and `complain()` calls become `logger.error(...)` (for fatal errors) or `logger.warn(...)` (for validation warnings). The host script's `buildStack()` wires the logger into `ServerDeps.logger` and `MatchmakerDeps.logger`.
- **FR-010**: Context fields are typed via an exported `LogContext` type from `@europa/logging`: `{ [key: string]: unknown }`. The `LogContext` type is structurally identical to `Record<string, unknown>` — callers may use `LogContext` to type context objects passed to Logger methods, or pass ad-hoc records. The logger spreads context fields into JSON output or pretty-print inline.
- **FR-011**: The package exports `createLogger`, `NULL_LOGGER`, `sanitizeLogText`, `Logger`, and `LogContext` from its public barrel (`src/index.ts`). The package has zero external dependencies — only Node.js builtins (`process.stdout`, `process.stderr`, `Date`).

## Non-Functional Requirements

- **Performance**: Log calls must not introduce measurable overhead. A single `logger.info()` call must complete in < 0.01ms (essentially a `JSON.stringify` + `process.stdout.write`). No async operations, no buffering, no event emitters.
- **Security**: `sanitizeLogText()` strips both control characters (`\p{Cc}`) and format characters (`\p{Cf}`, including bidi isolates) from user-derived strings before they appear in log output. In pretty mode, the logger applies `sanitizeLogText` to the message and all string context values before interpolation — preventing log forging (smuggled newlines) and terminal escape injection (ESC sequences, bidi overrides). Structured context fields that could leak sensitive data (session tokens, reconnect tokens) are never logged — this is enforced by the privacy boundary in spec 010 NFR-003/FR-024. The logger itself does not perform caller-level sanitization beyond the pretty-mode interpolation; callers are responsible for what they pass as context.
- **Compatibility**: The logger works in Node.js ≥ 22 (the project's engine requirement). It does not work in browser environments (uses `process.stdout.write`); this is acceptable because client-side logging is out of scope.
- **PM2 integration**: When run under PM2, JSON log lines are written to PM2's log files (`~/.pm2/logs/`) without any additional configuration or shipping. PM2 captures stdout/stderr natively.
- **Zero dependencies**: `@europa/logging` has no npm dependencies. The logger implementation uses only `process.stdout.write`, `process.stderr.write`, `JSON.stringify` (with try/catch for fail-soft serialization), and `Date`.

## Acceptance Criteria

- [ ] **AC-001**: `@europa/logging` package exists with `package.json` (private, `type: "module"`, zero deps), `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, and `src/index.ts` barrel.
- [ ] **AC-002**: `createLogger()` produces JSON lines with `timestamp`, `level`, `message`, and any context fields when `LOG_FORMAT=json`.
- [ ] **AC-003**: `createLogger()` produces human-readable lines when `LOG_FORMAT=pretty` (format: `[<timestamp>] <LEVEL>  <message> {<ctx>}`).
- [ ] **AC-004**: Messages below `LOG_LEVEL` are silently dropped (e.g., when `LOG_LEVEL=warn`, `debug` and `info` calls produce no output).
- [ ] **AC-005**: `NULL_LOGGER` is a no-op — calling any method produces no output and no side effects.
- [ ] **AC-006**: `sanitizeLogText()` behaves identically to the current implementation in `host-config.ts` (control char replacement, trimming, truncation).
- [ ] **AC-007**: The networking package re-exports `Logger`, `NULL_LOGGER` from `@europa/logging` — existing import paths (`@europa/networking`) continue to resolve.
- [ ] **AC-008**: The matchmaking package's two local `NULL_LOGGER` definitions are replaced with imports from `@europa/logging` (or `@europa/networking`).
- [ ] **AC-009**: The host launcher uses `createLogger()` for all output — zero remaining `say()`/`complain()` calls (replaced with `logger.info`/`logger.error`/`logger.warn`).
- [ ] **AC-010**: Test coverage ≥ 80% on all metrics (statements, branches, functions, lines) for `@europa/logging`.
- [ ] **AC-011**: A test verifies that `logger.info()` writes to stdout with correct JSON structure.
- [ ] **AC-012**: A test verifies that `logger.error()` writes to stderr with correct JSON structure.
- [ ] **AC-013**: A test verifies log-level filtering (message below threshold produces no output).
- [ ] **AC-014**: A test verifies pretty-print format matches the expected human-readable pattern.
- [ ] **AC-015**: `pnpm verify` passes across all packages (no regressions from the interface migration).
- [ ] **AC-016**: A test verifies that `JSON.stringify` failure on cyclic context values does not throw — the logger produces a valid log line with fallback context `{}` (or no context in pretty mode). [F-LOG-001]
- [ ] **AC-017**: A test verifies that `JSON.stringify` failure on BigInt context values does not throw — the logger produces a valid log line with fallback context. [F-LOG-001]
- [ ] **AC-018**: A test verifies that `JSON.stringify` failure on a context value whose `toJSON()` throws does not throw — the logger produces a valid log line with fallback context. [F-LOG-001]
- [ ] **AC-019**: A test verifies that in pretty mode, a message containing `\n` (newline) or `\x1b[31m` (ANSI escape) is sanitized — output contains no raw newlines or escape sequences. [F-LOG-002]
- [ ] **AC-020**: A test verifies that in pretty mode, a string context value containing `\r\n` (CRLF) or bidi overrides (U+202E) is sanitized — output contains no raw control or format characters. [F-LOG-002]
- [ ] **AC-021**: A test verifies that `sanitizeLogText` strips `\p{Cf}` characters (bidi isolates, soft hyphen, word joiner) in addition to `\p{Cc}` control characters. [F-LOG-002]
- [ ] **AC-022**: The `Logger` interface `ctx` parameter type is `Readonly<Record<string, unknown>>` — callers may pass `LogContext`-typed objects without type errors. [F-LOG-005]

## Out of Scope

The following are explicitly **not** part of this feature:

- **Log shipping / aggregation** — no Fluentd, Logstash, OpenTelemetry, or remote log endpoints. JSON output is sufficient for PM2 and manual `jq` filtering.
- **Client-side logging** — the console package's `ConsoleLogger` interface and browser runtime are untouched.
- **HTTP request/response logging middleware** — no access logs, no request tracing.
- **Log rotation** — PM2 handles rotation; the logger does not.
- **Log sampling or rate limiting** — every call produces output (subject to level filtering only).
- **Async or buffered logging** — all writes are synchronous `process.stdout.write` / `process.stderr.write`.

## Edge Cases

- **Environment variables missing**: When `LOG_LEVEL` and `LOG_FORMAT` are unset, defaults apply (`info`, `json`). No warnings are emitted.
- **Invalid `LOG_LEVEL` value**: When `LOG_LEVEL` contains an unrecognized string (e.g., `"verbose"`), treat it as `"info"` (the default) and emit one warning to stderr at startup: `unknown LOG_LEVEL "verbose", defaulting to "info"`.
- **Invalid `LOG_FORMAT` value**: When `LOG_FORMAT` is neither `"json"` nor `"pretty"`, default to `"json"` and emit one warning to stderr at startup.
- **Context field named `timestamp`, `level`, or `message`**: Context fields with reserved names are stripped — reserved fields never appear in the context subkey. No error.
- **Empty message**: `logger.info("")` produces a JSON line with `"message": ""`. No validation or rejection.
- **Large context objects**: Context objects with deeply nested values are serialized via `JSON.stringify` without depth limiting. The caller is responsible for passing serializable values.
- **Cyclic / BigInt / throwing-toJSON context values (v1.1)**: When `JSON.stringify` throws (e.g., cyclic references, BigInt values, or a context value whose `toJSON()` throws), the logger catches the exception and falls back to `{}` for the context key in JSON mode, or omits context in pretty mode. The log line is still written — serialization failure never prevents the log call from producing output. A single diagnostic warning is emitted to stderr on the first such failure per logger instance (not per call, to avoid flood).
- **Log forging in pretty mode (v1.1)**: The pretty-print path applies `sanitizeLogText()` to the message string and all string-valued context fields before interpolation. This prevents injected newlines (log forging) and terminal escape sequences (ESC, CSI, bidi overrides) from reaching the output unescaped.
- **Format characters in pretty mode (v1.1)**: `sanitizeLogText()` strips `\p{Cf}` characters — including bidi isolates (U+202A–U+202E, U+2066–U+2069), soft hyphen (U+00AD), word joiner (U+2060), and other format characters — replacing them with spaces. This prevents visual spoofing via bidi text reordering in terminal output.
- **LogContext unused export (v1.1)**: The `LogContext` type is now structurally identical to `Record<string, unknown>` and may be used by callers to type context objects passed to Logger methods. It is exported for developer ergonomics — callers may import it or pass ad-hoc objects.
- **`process.stdout` / `process.stderr` not writable** (e.g., pipe closed): The write call returns `false` (backpressure). The logger does not retry or throw; it is a fire-and-forget implementation.
- **Non-string `msg` argument**: The TypeScript signature enforces `msg: string`. At runtime, if a non-string is passed, it is coerced via `String(msg)`. No runtime type check.

## Examples

### JSON output (LOG_FORMAT=json, default)

```json
{"timestamp":"2026-09-06T14:30:00.123Z","level":"info","message":"match started","context":{"matchId":"m-abc-123","playerCount":2}}
{"timestamp":"2026-09-06T14:30:00.456Z","level":"debug","message":"tick completed","context":{"matchId":"m-abc-123","tick":42,"durationMs":0.08}}
{"timestamp":"2026-09-06T14:30:01.789Z","level":"warn","message":"seat fill failed","context":{"matchId":"m-abc-123","error":"match full"}}
{"timestamp":"2026-09-06T14:30:02.012Z","level":"error","message":"server failed to start","context":{"port":8080,"error":"EADDRINUSE"}}
```

### Pretty output (LOG_FORMAT=pretty)

```
[2026-09-06T14:30:00.123Z] INFO   match started { matchId: "m-abc-123", playerCount: 2 }
[2026-09-06T14:30:00.456Z] DEBUG  tick completed { matchId: "m-abc-123", tick: 42, durationMs: 0.08 }
[2026-09-06T14:30:01.789Z] WARN   seat fill failed { matchId: "m-abc-123", error: "match full" }
[2026-09-06T14:30:02.012Z] ERROR  server failed to start { port: 8080, error: "EADDRINUSE" }
```

### Logger creation and usage

```typescript
import { createLogger } from '@europa/logging';

const logger = createLogger(); // reads LOG_LEVEL, LOG_FORMAT from env

logger.info('match started', { matchId: 'm-abc-123', playerCount: 2 });
logger.debug('tick completed', { matchId: 'm-abc-123', tick: 42 });
logger.warn('seat fill failed', { matchId: 'm-abc-123', error: 'match full' });
logger.error('server failed to start', { port: 8080, error: 'EADDRINUSE' });
```

### sanitizeLogText usage (expanded in v1.1)

```typescript
import { sanitizeLogText } from '@europa/logging';

sanitizeLogText('user\r\ninjected\nhandle');  // "user   injected handle"
sanitizeLogText('a'.repeat(300));              // "aaa…aaa…" (truncated to 200 + ellipsis)
sanitizeLogText('left\u202Erighthanded');      // "left righthanded" (bidi override stripped)
sanitizeLogText('soft\u00ADhyphen');           // "soft hyphen" (soft hyphen stripped)
```

### NULL_LOGGER (no-op, for tests)

```typescript
import { NULL_LOGGER } from '@europa/networking'; // re-exported from @europa/logging

createMatchServer({ ..., logger: NULL_LOGGER }); // no output
```

## Open Questions

> None. All ambiguities resolved in Clarifications below.

## Clarifications Applied

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | Should `@europa/logging` depend on `@europa/networking` for the `Logger` interface? | No. The interface is defined in `@europa/logging`; networking re-exports it. This avoids a circular dependency and follows the `@europa/version` precedent (zero deps). | FR-002, FR-011 |
| 2 | What happens when `LOG_LEVEL` is set to an invalid value? | Default to `"info"` and emit one stderr warning at logger creation time. No crash. | Edge case: invalid LOG_LEVEL |
| 3 | Should the logger buffer writes or emit synchronously? | Synchronous fire-and-forget. `process.stdout.write()` / `process.stderr.write()` calls return immediately. No buffering, no async, no event emitters. | NFR: Performance |
| 4 | Does the pretty-print format include the context object? | Yes. Format: `[<timestamp>] <LEVEL_PAD8>  <message> {<ctx>}` where ctx is a single-line JSON object of context fields (excluding timestamp/level/message). | FR-005, Examples |
| 5 | Should `sanitizeLogText()` be part of `@europa/logging` or stay in `host-config.ts`? | Move to `@europa/logging` as a named export. host-config.ts re-exports it for backward compatibility. This makes the sanitization utility available to any package that logs user-derived strings. | FR-008 |
| 6 | How should the logger handle `JSON.stringify` failures on context values (cyclic, BigInt, throwing toJSON)? | Fail-soft: catch the exception, fall back to `{}` for context in JSON mode or omit context in pretty mode. Emit one diagnostic warning to stderr on first failure per logger instance. Never prevent the log call from producing output. | Edge case: cyclic/BigInt/throwing-toJSON, AC-016/017/018 |
| 7 | Should pretty-mode interpolation sanitize message and string context values? | Yes. Apply `sanitizeLogText()` to the message and all string-valued context fields before interpolation in pretty mode. Prevents log forging and terminal escape injection. | FR-008, NFR: Security, AC-019/020 |
| 8 | Should `sanitizeLogText` strip format characters (`\p{Cf}`) in addition to control characters (`\p{Cc}`)? | Yes. Extend the regex to strip all `\p{Cf}` characters — includes bidi isolates, soft hyphen, word joiner, and other format characters that can cause visual spoofing in terminals. | FR-008, AC-021 |
| 9 | What is the correct return type for writer functions in `createLogger` options? | `void` — the implementation is fire-and-forget; `process.stdout.write` return value is ignored. Spec contracts updated to match implementation. | contracts/api.md |
| 10 | How should `LogContext` relate to the `Logger` interface? | `LogContext` is a convenience type alias (`{ [key: string]: unknown }`), structurally identical to `Record<string, unknown>`. Callers may use it or pass ad-hoc objects. The Logger interface accepts `Readonly<Record<string, unknown>>` which is compatible with both. | FR-002, FR-010, data-model.md |
