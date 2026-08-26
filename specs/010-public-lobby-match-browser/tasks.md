# Tasks: Public Lobby & Match Browser

Tasks are Phase 6 implementation work only. They are dependency ordered; `[P]`
means the task is safe to perform in parallel with other tasks in its block.

## Contracts and foundations

- [x] T-001: Add typed identity, public projection, error, and lobby event contracts in `packages/matchmaking/src/contracts/`, preserving branded-ID and readonly conventions; add compile-time contract witnesses.
- [x] T-002: Add the additive lobby wire message contracts to both canonical networking contract copies, document version/unknown-message behavior, and extend networking conformance fixtures without changing gameplay payloads.
- [x] T-003: [P] Add the feature-010 server API/event contract artifacts to the package barrels and verify exports with strict typecheck programs.
- [x] T-004: [P] Add focused test fixtures/builders for identities, handles, lobby snapshots, and fake matchmaker/network bridges; do not weaken existing test tsconfig policy.

## Server identity and matchmaking integration

- [x] T-005: Implement Unicode-aware handle validation/normalization and an in-memory identity registry with atomic create, rename, claim, disconnect, grace release, and close behavior; unit-test all validation and duplicate races.
- [x] T-006: Extend matchmaking records/associations so the authoritative identity and accepted handle follow `PlayerSession`, `SeatRecord`, waiting/start/terminal/reconnect transitions without exposing the opaque ID.
- [x] T-007: Implement the server lobby facade for identity setup, subscribe, public projection, create, join, spectate, leave, and recoverable error mapping; delegate settings/capacity/start/cleanup to feature 006.
- [x] T-008: [P] Add matchmaker lifecycle bridge publication for create, fill, start, collect, disconnect, reconnect, and expiry; assert monotonic revisions and no stale/finished lobby entries.
- [x] T-009: Add server-authority tests proving forged identity/handle/seat/order claims cannot reassign authority, including 100 orders and at least 10 concurrent conflicting handle/final-seat requests.

## Networking transport and browser client

- [ ] T-010: Extend the networking server state machine/dispatcher with lobby identity, handle, subscription, create, join, spectate, leave, and lobby-event messages; preserve heartbeat, reconnect, spectator, and gameplay behavior.
- [ ] T-011: Add lobby protocol validation/error tests, old gameplay-client compatibility tests, malformed/unknown message tests, revision ordering tests, and reconnect credential mismatch tests.
- [ ] T-012: Implement the browser lobby transport client with local-storage claim/handle persistence, snapshot revision handling, action correlation, disconnect/retry behavior, and no identity leakage in URLs or logs.
- [ ] T-013: [P] Add transport integration tests for create/join/spectate transitions, stale action races, full/unavailable matches, server restart, and spectator zero-order behavior.

## Console and host flow

- [ ] T-014: Add lobby reducer/store/effects and route transitions beside the existing match store, with explicit loading/error/retry/return states and compatibility handling for direct live-test routes.
- [ ] T-015: Build the accessible landing UI: identity/rename form, create settings form, public match rows, Join/Spectate actions, occupancy/status/settings labels, empty state, focus management, and live-region announcements.
- [ ] T-016: Wire authoritative handles into waiting/live seat labels and ensure player/spectator UI and client diagnostics never render opaque guest IDs; preserve order controls and fog visibility rules.
- [ ] T-017: Refactor `pnpm host` to serve the lobby by default without `prepareMatch()`, retain explicit create flow, `/version`, security headers, configurable ports, graceful shutdown, and self-host diagnostics.
- [ ] T-018: [P] Add console unit/component/a11y tests for identity persistence, validation, rows, transitions, failures, focus, announcements, keyboard-only use, and no-ID rendering.
- [ ] T-019: Add real two-browser E2E coverage for create→join→first tick, lobby updates, waiting→running action changes, spectator read-only entry, return-to-lobby, reconnect, and server restart recovery.

## Documentation and operational checks

- [ ] T-020: [P] Update README and developer/operator/self-hosting/API guidance for the lobby default, guest identity/handle contract, authoritative association, reconnect/order/view behavior, and in-memory reset boundary; never document opaque IDs.
- [ ] T-021: [P] Update the player manual (index/quick-start/reading-the-screen plus a lobby page if needed) for handle setup, rename/validation, create/join/spectate, participant labels, reconnect, and failure states; update Pages path gates only when necessary.
- [ ] T-022: Add documentation and privacy-boundary validation (grep/checklist or test) proving required surfaces describe handles and do not expose opaque guest IDs; update specs/implementation notes if behavior clarifies an existing contract.

## Wave 1 review remediation (code-quality-reviewer, 2026-08-25)

- [x] R-001: Correct `LobbyActionId` normative ownership comments in `packages/matchmaking/src/contracts/lobby-types.ts` and `tests/fixtures/lobbySnapshots.ts` to client-generated/server-echoed (review F-1); also fix the fixture JSDoc `undefined`-override recipe that fails under `exactOptionalPropertyTypes` (review F-5).
- [x] R-002: Add mutual-assignability pins `LobbyMatchSettings ≡ MatchSettings` and `LobbyTerrainSettings ≡ GenerationSettings` to matchmaking's conformance program (review F-2).
- [x] R-003: Add optional `detail` to the wire `error` LobbyEvent variant in BOTH canonical networking contract copies (byte-identical) + conformance coverage; amend `specs/010…/contracts/lobby-wire.md` and spec.md Clarifications in the same change set — required by US3 AC-4 field-specific feedback (review F-3; PM ruling 2026-08-25).

## Discovered during Wave 2b

- [ ] R-004: Expose a minimal matchmaker-side seam so handle renames propagate to in-flight session/seat snapshots (`propagateHandleRename(store, …)` is unreachable from outside `matchmaker.ts`; facade renames currently reach only the registry + future sessions). Small additive export/wiring in matchmaking; spec 006 semantics unchanged. (T-007 flag)
- [ ] T-023 note: amend matchmaking `vitest.config.ts` coverage exclusion of `src/internal/**` so the facade + publication modules count toward the ≥80% gate.
- [ ] T-024 note: wire `tests/lobby-conformance.test.ts` runtime witnesses into a script/CI step (build lib → targeted vitest run, console precedent).

## Final verification

- [ ] T-023: Run focused package coverage and ensure all new game/lifecycle logic meets ≥80% statements, branches, functions, and lines without lint/type suppressions.
- [ ] T-024: Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, complete package tests, E2E, build, bundle/self-host smoke, 50-cycle cleanup soak, 10 reconnect/spectator trials, and record results in the feature quickstart/implementation notes.
- [ ] T-025: Review the diff against FR-001..FR-027, NFR-001..NFR-005, SC-001..SC-011, out-of-scope exclusions, constitution, and AGENTS.md; verify no application implementation begins before this plan/tasks approval gate.
