# Quickstart: Structured Logging (Feature 020)

## Prerequisites

- Node.js ≥ 22
- pnpm (workspace package manager)
- `pnpm install` from repo root

## Build

```bash
# From repo root
pnpm --filter @europa/logging build

# Or build all packages
pnpm build
```

## Test

```bash
# From repo root
pnpm --filter @europa/logging test

# With coverage
pnpm --filter @europa/logging coverage

# Full verification (all packages)
pnpm verify
```

## Manual Validation

### 1. JSON output (default)

```bash
# Set LOG_LEVEL and run host script
LOG_LEVEL=debug LOG_FORMAT=json pnpm host --create
```

Expected: structured JSON lines in stdout/stderr with timestamps, levels, and context fields.

### 2. Pretty output (TTY)

```bash
LOG_FORMAT=pretty pnpm host --create
```

Expected: human-readable lines like:
```
[2026-09-06T14:30:00.123Z] INFO   Match server listening on ws://0.0.0.0:8080
[2026-09-06T14:30:00.456Z] INFO   Created match m-abc-123 (2 players, 32 board)
```

### 3. Level filtering

```bash
LOG_LEVEL=warn pnpm host --create
```

Expected: only warn/error lines appear; info/debug lines are silently dropped.

### 4. sanitizeLogText

```typescript
import { sanitizeLogText } from '@europa/logging';

sanitizeLogText('user\r\ninjected\nhandle');  // "user   injected handle"
sanitizeLogText('a'.repeat(300));              // truncated to 200 chars + ellipsis
```

### 5. NULL_LOGGER

```typescript
import { NULL_LOGGER } from '@europa/logging';

NULL_LOGGER.info('this produces no output');
```

## Re-export Verification

```bash
# Verify networking re-exports work
node -e "
  const m = await import('@europa/networking');
  console.log(typeof m.Logger);        // 'undefined' (type-only)
  console.log(typeof m.NULL_LOGGER);   // 'object'
  console.log(typeof m.NULL_LOGGER.info); // 'function'
"
```

## Coverage Thresholds

All metrics ≥ 80%:
- Statements
- Branches
- Functions
- Lines

Enforced by `vitest.config.ts` thresholds.
