# Plan: Structured Logging for Server Processes (Feature 020)

## Technical Context

Server-side processes use raw `process.stdout.write`/`process.stderr.write` via `say()`/`complain()` helpers — unstructured text with no log levels, timestamps, or machine-parseable context. The networking and matchmaking packages accept a `Logger` interface but default to `NULL_LOGGER` (a no-op), so structured diagnostics are silently swallowed in production. Three duplicate `NULL_LOGGER` definitions exist across the codebase.

**Goal**: Create `@europa/logging` — a zero-dependency private workspace package providing a structured JSON logger, the canonical `Logger` interface, `NULL_LOGGER`, and `sanitizeLogText()`.

## Constitution Alignment

| Principle | Alignment |
|-----------|-----------|
| **I. Type Safety** | `Logger` interface enforced via TypeScript types; no `any`; context is `Record<string, unknown>` |
| **III. Tested Game Logic** | 80% coverage gate on `@europa/logging` (statement/branch/function/line) |
| **IV. Specs as Documentation** | Spec 020 is the source of truth; plan maps 1:1 to FRs |
| **V. Simplicity** | ~50 lines of implementation; no buffering, no event emitters, no abstractions beyond the interface |
| **VII. Self-Hostable** | JSON output via stdout/stderr; PM2 captures it natively; zero infrastructure requirements |

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              @europa/logging                 │
│  (zero deps, Node.js builtins only)         │
│                                             │
│  ┌──────────┐  ┌────────────┐  ┌─────────┐ │
│  │ Logger   │  │createLogger│  │ NULL_   │ │
│  │ interface│  │ factory    │  │ LOGGER  │ │
│  └──────────┘  └────────────┘  └─────────┘ │
│  ┌──────────────────────────────────────┐   │
│  │ sanitizeLogText(text, maxLength?)    │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ LogContext type                      │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
           ▲                    ▲
           │ re-exports         │ re-exports
           │                    │
┌──────────┴───────┐  ┌────────┴──────────┐
│ @europa/         │  │ @europa/          │
│ networking       │  │ matchmaking       │
│ (Logger, NULL_   │  │ (NULL_LOGGER      │
│  LOGGER re-export)│  │  replaced)        │
└──────────────────┘  └───────────────────┘
           ▲
           │ imports
┌──────────┴───────────────────┐
│ packages/console/scripts/    │
│ host.ts (primary consumer)   │
│ host-config.ts (re-exports)  │
└──────────────────────────────┘
```

**Key invariant**: `@europa/logging` has ZERO dependencies — only `process.stdout`, `process.stderr`, `JSON.stringify`, and `Date`. This matches the `@europa/version` precedent and the constitution's simplicity principle.

## Key Decisions

### D1: Package at `packages/logging/` (not merged into networking)

**Rationale**: The Logger interface is consumed by networking, matchmaking, and console scripts. Placing it in networking would create an awkward dependency direction (matchmaking importing networking for a logger interface). A standalone package follows the `@europa/version` precedent: tiny, zero-dep, shared infrastructure.

### D2: Interface defined in logging, networking re-exports

**Rationale**: The Logger interface currently lives in `packages/networking/src/contracts/network-api.ts`. Rather than breaking all existing imports, `@europa/logging` owns the canonical definition and `@europa/networking` re-exports it. Existing consumers (`import { Logger, NULL_LOGGER } from '@europa/networking'`) continue to work unchanged. This satisfies FR-006 and AC-007.

### D3: `createLogger()` reads env vars at call time, not import time

**Rationale**: Reading `process.env.LOG_LEVEL` inside `createLogger()` means the logger is configured when the factory runs, not when the module is imported. This allows tests to override env vars before creating loggers, and matches the spec's edge-case handling (invalid values emit one warning at creation time).

### D4: Synchronous fire-and-forget writes

**Rationale**: Per Clarification #3 (spec), all writes are synchronous `process.stdout.write` / `process.stderr.write`. No buffering, no async, no event emitters. This keeps the implementation trivially simple and matches the NFR performance target (< 0.01ms per call). PM2 captures stdout/stderr natively.

### D5: `sanitizeLogText()` moves to logging, host-config re-exports

**Rationale**: The sanitization function is a general-purpose log-safety utility, not host-specific. Moving it to `@europa/logging` makes it available to any package that logs user-derived strings. `host-config.ts` re-exports it for backward compatibility (FR-008).

### D6: NULL_LOGGER consolidation — matchmaking imports from logging

**Rationale**: Two duplicate `NULL_LOGGER` definitions in `packages/matchmaking/src/internal/lobbyService.ts` (line 180) and `packages/matchmaking/src/matchmaker.ts` (line 158) are replaced with imports from `@europa/logging` (or `@europa/networking`'s re-export). This eliminates the three-way duplication (FR-007, AC-008).

### D7: Console package's `NULL_LOGGER` is NOT touched

**Rationale**: The console package's `NULL_LOGGER` (in `contracts/console-api.ts`) implements `ConsoleLogger`, not `Logger` — these are different interfaces. The console `ConsoleLogger` is a browser-side interface with different semantics. This is out of scope per the spec's "client-side logging untouched" exclusion.

## File Structure

```
packages/logging/
├── package.json          # private, type: "module", zero deps
├── tsconfig.json         # extends ../../tsconfig.base.json
├── tsup.config.ts        # ESM + dts, same as @europa/version
├── vitest.config.ts      # 80% coverage thresholds
├── biome.jsonc           # extends ../../biome.jsonc
├── src/
│   ├── index.ts          # public barrel
│   ├── logger.ts         # Logger interface, createLogger factory
│   ├── null-logger.ts    # NULL_LOGGER constant
│   ├── sanitize.ts       # sanitizeLogText function
│   └── types.ts          # LogContext type
└── tests/
    ├── logger.test.ts    # createLogger unit tests
    ├── null-logger.test.ts  # NULL_LOGGER no-op tests
    └── sanitize.test.ts  # sanitizeLogText tests
```

## Scope Boundaries

**In scope** (per spec):
- `@europa/logging` package creation
- Logger interface, createLogger factory, NULL_LOGGER, sanitizeLogText, LogContext type
- Networking re-exports (backward compat)
- Matchmaking NULL_LOGGER consolidation
- Host script migration to structured logger

**Out of scope** (per spec):
- Client-side logging (console ConsoleLogger untouched)
- Log shipping/aggregation
- HTTP request logging
- Log rotation, sampling, or rate limiting
- Async or buffered logging
