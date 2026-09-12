# Tasks: Universal Numeric PlayerId Replacement (Issue #74)

**Execution rule**: Tasks are ordered by dependency. `[P]` means parallel-safe
only with the other tasks in the same wave when the listed files are disjoint.
Every task includes its test obligation; no task author may add a compatibility
shim or weaken a validator to make an old fixture pass.

## Wave 0 — Baseline and inventory

- [ ] **T001**: Capture the clean baseline on the delivery branch: `git status`,
  package versions, current API versions, `pnpm verify:changed --full` (or the
  repository-approved equivalent), and existing numeric-identity search results;
  record results in `quickstart.md` without modifying approved specs.
- [ ] **T002**: Build a typed inventory of every public numeric `PlayerId`,
  `GuestPlayerId`, owner, winner, seat, replay, serializer, wire, fixture, and
  router handoff surface; classify each as public identity, dense index, seat
  coordinate, or negative test. Store the inventory in the implementation PR
  description and use it as the review checklist.
- [ ] **T003**: Add/confirm a repository guard that rejects direct runtime
  `nanoid` imports, numeric public identity declarations, authoritative
  `localeCompare`, and credential-bearing identity substitutions without
  suppressions; prove the guard fails on representative bad examples.

## Wave 1 — Shared identity primitive (core)

- [ ] **T004**: [P] Add the branded `PlayerId` type and canonical constants to
  `packages/core/src/player-id.ts`, update `packages/core/src/types.ts` and
  `packages/core/src/index.ts`, and bump the coordinated shared API version as
  required by the amended contracts; document that IDs are not credentials.
- [ ] **T005**: [P] Implement canonical runtime validation and parsing in
  `packages/core/src/player-id.ts` for exact length/alphabet/regex, rejecting
  numbers and all non-canonical values with typed errors.
- [ ] **T006**: [P] Implement injectable CSPRNG rejection sampling in
  `packages/core/src/player-id.ts`; use the platform CSPRNG in production, avoid
  modulo bias, bound collision retries at the registry caller, and fail closed
  on entropy/source failure. Do not call it from tick/replay code.
- [ ] **T007**: [P] Add `packages/core/tests/unit/player-id.test.ts` covering valid and
  invalid vectors, exact 72-bit output shape, rejection-sampling boundary values,
  deterministic injected-byte vectors, entropy failure, and absence of a direct
  runtime `nanoid` dependency.
- [ ] **T008**: [P] Update core package contract/typecheck witnesses and README
  identity documentation; prove strict typecheck and ≥80% coverage for the new
  identity logic without test-only casts that bypass validation.

## Wave 2 — Engine registry and deterministic public model

- [x] **T009**: Implement `packages/engine/src/playerRegistry.ts` with immutable
  ID↔dense-index maps, canonical validation, duplicate rejection, explicit
  UTF-16 code-unit comparator, and checked lookup APIs; add public exports and
  method documentation.
- [x] **T010**: Replace engine public numeric identity fields in
  `packages/engine/src/contracts/engine-types.ts`, `src/types.ts`, `src/create.ts`,
  `src/read.ts`, `src/tick.ts`, and resolution modules with `PlayerId`, while
  keeping typed-array indexes private behind the registry.
- [x] **T011**: Update engine ownership, event, terminal, combat, capture, gun,
  paratroop, validation, and deterministic order paths to resolve IDs through the
  registry; remove arithmetic/index assumptions and all authoritative
  `localeCompare` uses.
- [x] **T012**: Add registry and resolver tests under
  `packages/engine/tests/unit/` for bijection, insertion-order independence,
  seat/index reassignment, unknown IDs, duplicate IDs, forged IDs, and explicit
  UTF-16 ordering (including punctuation edge cases).
- [x] **T013**: Replace numeric engine fixtures in
  `packages/engine/tests/fixtures/`, quickstarts, unit suites, performance
  harnesses, and scenario builders with deterministic valid explicit IDs; retain
  numeric values only as explicit rejection tests.
- [x] **T014**: Preserve and extend engine determinism tests in
  `packages/engine/tests/determinism.test.ts` and `tests/replay/` so explicit IDs
  are required, host locale cannot change ordering, and identical scripted inputs
  remain byte-identical.

## Wave 3 — Engine serialization and replay

