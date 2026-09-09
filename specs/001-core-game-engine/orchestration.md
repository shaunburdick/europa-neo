# Orchestration Log: Equal-Split Pipe Flow (issue #50)

## Status
- **Current Wave**: Complete
- **Branch**: `issue-50-percentage-based-flow`
- **Last Updated**: 2026-09-09

## Plan Summary
Cross-package behavioral change to the flow formula: replace fixed-rate flow (`flowBase=7`) with equal-split model (`flowRate=12` budget split equally among outgoing pipes). Affects `@europa/core` (source of truth), `@europa/engine` (flow resolution), `@europa/terrain` (viability check), `@europa/console` (rendering mirror). 33 tasks across 10 waves.

## Task Wave Progress

### Wave 1 — Core formula (`@europa/core`) — ✅ Complete
- [x] T-001: Refactor `FlowConstants` interface
- [x] T-002: Refactor `flowRateForDelta` signature
- [x] T-003: Add `resolveFlowAmount` function

### Wave 2 — Engine flow resolution — ✅ Complete
- [x] T-004: Update `resolveFlow`
- [x] T-005: Update `transfer()`

### Wave 3 — Engine tests — ✅ Complete
- [x] T-006–T-012

### Wave 4 — Engine test constants [P] — ✅ Complete
- [x] T-013, T-014, T-015

### Wave 5 — Console mirror [P] — ✅ Complete
- [x] T-016–T-020

### Wave 6 — Console tests — ✅ Complete
- [x] T-021, T-022

### Wave 7 — Terrain [P] — ✅ Complete
- [x] T-023, T-024

### Wave 8 — Contracts [P] — ✅ Complete
- [x] T-025, T-026

### Wave 9 — Design tokens [P] — ✅ Complete
- [x] T-027

### Wave 10 — Final verification — ✅ Complete
- [x] T-028–T-033

## Decisions & Rationale
- 2026-09-09: `flowRate=12` chosen as total outflow budget; empirical analysis shows 93.6% edge viability with 1-pipe assumption (Δ<12), 87.5% of edges have Δ<10. Old Δ≥80 threshold was unreachable (max Δ=29 after smoothing).
- 2026-09-09: `flowUphillCap` removed; stall threshold now computed as `perPipe / flowUphillStep`.

## Blockers & Escalations
- None

## New Tasks Discovered
- None
