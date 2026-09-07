# Feature Specification: Developer Debugging Tools

**Feature Branch**: `issue-81-match-replay`

**Created**: 2026-09-06

**Status**: Draft

**Input**: GitHub issue #81 — "feat: match replay capture and replay harness"

## Problem Statement

Europa Neo's engine is fully deterministic, but developers lack tooling to capture, reproduce, and diagnose issues from live matches. When a bug surfaces, developers must manually reconstruct seeds and order sequences — a tedious, error-prone process. Players also have no way to see the map seed in-game, making it impossible to share interesting maps or reference specific seeds in bug reports. This spec establishes a home for developer-facing debugging tools. The initial deliverables are a match capture/replay CLI harness and an in-game seed display, but the spec is designed to grow with additional debugging capabilities (state inspection, tick diffing, order auditing, etc.) without requiring new feature specs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a Live Match Trace (Priority: P1)

As a developer, I want to record a live match's seed, settings, and order sequence to a JSON fixture file, so that I can replay it later for debugging and regression testing.

**Why this priority**: Without capture, there is nothing to replay. The capture tool is the entry point for the entire replay workflow.

**Independent Test**: Can be tested by running a headless match (seed + scripted orders), capturing the trace, and asserting the fixture file contains the correct seed, settings, player count, and every order with its tick and playerId.

**Acceptance Scenarios**:

1. **Given** a match running with seed `12345` and two players, **When** `pnpm replay:capture --out match-12345.json` is run, **When** the match completes, **Then** a JSON fixture file is written containing the seed, settings, player count, full order sequence `[{tick, playerId, order}]`, final state hash, and tick count.
2. **Given** a match with zero orders issued (no pipes, no attacks), **When** capture completes, **Then** the fixture file is valid JSON with an empty `orders` array and a correct final state hash.
3. **Given** a match that terminates early (surrender at tick 50), **When** capture completes, **Then** the fixture records all orders up to and including tick 50, with `terminalTick: 50` and the terminal match result.

---

### User Story 2 - Replay a Captured Match (Priority: P1)

As a developer, I want to replay a captured fixture through the engine and compare the final state hash against a stored baseline, so that I can detect regressions when engine changes are made.

**Why this priority**: Replay is the payoff of capture — it turns manual reproduction into a one-command CI check.

**Independent Test**: Can be tested by creating a fixture from a known match, running `pnpm replay:run`, and asserting the exit code is 0 when the hash matches the baseline.

**Acceptance Scenarios**:

1. **Given** a fixture file with baseline hash `a1b2c3d4`, **When** `pnpm replay:run match-12345.json` is executed, **When** the replay produces hash `a1b2c3d4`, **Then** the process exits with code 0 and prints "PASS" with the tick count.
2. **Given** a fixture file with baseline hash `a1b2c3d4`, **When** replay produces hash `deadbeef` (different), **Then** the process exits with code 1 and prints "FAIL" with both the expected and actual hashes.
3. **Given** a corrupted or unreadable fixture file, **When** `pnpm replay:run` is executed, **Then** the process exits with code 2 and prints a descriptive error message.

---

### User Story 3 - Update Baseline After Intentional Changes (Priority: P2)

As a developer, I want to update a fixture's baseline hash to match the current engine output, so that intentional behavior changes don't cause false-positive test failures.

**Why this priority**: Essential for maintenance — without update, every behavior change breaks CI until someone manually edits JSON.

**Independent Test**: Can be tested by running `pnpm replay:update` on a fixture whose hash has drifted, and asserting the fixture's `finalStateHash` now matches the engine's output.

**Acceptance Scenarios**:

1. **Given** a fixture file with baseline hash `a1b2c3d4` and engine now producing `deadbeef`, **When** `pnpm replay:update match-12345.json` is executed, **Then** the fixture's `finalStateHash` field is overwritten with `deadbeef` and the process exits 0.
2. **Given** a corrupted fixture file, **When** `pnpm replay:update` is executed, **Then** the process exits non-zero with a descriptive error.

---

### User Story 4 - Display Map Seed and Debug Info in Console HUD (Priority: P2)

As a player, I want to see the map seed and other match metadata in a collapsible Debug section in the sidebar, so that I can share it with developers or friends when I encounter a map issue or want to play the same map.

**Why this priority**: Low-effort, high-value QoL — players frequently ask "what seed is this map?" in bug reports and have no way to find out without digging through network inspector or server logs. The collapsible Debug section also creates a home for future debugging tools (state inspection, tick diffing, etc.) without cluttering the main HUD.