- [ ] **T015**: [P] Define and implement the ID-table serialization format in
  `packages/engine/src/serialize.ts`, including canonical table ordering,
  explicit table-index references, version handling, and strict malformed,
  duplicate, missing, extra, numeric, and inconsistent-reference rejection.
- [ ] **T016**: [P] Update `packages/engine/src/replay/types.ts`, `replay/replay.ts`,
  `replay/validate.ts`, `scripts/capture.ts`, `scripts/run.ts`, and
  `scripts/update.ts` so replay fixtures and captured sessions always carry
  explicit valid IDs; never synthesize temporary IDs during decode or replay.
- [ ] **T017**: [P] Extend `packages/engine/tests/unit/serialize.test.ts` and
  `tests/replay/*.test.ts` for round-trip bytes, canonical table permutation,
  malformed/duplicate/missing/extra/numeric rejection, unknown-player commands,
  and replay identity preservation through terminal state.
- [ ] **T018**: Add a serialization/replay conformance witness that compares source
  contracts under `packages/engine/src/contracts/` with
  `specs/001-core-game-engine/contracts/`, including the new identity table and
  version boundary.

## Wave 4 — Terrain and fog boundaries

- [ ] **T019**: [P] Keep terrain contracts and implementation ID-agnostic in
  `packages/terrain/src/` and its contract mirrors; use dense numeric placement
  slots only, remove accidental `PlayerId` imports, and document caller-owned
  mapping.
- [ ] **T020**: [P] Update terrain tests and fixtures to prove generated board
  bytes depend only on seed/size/player-count/settings, not ID values; include
  valid IDs with different ordering and ensure the same starting-city slots are
  produced.
- [ ] **T021**: [P] Update fog implementation/contracts in
  `packages/fog/src/playerView.ts`, `visibleSet.ts`, and related types to resolve
  universal IDs through the authoritative engine registry before visibility
  computation; unknown/forged IDs must fail closed.
- [ ] **T022**: [P] Update fog tests under `packages/fog/tests/` for valid ID views,
  unknown/forged IDs, reconnect/seat reassignment view association, spectator
  null handling, and zero hidden-state leakage; retain ≥80% coverage.
- [ ] **T023**: Run terrain/fog source-to-spec contract drift and strict conformance
  programs; update only implementation mirrors/tests required by the approved
  amendments, not the behavioral specs.

## Wave 5 — Matchmaking identity lifecycle

- [ ] **T024**: Implement the matchmaking ID allocation boundary in
  `packages/matchmaking/src/idGen.ts` and identity registry internals using the
  core generator, active uniqueness set, bounded collision retry, and fail-closed
  result; remove seat-index-derived identity.
- [ ] **T025**: Propagate one universal ID through
  `guestPlayerIdentity.ts`, `seatRecord.ts`, `playerSession.ts`, `matchRecord.ts`,
  `matchLifecycle.ts`, `matchmaker.ts`, `engineSession.ts`, `rematch.ts`, and
  results; preserve it over reconnect, reassignment, terminal, and accepted
  rematch while the guest identity remains active.
- [ ] **T026**: Enforce credential separation in matchmaking APIs: ID-only
  identity mutation, admission, eviction, forfeit, order, and view operations
  must fail; session/reconnect proof remains required and client claims remain
  advisory.
- [ ] **T027**: Update matchmaking contracts under
  `packages/matchmaking/contracts/` and `src/contracts/`, including seat
  assignment, match results, rematch, lobby identity, and shared error types;
  synchronize spec mirrors via conformance tests.
- [ ] **T028**: Replace matchmaking numeric identity fixtures in
  `packages/matchmaking/tests/fixtures/`, unit, quickstart, acceptance, and soak
  suites with valid deterministic IDs; add explicit negative numeric cases.
- [ ] **T029**: Add lifecycle tests for create→fill→start, active uniqueness,
  forced collision retry/exhaustion, reconnect grace, seat reassignment,
  terminal result, rematch identity preservation, storage/server expiry, and
  ID-only credential attacks.

## Wave 6 — Networking breaking wire migration

- [ ] **T030**: Bump `NETWORK_API_VERSION` at the approved breaking major boundary
  and update both canonical networking contract copies plus all version witnesses;
  keep application version checks independent.
