# Orchestration Log: Lobby Roster (Feature 023)

## Status
- **Current Wave**: Wave 1 (Wire Types)
- **Branch**: `issue-28-lobby-roster`
- **Last Updated**: 2026-09-08

## Plan Summary
Server-authoritative presence roster showing all active players with handle + status (`in_lobby`, `in_game`, `spectating`). Additive wire variants over existing lobbyEvent frame. Anti-flap grace period. Deterministic handle ordering. Console roster card in lobby.

## Task Wave Progress

### Wave 1 — Wire Types (Phase 1) — 🔄 In Progress
- T001 [P] Add roster types to networking contract — ⏳
- T002 [P] Mirror roster types to matchmaking contract — ⏳
- T003 [P] Add roster type exports — ⏳

### Wave 2 — Server Logic (Phase 2) — ⏳ Pending
- T004–T016

### Wave 3 — Server Tests (Phase 3) — ⏳ Pending
- T017–T024

### Wave 4 — Console Transport + State (Phases 4–5) — ⏳ Pending
- T025–T037

### Wave 5 — Console UI + Tests (Phases 6–7) — ⏳ Pending
- T038–T048

### Wave 6 — Conformance + Docs + Polish (Phases 8–10) — ⏳ Pending
- T049–T059

## Decisions & Rationale
- 2026-09-08: Spec created with zero privacy enforcement machinery per product-owner direction

## Blockers & Escalations
(none)

## New Tasks Discovered
(none)

## Review Findings
(none yet)
