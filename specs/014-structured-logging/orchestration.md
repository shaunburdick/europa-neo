# Orchestration Log: EUR-137 — Logging Fail-Soft & Sanitize

## Status
- **Current Wave**: 6A
- **Branch**: issue-EUR-137-quick-pangolin
- **Last Updated**: 2026-09-17

## Plan Summary

Bug fix in `@europa/logging` (spec 014, v1.1). Three issues: (1) JSON.stringify throws on bad context — wrap in try/catch, (2) pretty mode interpolates raw strings — apply sanitizeLogText, (3) LogContext exported but unused / writer type divergence — reconcile types. Spec amended, Wave 6 tasks defined (T-021–T-030). 7 active tasks, 3 no-ops already verified.

## Task Wave Progress

### Wave 6A — Sanitize regex extension — ⏳ Pending
- [ ] T-021: Extend sanitizeLogText regex to strip \p{Cf} chars

### Wave 6B — Logger hardening (sequential) — ⏳ Pending
- [ ] T-022: Fail-soft JSON.stringify wrapper in logger.ts
- [ ] T-023: Apply sanitizeLogText in pretty mode
- [x] T-024: LogContext compatibility — NO-OP (already correct)
- [x] T-025: Simplify LogContext — NO-OP (already correct, types.ts doesn't exist)
- [x] T-026: Writer return types — NO-OP (already void)

### Wave 6C — Test additions (parallel) — ⏳ Pending
- [ ] T-027: sanitize.test.ts \p{Cf} tests
- [ ] T-028: logger.test.ts fail-soft + sanitization tests

### Wave 6D — Verification — ⏳ Pending
- [ ] T-029: pnpm --filter @europa/logging test
- [ ] T-030: pnpm verify

## Decisions & Rationale
- 2026-09-17: Chose \p{Cf} stripping (all format chars) over narrower bidi-only — broadest safety, negligible perf cost
- 2026-09-17: Writer return type = void (spec changed to match impl) — simpler, fire-and-forget logger
- 2026-09-17: LogContext kept as convenience type, compatible with Logger.ctx via structural typing
- 2026-09-17: stringifyFailed flag scoped to factory (per-instance, not per-call)

## Blockers & Escalations
- None

## New Tasks Discovered
- None

## Review Findings
- Pending (code review before PR)

## Verification
- **Last gate result**: N/A — no verification yet
- **Failure classification**: none
- **Linked reports**: none

## Budget
- **Token limit**: 250,000 input tokens
- **Investigation limit**: 20 minutes
- **Tokens consumed this wave**: 0
- **Time elapsed this wave**: 0
- **Status**: within-budget

## Next Action
Dispatch T-021 (Wave 6A) to modern-architect-engineer — extend sanitize.ts regex