- [ ] **T031**: Update networking types/validators in
  `packages/networking/src/contracts/`, `validate.ts`, `frame.ts`, `orders.ts`,
  `match-channel.ts`, `connection.ts`, `reconnect.ts`, `broadcast.ts`,
  `spectator.ts`, and `server.ts` so gameplay identity fields are canonical
  strings and numeric values are rejected before domain interpretation.
- [ ] **T032**: Preserve authoritative server resolution: join, order, snapshot,
  reconnect, spectator, and terminal paths must derive identity from bound
  session/reconnect credentials; a supplied ID must never authenticate or select
  another view.
- [ ] **T033**: Replace all authoritative numeric sorting in networking with the
  shared explicit UTF-16 comparator; add tests with IDs whose lexical order
  differs from seat/insertion order and prove byte-stable drains/broadcasts.
- [ ] **T034**: Update networking source/spec mirrors and conformance programs for
  the new major version, all identity unions, nullable spectator fields, and
  old-client rejection; retain exact mirror equality where required.
- [ ] **T035**: Update networking fixtures and tests, including server, lobby,
  reconnect, rate-limit, validation, security-hardening, version-mismatch,
  frame-cap, and integration suites; assert numeric clients are rejected before
  payload parsing and bearer credentials are never exposed.

## Wave 7 — Console state, UI, and mounted routing

- [ ] **T036**: [P] Update console contracts/state/reducer/net adapters in
  `packages/console/src/contracts/`, `state/`, and `net/` to key ownership,
  colors, names, participants, terminal, and rematch state by server `PlayerId`,
  never numeric seat or handle text.
- [ ] **T037**: [P] Update console render/UI paths (`render/`, `ui/`, sidebar,
  labels, minimap, modal, and spectator components) for handle-first labels with
  ID fallback; preserve accessibility semantics and spectator inert controls.
- [ ] **T038**: [P] Update `packages/console/src/routing/` and mounted runtime
  handoffs so create/join/spectate/share-link flows use the canonical TanStack
  Router tree, defer until connection/identity readiness as required, and do not
  use raw history mutation or legacy direct mounting.
- [ ] **T039**: Update console fixtures, deterministic golden data, component/a11y
  tests, and unit tests to use explicit valid IDs; add forged-ID ownership and
  ID-preservation tests for reconnect, terminal, rematch, and spectator state.
- [ ] **T040**: Add browser E2E coverage for create, join, spectate, share-link,
  unnamed profile round-trip, final canonical URL, mounted view, two-seat ID
  preservation, and ID-only order/view denial.

## Wave 8 — Cross-feature security, documentation, and final gates

- [ ] **T041**: [P] Audit and update package READMEs, contract comments, and
  developer docs for universal IDs versus bearer credentials; remove stale numeric
  identity claims and ensure no credentials appear in examples, logs, or risky
  URLs.
- [ ] **T042**: [P] Add/refresh repository conformance, version, privacy/security,
  replay, and no-runtime-nanoid guards; include tests for no `localeCompare` in
  authoritative paths and no ID-derived terrain output.
- [ ] **T043**: Run package-specific coverage and strict typecheck programs for
  core, engine, terrain, fog, matchmaking, networking, and console; fix code
  rather than adding lint/type suppressions.
- [ ] **T044**: Run real-wire integration and browser acceptance against the
  mounted self-host stack, including old-major/numeric rejection, reconnect,
  fog isolation, terminal/rematch, and canonical routing; capture evidence in
  `quickstart.md`.
- [ ] **T045**: Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`,
  `pnpm verify`, and `pnpm version:check`; run `git diff --check`, review the
  complete diff for source/spec/contract drift, and hand the branch to security
  and code-quality review. Do not commit as part of this planning/implementation
  handoff.

## Dependency summary

- T001–T003 are baseline prerequisites.
- T004–T008 establish the shared primitive; T009–T018 depend on T004–T006.
- T019–T023 depend on engine public contracts and registry decisions (T009–T011).
- T024–T029 depend on T004–T006 and the engine input boundary (T010).
- T030–T035 depend on core/engine/matchmaking identity shapes (T004–T006,
  T010–T011, T024–T027).
- T036–T040 depend on networking and matchmaking wire contracts (T027,
  T030–T035) plus mounted router behavior.
- T041–T045 depend on all implementation waves.

**Total**: 45 tasks across 9 waves (Wave 0 baseline, Waves 1–8 delivery).
