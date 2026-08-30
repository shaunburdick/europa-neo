# PM Handoff: 012 3–4 Player Support

## Feature summary
End-to-end N-player support (N=2|3|4): matchmaking defaults, lobby chrome, waiting overlay, host CLI, E2E harness, manual updates. No wire bump. Single-port host topology only.

## Branch
`issue-6-3+4-player-matches` (worktree at `issue-6-3-4-player-matches`)

## Artifacts
- spec: `specs/012-3-4-player-support/spec.md` v1.0 Draft zero clarifications (14 FRs, 9 SCs)
- plan: `specs/012-3-4-player-support/plan.md`
- research: `specs/012-3-4-player-support/research.md`
- data-model: `specs/012-3-4-player-support/data-model.md`
- contracts: `specs/012-3-4-player-support/contracts/{board-size-defaults.ts,host-config.ts,waiting-copy.ts,README.md}`
- tasks: `specs/012-3-4-player-support/tasks.md` (32 tasks T001-T032, 8 phases)
- quickstart: `specs/012-3-4-player-support/quickstart.md`
- constitution: `.specify/memory/constitution.md`
- AGENTS.md: repo root (binding decisions 5/6, single-port, self-hostable)

## Key decisions (for implementers)
- `BOARD_SIZE_DEFAULTS={2:32,3:48,4:48}` single source in `@europa/matchmaking` (`packages/matchmaking/src/constants.ts` + `contracts/match-types.ts`), frozen Record. Keep `DEFAULT_MATCH_SETTINGS.boardSize=32`.
- Capacity source for chrome/waiting: derive from `PublicLobbyEntry` (`capacity/seatsFilled/boardSize`) via `lobby-labels.ts` / `formatWaitingMessage` — no new tick field.
- Waiting copy: pure `formatWaitingMessage(k,N)` with singular/plural, `isAwaitingMatchStart` predicate unchanged.
- Host: additive `NPlayerHostConfig extends HostConfig` with `--players/--player-count`/`HOST_PLAYER_COUNT` → playerCount, `--board-size/--boardSize`/`HOST_BOARD_SIZE` → boardSize, absent boardSize implies `BOARD_SIZE_DEFAULTS[N]`, validated pre-bind, single http.Server only, reject HOST_STATIC_PORT/--static-port.
- Harness: one `full-stack-n-players.spec.ts` `describe.each([3,4])` sharing `buildStack(port:0 + __boundPortForTest())` recipe, deterministic polls, odd citiesPerPlayer seed for 3p.
- Manual `docs/manual/*.md` must be updated in same change sets (007 FR-012); docs-privacy + version:check stay green.
- No `any` / suppressions, TS strict, ≥80% coverage on touched packages.

## Scope / gates
- Phase 6 large → PM-driven orchestration (orchestration skill). Waves defined in `orchestration.md`.
- PR gate: tasks checkboxes + spec Implemented + conformance (no wire bump) + 2p regression (SC-006).

## Resume info
- Current wave: Wave 1 not yet started (fresh). See `orchestration.md` for wave progress after start.
- If resuming via standalone orchestrator: read this file + `orchestration.md` + `tasks.md` + `plan.md`.