**Independent Test**: Can be tested by booting a match, asserting the Debug section exists and starts collapsed, expanding it, and verifying the seed value is visible and screen-reader-accessible.

**Acceptance Scenarios**:

1. **Given** a match with seed `42`, **When** the console renders the sidebar, **Then** a collapsible "Debug" section exists below the existing Status section, starting collapsed by default.
2. **Given** the Debug section is collapsed, **When** a user clicks the section header, **Then** it expands to reveal "Seed: 42" and any other debug metadata.
3. **Given** the seed display inside the Debug section, **When** a screen reader encounters it, **Then** the element has an appropriate `aria-label` (e.g., "Map seed: 42") and is announced correctly.
4. **Given** a spectator view (no store, `interactive: false`), **When** the sidebar renders, **Then** the Debug section is still present and displays the seed identically to the player view.

---

## Functional Requirements

### Replay Capture

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | A CLI command `pnpm replay:capture` records a live match's seed, `MatchConfig`, player count, and full order sequence `[{tick, playerId, order}]` to a JSON fixture file. | P1 |
| FR-002 | The capture tool writes a `finalStateHash` (using the engine's `hashWorld` function, FNV-1a 32-bit hex) into the fixture after the match terminates. | P1 |
| FR-003 | The capture tool writes the `terminalTick` (the tick at which the match ended) and the `MatchResult` (win/draw, winner, reason) into the fixture. | P1 |
| FR-004 | The capture tool accepts `--out <path>` to specify the output file (default: `replay-<timestamp>.json` in the current directory). | P1 |

### Replay Run

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-005 | A CLI command `pnpm replay:run <fixture.json>` replays the captured match through the engine from tick 0, applying each order at its recorded tick, and computes the final state hash. | P1 |
| FR-006 | `replay:run` exits with code 0 if the computed hash matches the fixture's stored `finalStateHash` (PASS), and code 1 if they differ (FAIL). | P1 |
| FR-007 | `replay:run` exits with code 2 on input errors (missing file, malformed JSON, corrupted fixture). | P1 |
| FR-008 | `replay:run` prints the result to stdout in a CI-friendly format: `PASS <tickCount> ticks` or `FAIL expected <hash> got <actual>`. | P1 |

### Replay Update

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-009 | A CLI command `pnpm replay:update <fixture.json>` replays the fixture and overwrites the `finalStateHash` field with the engine's current output. | P2 |
| FR-010 | `replay:update` prints the old and new hashes for audit trail. | P2 |

### Fixture Format

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-011 | The fixture format is human-readable JSON with the following top-level fields: `version` (fixture format version, starting at `1`), `seed` (number), `settings` (the `MatchConfig` object: boardSize, playerCount, tickIntervalMs, visibilityRadius), `playerCount` (number), `orders` (array of `{tick: number, playerId: PlayerId, order: Order}`), `terminalTick` (number), `terminalResult` (`MatchResult` or null), `finalStateHash` (8-char hex string), `engineVersion` (the `ENGINE_API_VERSION` string at capture time). | P1 |
| FR-012 | The `orders` array is ordered by tick ascending; orders at the same tick are ordered by playerId ascending then `kind` alphabetical (matching the engine's internal sort). | P1 |
| FR-013 | The fixture is valid JSON that can be parsed by `JSON.parse` without a schema validator. | P1 |

### Debug Section & Seed Display

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-014 | The console sidebar includes a collapsible "Debug" section below the existing Status section, starting collapsed by default. | P2 |
| FR-015 | The Debug section displays the map seed as "Seed: {value}" when a `rngSeed` is available in the console state. | P2 |
| FR-016 | The seed display has an `aria-label` of `"Map seed: {value}"` for screen reader accessibility. | P2 |
| FR-017 | The Debug section is visible in both player and spectator modes. | P2 |
| FR-018 | The Debug section starts collapsed; clicking the section header toggles expansion. | P2 |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-001 | **Determinism**: Replay through the engine must produce byte-identical results to the original match. The replay uses the same `createWorld`, `applyCommand`, and `tick` functions as the live engine — no alternative simulation path. |
| NFR-002 | **Human-readable JSON**: Fixture files are pretty-printed (2-space indent) for easy inspection in code review and version control. |
| NFR-003 | **CLI standalone**: The replay tools run as Node.js scripts via pnpm, with no external runtime dependencies beyond the project's existing `@europa/engine` package. |
| NFR-004 | **CI-friendly**: Exit codes 0/1/2 are stable and documented; stdout output is machine-parseable; no interactive prompts. |
| NFR-005 | **Fixture durability**: Fixture format versioning (`version` field) enables forward-compatible schema evolution without breaking existing fixtures. |

## Acceptance Criteria

| FR | Acceptance Criterion |
|----|---------------------|
| FR-001 | Capture produces a JSON file with all required fields from a headless 2-player match. |
| FR-002 | The `finalStateHash` in the fixture matches `hashWorld(finalWorld)` computed independently. |
| FR-003 | A surrendered-at-tick-50 match fixture records `terminalTick: 50` and the correct `MatchResult`. |
| FR-004 | `--out /tmp/test.json` writes to the specified path; default path is `replay-<timestamp>.json`. |
| FR-005 | Replaying a captured fixture through the engine produces the same hash as the original. |
| FR-006 | Exit code 0 on hash match, exit code 1 on mismatch. |
| FR-007 | Exit code 2 on missing file, invalid JSON, or missing required fields. |
| FR-008 | Stdout contains exactly `PASS N ticks` or `FAIL expected <hash> got <hash>`. |
| FR-009 | After `replay:update`, the fixture's `finalStateHash` matches the engine's output. |
| FR-010 | `replay:update` prints old → new hash. |
| FR-011 | A fixture file contains all 10 required top-level fields. |
| FR-012 | Orders in the fixture are sorted by tick, then playerId, then kind. |
| FR-013 | `JSON.parse(fixtureString)` succeeds without errors. |
| FR-014 | A "Debug" section exists in the sidebar, starts collapsed, and expands on click. |
| FR-015 | "Seed: 42" (or equivalent) is present inside the Debug section for seed 42. |
| FR-016 | The seed element has `aria-label="Map seed: 42"`. |
| FR-017 | Spectator view renders the same Debug section as player view. |
| FR-018 | Debug section is collapsed by default; expands on header click. |

## Out of Scope

- **UI replay / visualization**: This feature does not include playing back a match visually in the console. It is purely a capture/replay-for-testing tool and a seed display.
- **Network-level replay**: The fixture captures engine-level state (seed + orders), not network packets. Network replay would be a separate feature.
- **Fixture streaming**: Capture writes the fixture only after the match completes. Real-time streaming of partial fixtures is out of scope.
- **Order filtering / anonymization**: The fixture stores the full order sequence including player IDs. Anonymization is not required.
- **Multi-seed fixtures**: Each fixture captures exactly one match. Bundling multiple matches into a single file is out of scope.

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty order sequence (no orders issued) | Fixture records empty `orders: []`; replay through engine produces correct final state hash (match runs with no player input until terminal condition). |
| Corrupted fixture (invalid JSON) | `replay:run` and `replay:update` exit code 2 with descriptive error. |
| Corrupted fixture (valid JSON, missing fields) | Exit code 2 with error indicating the missing required field. |
| Engine version mismatch | Fixture records `engineVersion` at capture time; replay tools print a warning if the current `ENGINE_API_VERSION` differs, but still run the replay (the engine's own determinism guarantees hold across minor versions for the same config). |
| Very long match (10,000+ ticks) | Fixture file may be large; performance is acceptable because replay is a headless engine loop with no I/O per tick. |
| Duplicate orders at same tick | Orders are sorted by the engine's deterministic comparator (playerId ascending, kind alphabetical); the fixture stores them in this canonical order. |
| Orders applied to already-terminal world | The engine's `tick()` returns the input unchanged when terminal; replay faithfully reproduces this no-op behavior. |

## Future Extensions

This spec is designed to grow with additional debugging tools. Potential future additions (not in this deliverable):

- **State inspector**: Dump full world state at any tick for diffing
- **Tick diff tool**: Compare two fixtures tick-by-tick to find where divergence starts
- **Order audit log**: Filter and search order sequences by player, kind, or tick range
- **Performance profiler**: Measure tick execution time across a replay
- **Determinism verifier**: Run a fixture twice and compare intermediate hashes, not just final

## Dependencies

- **Feature 001** (Core Game Engine): Replay uses `createWorld`, `applyCommand`, `tick`, `hashWorld` from `@europa/engine`.
- **Feature 005** (Client Console): Seed display modifies the sidebar component in `@europa/console`.

## Clarifications

*(None yet — pending clarification round.)*
