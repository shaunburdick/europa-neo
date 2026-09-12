# Orchestration Log: Issue #74 Universal PlayerId Migration

## Live state

- **Phase**: 6 implementation in progress.
- **Coordination anchor**: Feature 010 existing directory, nested planning bundle.
- **Branch**: `issue-74-numeric-playerid`.
- **Task count**: 45, T001–T045.

### Progress log

- **Foundation committed** (`9bb035c`): amended specs 001/002/003/004/005/006/010/013/015,
  the phase 4–5 coordination bundle, and the Wave 0 guard.
- **Wave 0 — complete**: baseline recorded in `quickstart.md`; full typed
  inventory in `inventory.md`; guard at `packages/core/tests/identity-migration-guard.test.ts`.
  Guard had a `*/`-in-comment parse defect (never ran) — repaired in Wave 1
  (comment syntax only, logic intact). It now fails as intended until migration lands.
- **Wave 1 — complete** (`03929c5`): `@europa/core` canonical identity primitive.
  Branded `PlayerId`/`GuestPlayerId`, exact constants, guards/parsers, injectable
  CSPRNG generator with bounded collision retry and fail-closed entropy.
  `ENGINE_API_VERSION` bumped `0.1.0 → 0.2.0`. Core unit 98 passing; player-id
  100% coverage. **Known downstream fallout to fix in their waves**: hard-coded
  `'0.1.0'` in `packages/engine/src/serialize.ts` and the
  `ENGINE_API_VERSION === '0.1.0'` assertion in
  `packages/matchmaking/tests/conformance.test.ts:302`.
- **Wave 2 — complete (engine registry + deterministic public model, T009–T014)**:
  `packages/engine/src/playerRegistry.ts` (immutable `PlayerId` ↔ 0-based
  `DensePlayerIndex` maps; canonical validation at construction; duplicate and
  2–4-length rejection; exported `compareUtf16` explicit UTF-16 code-unit
  comparator; checked `indexOfId`/`idAt`/`has`/`count`/`ids` + fail-fast
  `requireIdAt`). Shared contract updated: `MatchConfig.playerIds` (explicit
  2–4 canonical list) replaces `playerCount`, `CityPlacement.owner` is now the
  terrain-agnostic 1-based **numeric placement slot**, `World.playerRegistry` is
  public, `ValidationError.unknown_player.player` is a `PlayerId`. Resolvers
  (`create`/`read`/`tick`/`validate`/combat/capture/gun/paratroop/terminal)
  resolve IDs through the registry; typed arrays keep private 1-based dense
  bytes (`0` = neutral); order sort and terminal ordering use `compareUtf16`.
  Serialization begins with a canonical ID table; player records reference table
  indexes; `serialize.ts` reads the single `ENGINE_API_VERSION` constant (no
  `'0.1.0'` literal remains in engine). Replay fixtures require explicit
  `settings.playerIds` (no synthesized IDs). Engine 398 tests passing; coverage
  94.84% stmts / 82.01% branches / 100% fn / 94.64% lines; typecheck, lint,
  build, and contract-drift green. Guard check: **zero `packages/engine/`
  violations**; remaining guard failures are terrain/networking/matchmaking/
  console (their waves).
- **Wave 2 cross-wave fallout (expected, for later waves)**: `@europa/terrain`
  DTS build fails because `CityPlacement.owner` is now `number` while terrain
  still uses the `PlayerId` brand (Wave 5/T019–T020); the JS bundle still emits
  (engine CLI replay tests use it). Matchmaking `conformance.test.ts` still
  asserts `ENGINE_API_VERSION === '0.1.0'` (Wave 6/T027).
- **Contract mirror sync**: `specs/001-core-game-engine/contracts/engine-types.ts`
  was brought into lock-step with the implementation mirror (adds
  `PlayerRegistry`, `World.playerRegistry`, `unknown_player: PlayerId`, and the
  dense-byte `WorldState` documentation). The behavioral spec text is unchanged;
  this is the approved T010 model change landing in its contract mirror.
- **Findings**:
  - Identity contract valid-vector typo: `A0b_-9XyZ12` and `aBcDeF012_-` are 11
    chars; normative `{12}` kept strict and those are tested invalid. Contract doc
    test vectors need correcting.
  - `PlayerId` → branded string breaks typecheck across all packages until each
    wave migrates its usage. Repo-wide `pnpm verify` stays red by design mid-migration.

- **Wave 3 — complete (engine serialization + replay, T015–T018)**: strict,
  canonical, lossless ID-table serialization in `packages/engine/src/serialize.ts`.
  Payload now carries an independent `SERIALIZE_FORMAT_VERSION` byte, a canonical
  strictly-ascending ID table, a placement-slot→table-index map (`slotOrder`), and
  `tickIntervalMs`; the old redundant `reserved`/`playersLen` fields are gone. Decode
  is bounds-checked (no silent `?? 0` fallback), rejects malformed/duplicate/
  missing/extra/numeric/non-canonical/permuted tables, out-of-range slot/record
  references, invalid status/name bytes, out-of-range city/cell owner bytes,
  invalid pipe/reserve fields, and trailing bytes. Encode fails loudly
  (`EngineSerializationError`) rather than substituting. Replay fixtures are
  strictly validated (canonical 2–4 unique IDs, `playerCount` equality, registered
  order players) and `replayMatch` refuses inconsistent identities before ticking.
  `scripts/capture.ts` gains `--player-ids` and rejects unknown/numeric players.
  Engine 456 tests passing (was 398); coverage 92.6% stmts / 81.21% branches /
  99.15% fns / 92.31% lines; typecheck, lint, format, build, contract-drift, and
  the new `serialization-conformance.test.ts` (contract-mirror set + version
  boundary + identity table) all green. Guard: **zero `packages/engine/`
  violations**; remaining guard failures are networking/matchmaking/console
  (later waves). PM-notable: the tighter replay fixture typing flushed out a
  pre-existing stale `visibilityRadiusDefault` field in
  `tests/unit/scratch-buffers.test.ts` (tests are excluded from `tsc`), now fixed;
  and the sample fixture + README hash were regenerated for the new layout.

## Waves

1. Baseline and forbidden-pattern inventory.
2. Core branded identity and CSPRNG generator.
3. Engine registry/public model.
4. Engine serialization/replay.
5. Terrain/fog boundaries.
6. Matchmaking lifecycle.
7. Networking breaking wire migration.
8. Console and mounted router migration.
9. Cross-feature security, documentation, and final verification.

The numbered task file is authoritative for dependencies and `[P]` safety. PMs
should dispatch only disjoint package ownership in parallel and should require
the Wave 7 security/replay/router checkpoint before final gates.

## Review checkpoint requirements

- No numeric public identity or numeric wire compatibility remains.
- No `localeCompare` in an authoritative ordering path.
- No generated/temporary IDs in replay or serialization.
- Terrain output is independent of IDs.
- IDs never replace session/reconnect proof.
- Mounted router handoffs are verified on the real browser path.
- Closed PR #113 findings are covered by tests, not merely comments.
