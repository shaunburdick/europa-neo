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

- **Wave 4 — complete (terrain + fog boundaries, T019–T023)**:
  - **Terrain (T019–T020)** — `49b7fbb` + `17484f3`: `@europa/terrain` is now
    identity-agnostic. `CityPlacement.owner` and `startingCitiesByPlayer` keys
    are 1-based dense numeric placement slots; the branded `PlayerId`
    re-export was dropped; both contract mirrors, `types.ts`, README, and the
    `terrain-to-engine.ts` proposal mirror were aligned to the numeric-slot
    boundary (FR-011). New `tests/integration/id-independence.test.ts` proves
    generated board bytes depend only on seed/size/player-count/settings, not
    on ID values (same starting-city slots across different valid ID orderings).
    Terrain 427 tests green.
  - **Fog (T021–T022)** — `9058504`: every visibility computation resolves the
    universal `PlayerId` through `world.playerRegistry` via the single audited
    seam `resolvePlayerOwnerByte` **before** any board scan; unknown, forged,
    malformed, or numeric IDs fail closed to an empty visible set/view (never a
    fallback seat), spectator views stay identity-independent, and reconnect/
    seat reassignment preserve correct view association (spec v1.5
    FR-010/FR-011). New `tests/unit/player-identity.test.ts` plus migrated
    fixtures. Fog 100 tests green.
   - **T023** — `88a91c2`: re-ran the terrain/fog source-to-spec contract-drift
     and strict-conformance programs and both strict typechecks — all green; the
     repo-level identity guard shows **zero terrain/fog violations** (remaining
     failures are the later networking/matchmaking/console waves). No
     implementation mirror or test change was required by the approved
     amendments. Reconciled the flagged non-behavioral planning docs per AGENTS
     rule 4: `specs/003.../data-model.md` (`CityPlacement.owner` /
     `startingCitiesByPlayer` documented as numeric placement slots; removed the
     stale `PlayerId = 1 | 2 | 3 | 4` union and stale `engine-types.ts`
     provenance) and `specs/002.../data-model.md` (authoritative registry
     resolution per FR-010, fail-closed invariant). Ticked T019–T023.

- **Wave 4.5 — review remediation (code-quality review of the Wave 1–4
  foundation)**: reviewed the identity foundation before Wave 5. **Verdict:
  remediation applied for every blocking finding; three findings deferred as
  non-blocking (recorded below).** No behavioral `spec.md` touched, no rule
  weakened, no allowlist/suppression added, and the not-yet-migrated packages
  (`networking`, `matchmaking`, `console`) were not modified.
  - **Fixed**:
    - **N1 (fog aliasing)** — `fog/src/playerView.ts` `snapshotConfig` now
      `[...config.playerIds]`; the "engine config is frozen" comment was false
      (the engine retains the caller's array by reference and never freezes
      it). `fog/tests/unit/playerView.test.ts` adds a mutation-isolation test
      (reference inequality + world config unchanged after mutating the view).
    - **N2 (serializer losslessness)** — `engine/src/serialize.ts` validates
      `citiesOwned` ∈ [0,255] and `troopsHeld` as uint32 before writing
      (`EngineSerializationError`); the previous `& 0xff` / `>>> 0` narrowing
      was silent. Tests cover both bounds and non-integers.
    - **N3 (test integrity)** — `serialize.test.ts`'s `TABLE_START` corrected
      from a wrong literal `33` to a derived
      `versionHeaderLen + 32 + 1` (= 41 for `ENGINE_API_VERSION` 0.2.0), with an
      assertion that the sliced bytes are the canonical ID table.
    - **N4 (guard integrity)** — `core/tests/identity-migration-guard.test.ts`
      replaces the line-prefix comment skip with a token-aware comment stripper
      (`stripComments`); `/*x*/ const id = seat as PlayerId;` is now caught and
      commented-out code no longer false-positives. Added a PATTERNS-table
      self-test (bad sample must match, clean sample must not) plus explicit
      inline-comment/string-lexing tests. Existing rule semantics unchanged.
    - **N7 (terrain doc)** — terrain `startingCitiesByPlayer` JSDoc now says the
      record always carries keys `1..4` (unused slots empty), matching
      `generate.ts`; both contract mirrors updated byte-identically.
    - **S1 (doc accuracy)** — `plan.md` and `contracts/identity-contract.md`
      reworded to the shipped model: 9 bytes are bit-packed into 12 six-bit
      groups (256 = 4 × 64, so no byte is rejected); rejection sampling is
      candidate/collision-level only.
    - **S3 (contract truthfulness)** — fog `computeVisibleSet` and
      `computePlayerView` public docs (local + spec mirrors, verified
      byte-identical) document authoritative `PlayerRegistry` resolution and
      fail-closed unknown/forged/numeric IDs.
    - **S4 (round-trip)** — `serialize.ts` rejects an encode-time
      `config.seed`/`rngSeed` divergence (one seed field is stored and decode
      restores both); tests cover the mismatch and the uint32-normalization-
      equal case.
    - **Coverage** — added decode/encode error-branch tests for
      `serialize.ts`, `replay/validate.ts`, and `create.ts`. `permutationProblem`
      is exported `@internal` (absent from the barrel) so its length/non-integer/
      out-of-range/duplicate branches are unit-testable; decode guards were
      reordered so the missing-table-index and out-of-range-player-index paths
      are reachable (behavior unchanged — same errors, still fail closed).
  - **Deferred / non-blocking** (deliberately not fixed in this change set):
    - **N5 (branded placement slot)**: the terrain↔engine boundary intentionally
      uses plain dense `number` placement slots (FR-011 identity-agnostic).
      Introducing a nominal `PlacementSlot` brand would add a new shared type and
      conversions across both packages for no security benefit — slots are
      coordinates, not identities. Semantics are already documented; deferred to
      avoid scope creep in the foundation.
    - **N6 (`index + 1` dense-byte duplication)**: the 1-based byte encoding
      (`index + 1`, `0` = neutral) recurs in `create.ts`, `serialize.ts`, and
      fog's `resolvePlayerOwnerByte`. Centralizing it refactors the registry/byte
      boundary across engine resolver modules that Waves 5–7 are still
      migrating; the invariant is documented in `playerRegistry.ts`. Deferred as
      non-blocking.
    - **N8 (console handle-first labels)**: the console package is out of scope
      for this change set (Wave 7 not started); handle-first labeling with ID
      fallback is an explicit Wave 7/T037 task and must land with the console
      state migration. Deferred to its wave.
  - **Verification** (all four boundary packages built in dependency order):
    engine 518 tests green (coverage 96.08/86.19/99.14/95.93; `serialize.ts`
    97.65/87.66/96.66/97.53, `create.ts` 94.04/92.42/100/93.75,
    `replay/validate.ts` 96.61/93.37/100/96.57); fog 101 green (contract-drift
    mirror pair byte-identical); terrain 427 green; core 108 pass with the
    **3 expected** guard failures confined to networking/matchmaking/console
    (un-migrated waves; not suppressed or excluded). Typecheck, lint, and
    format:check clean on core/engine/fog/terrain.

- **Wave 5 — complete (matchmaking identity lifecycle, T024–T029)**:
  - **T024 allocation boundary**: `src/idGen.ts` gains
    `allocatePlayerId`/`allocateGuestPlayerId` over `@europa/core`'s CSPRNG
    generator (active-uniqueness predicate + bounded retry + fail-closed
    `PlayerIdCollisionError`/`PlayerIdEntropyError`). The identity registry
    mints canonical ids: production via the core generator with the live
    identity map as the active set; tests via an injected canonical factory
    that validates every value through `parseGuestPlayerId` (numeric/legacy
    fixtures now fail loudly) and applies the same bounded retry. The
    seat-index gate `toPlayerId(value)` and every `seatIndex + 1` identity
    site are deleted.
  - **T025 one universal id**: `PlayerSession.playerId` (allocated once at the
    identity boundary; equals the lobby `GuestPlayerId` when
    lobby-originated) is copied verbatim into `SeatRecord.playerId` at claim
    time, fed as `MatchConfig.playerIds` in seat/placement order, attached to
    networking per seat, used for the engine `OrderSurrender`, and preserved
    into terminal results and accepted rematches. `results.ts` now resolves
    standings through `world.playerRegistry` (dense order is UTF-16, NOT seat
    order) instead of `world.players[seatIndex]`.
  - **T026 credential separation**: `restoreIdentity` only resumes an
    identity already in its own reconnect GRACE window; a bare claim against
    an ACTIVE identity mints a fresh identity instead of evicting the
    incumbent. The lobby facade short-circuits same-connection refresh and
    only reactivates grace identities on seat reconnect. Negative tests prove
    an id presented as a session/reconnect token fails
    (`leaveMatch`/`requestRematch`/`acceptRematch`/`declineRematch` →
    `session_invalid`; `joinMatch` reconnect → `match_not_found`). Residual
    hardening (a dedicated resume secret so a bare id cannot resume a
    grace-window identity) is tracked by GitHub issue #146; the behavioral
    specs were not modified.
  - **T027 contracts**: `MATCHMAKING_API_VERSION` 0.1.0 → 0.2.0 (pre-1.0
    breaking identity surface), `SeatAssignment.playerId` documented as the
    universal id, and the spec-006 contract mirror updated in lock-step; the
    stale `ENGINE_API_VERSION === '0.1.0'` conformance assertion now pins
    `0.2.0`. The roster display sort uses the shared explicit `compareUtf16`
    instead of `localeCompare`.
  - **T028 fixtures**: all matchmaking fixtures/unit/quickstart/acceptance/soak
    suites migrated to valid deterministic canonical ids; negative numeric
    cases added (injected `randomId: () => '1'` → `InvalidPlayerIdError`).
  - **T029 tests**: new `tests/unit/idGen.test.ts` (canonical output, active-set
    redraw, exhaustion, entropy failure) and
    `tests/unit/playerIdLifecycle.test.ts` (one universal id through
    create→fill→start→terminal→rematch; ID-only credential attacks; no
    active-holder eviction).
  - **Verification**: matchmaking typecheck, lint, format:check, build,
    conformance typecheck all green; 389 tests passing; coverage
    95.77/87.8/96.13/96.06 (stmts/branches/funcs/lines), all ≥80%. The
    repository identity guard reports **zero `packages/matchmaking/`
    violations**; the only remaining guard failures are networking (Wave 6)
    and console (Wave 7) — not suppressed or excluded.
  - **Environment note**: the un-migrated networking package's DTS build fails
    on `MatchConfig.playerCount` (Wave 6 owns that fix), so matchmaking's
    typecheck/build used declarations emitted from networking source
    (`tsc --emitDeclarationOnly`; build artifacts only — no networking source
    touched).

- **Wave 6 — complete (networking breaking wire migration, T030–T035)**:
  - **T030 version boundary**: `NETWORK_API_VERSION` `0.2.0` → `0.3.0` in both
    byte-identical canonical contract copies. Under `validateVersion`'s
    `breakingBoundary()` (pre-1.0 minors are the breaking line), boundary
    `0.2` ≠ `0.3`, so every old numeric client is rejected with
    `version_mismatch` + close 1008. Proven end-to-end: a `hello` offering
    `0.2.0` is rejected (integration) and `0.3.5` same-boundary drift is
    accepted. The application/release version is untouched.
  - **Version gate before payload**: `connection.handleInbound` now parses JSON,
    applies the FR-004 version gate, and only THEN runs envelope/payload
    validation (`frame.ts` exposes `parseFrameJson`). A `0.2.0` frame carrying
    a now-invalid numeric identity payload is rejected as `version_mismatch`
    (not `malformed_payload`) — pinned by the new security-hardening test.
    Empty/absent/non-string versions still fall through to `malformed_payload`
    (existing pinned behavior preserved).
  - **T031 identity fields**: `JoinMatchPayload.requestedSeat` REMOVED (a
    client-supplied identity can no longer select or claim a seat); the
    wire validator now requires canonical 12-char identities for every order
    `player` field and for an optional lobby `claim.guestPlayerId`, rejecting
    numeric JSON before domain interpretation; `joinAck.playerId` accepts only
    a canonical id or `null`; `SPECTATOR_VIEW_SEAT = 0 as PlayerId` replaced by
    `SPECTATOR_VIEW_PLAYER_ID = parsePlayerId('Spectator001')`;
    `viewsEqual` compares the ordered `playerIds` config (was the removed
    `playerCount`); the spectator view-cache key is the identity string.
  - **T032 authoritative resolution**: seat admission resolves the bound
    bearer token (registry/reconnect) or assigns the lowest open seat in
    UTF-16 order — never a client-supplied id. `acceptOrder` rejects an order
    whose `player` differs from the connection's bound identity
    (`malformed_payload`, detail reason `order_player_mismatch`). New security
    tests: a bare canonical id offered as a reconnect token → `token_invalid`;
    an order authored as another player → rejected; tokenless joins cannot take
    grace-window seats. Spectator/terminal/snapshot paths already derive from
    the connection binding.
  - **T033 ordering**: all authoritative sorting uses the shared
    `compareUtf16` from `@europa/engine` (drain `(playerId, kind)`,
    `connections()` seat/spectator iteration, server seat scans); the
    `order.kind.localeCompare` tiebreak is gone. Tests pin reverse-lexical
    insertion drains and insertion-independent `connections()` ordering; the
    existing tick-determinism suite still proves byte-identical streams.
  - **T034 mirrors/conformance**: all three networking contract mirrors
    (`network-types.ts`, `network-api.ts`, `matchmaking-to-networking.ts`)
    remain BYTE-identical to `specs/004-multiplayer-networking/contracts/`;
    the conformance suite's byte-identity, union-exhaustiveness, and
    mutual-assignability witnesses pass. `@europa/core` added as a direct
    dependency for canonical identity validation (workspace-internal, zero
    third-party deps).
  - **T035 fixtures/tests**: every networking fixture/test migrated to explicit
    canonical identities (`SCRIPTED_PLAYER_IDS`, `nextGuestPlayerId` →
    `Guest0000001`, `NON_SECRET_GUEST_ID` → `Guest0000001`); the integration
    harness joins via bound tokens and exposes `seatToken`/`playerIdForSlot`.
    New/updated negative coverage: numeric/old-version rejection before payload
    parsing, order-identity mismatch, id-as-token denial, and
    credential-never-logged (capturing logger).
  - **Verification**: networking typecheck, lint, `format:check`, and tsup build
    (JS + DTS) clean — the previous `MatchConfig.playerCount` DTS failure is
    resolved. 319 tests across 35 files pass; coverage
    90.57 / 82.42 / 97.07 / 90.59 (stmts/branches/funcs/lines), all ≥80%. The
    identity-migration guard reports **zero `packages/networking/` violations**;
    the only remaining guard failure is `packages/console/` (Wave 7) — not
    suppressed or excluded.

- **Wave 6.5 — review remediation (networking + matchmaking findings, R001–R006)**:
  post-Wave-6 code review items fixed before Wave 7 begins. No behavioral
  `spec.md` semantics changed, no rule weakened, no console/README touched
  (Wave 7/8 own those). Console remains the only identity-guard failure.
  - **R001 (B1 blocker)** — `packages/matchmaking/tests/conformance.test.ts`
    still pinned `NETWORK_API_VERSION === '0.2.0'` after Wave 6 bumped the wire
    to `0.3.0`, failing CI. Reproduced red (`expected '0.3.0' to be '0.2.0'`),
    then updated the assertion, test name, and comment to `0.3.0` and documented
    that matchmaking/engine (`0.2.0`) and networking (`0.3.0`) live on
    independent pre-1.0 breaking boundaries that need not be equal.
    `test:conformance` 7/7 green.
  - **R002 (B2 blocker)** — `MatchChannel.joinAckPlayers()` overlaid
    `displayNames` by registry array position, but `world.players` is in
    canonical UTF-16 registry order while `displayNames` is seat
    (`matchConfig.playerIds`) order; reverse-lexical seat lists got swapped
    handles. Fix resolves each player's seat via
    `matchConfig.playerIds.indexOf(player.id)` (pass-through when absent).
    New `matchChannel.test.ts` regression with deliberately reverse-lexical
    `playerIds` + per-seat names, **proven failing pre-fix** then green;
    method/field/`MatchChannelInit` docs corrected to seat-order semantics.
  - **R003 (F1)** — `fog-leakage-n-players.test.ts` still sent the removed
    `requestedSeat` and numeric `(index+1) as PlayerId` orders; every order was
    rejected `malformed_payload`, so the 500-tick zero-leakage audit silently
    no-oped. Migrated to `attachPlayersForMatch` bound tokens and canonical
    `playerIdForSlot` identities; the independent oracle now resolves the dense
    owner byte through `world.playerRegistry` instead of comparing the raw byte
    to a `PlayerId`; and a positive-control assertion now requires player
    `orderAck`s to be accepted, so the audit cannot regress to a no-op.
    `connection.test.ts:194` numeric cast → `parsePlayerId('Player000001')`.
  - **R004 (F2)** — corrected stale `server.ts` join-seat comments (no
    requested-seat resolution since #74), the `broadcast.ts` view-cache comment
    (`playerId.toString()` → canonical `PlayerId`), tightened `validate.ts`'s
    optional `guestPlayerId` to reject `null` (absent or canonical only), and
    reworded `specs/004-multiplayer-networking/data-model.md` §4.4
    `SeatRecord.playerId` to the canonical 12-char universal ID.
  - **R005 (F3)** — added negative tests for the optional-identity branches
    (`claim` not an object; `guestPlayerId` null; `handle` not a string) and the
    non-string `validateVersion` path; removed the unreachable non-nullable
    `FieldKind` `'player-id'` case in `validateEnvelope` (only
    `OrderFieldSpec` uses that kind) rather than leave dead, uncovered code.
  - **R006 (optional evaluation)** — reserving `SPECTATOR_VIEW_PLAYER_ID`
    (`Spectator001`) against matchmaking generation was evaluated and
    deliberately NOT implemented: allocation is CSPRNG over 2^72 values, the
    sentinel is never registered in a match, and fog's `{ spectator: true }`
    branch ignores it, so a collision carries no authority or leakage risk;
    reserving would invert the package dependency direction for no benefit.
  - **Verification**: networking typecheck, lint, `format:check`, tsup build
    (JS + DTS) clean; **324 tests / 35 files passing** (was 319 — +1 B2
    regression, +4 validate/version negatives minus none), coverage
    91.31 / 83.46 / 97.66 / 91.34 (stmts/branches/funcs/lines), all ≥80%;
    matchmaking `test:conformance` 7/7; identity-migration guard shows
    **console-only** violations (2 × `as GuestPlayerId` in
    `console/src/net/lobby-storage.ts:218,227` — Wave 7); `git diff --check`
    clean.

- **Wave 7 — complete (console state, UI, and mounted routing, T036–T039)**:
  the console now keys every identity surface by the server-issued
  `PlayerId`; the browser never mints identity.
  - **T036 (contracts/state/net)**:
    - `ConsoleSession` drops the seat-ordered `opponents: string[]` and gains
      `participants: ReadonlyArray<ConsoleParticipant>` (`{ id, name, isLocal }`
      in placement-slot order) + `playerNames: ReadonlyMap<PlayerId, string>`
      (only real handles — the engine's raw-ID placeholder is deliberately
      omitted so the ID can render as the fallback, never as a handle).
    - `DEFAULT_PLAYER_COLORS: Record<PlayerId, string>` (numeric keys 1–4)
      replaced by `PLAYER_COLOR_PALETTE: ReadonlyArray<string>`; `buildMapView`
      builds `playerColors` from `PlayerView.config.playerIds` (new
      `playerColorsFor`), so colors are keyed by ID, never seat.
    - `CONSOLE_API_VERSION` 0.3.0 → 0.4.0 (breaking public-session surface).
    - `ConsoleClientConfig.requestedSeat?: number` removed from both the local
      contract mirror and `specs/005-client-console/contracts/` (byte-identity
      conformance preserved; the wire field was already removed in Wave 6).
    - Reducer `joined` keys participants by ID in `view.config.playerIds` order
      and stores only real handles; `resolveName`/label fallbacks return the
      canonical ID (no fabricated "Player N"); spectator fold mirrors this.
    - **Guest-ID lifecycle end state**: `lobby-storage.ts` no longer mints
      (`mintGuestClaimId`/`GuestClaimIdCrypto` deleted); `StoredLobbyClaim.guestPlayerId`
      is `GuestPlayerId | null` and is validated with the canonical
      `isGuestPlayerId` (not `length > 0`). First connect sends
      `lobbyIdentity` with an EMPTY claim; the server allocates and returns the
      id on the directed `identity` event; the client adopts + persists it and
      re-presents it on later connects as advisory correlation only. `hasClaim`
      now means "a server-issued id is known". `@europa/core` added as a direct
      console dependency for the canonical validator.
  - **T037 (render/UI)**: participant rows key/render by `PlayerId`
    (`data-europa-player-id`), every server name/ID is `<bdi>`-isolated, sidebar
    "You:", cell aria labels, and the game-over winner all fall back to the
    canonical ID; help-overlay player color resolves from the live
    `MapView.playerColors`. Spectator inert controls unchanged (FR-021); a11y
    semantics preserved (a11y suite 69/69).
  - **T038 (routing/handoffs)**: verified-only. Create/join/spectate/share-link
    handoffs already run through the mounted TanStack Router tree; the
    `connection === 'ready'` AND `identityStatus === 'named'` deferred-resolution
    gates (feature 015 live-smoke fix) are intact; no raw `history` mutation and
    no legacy direct mounting. No `src/routing/` source change was needed.
  - **T039 (tests)**: all console fixtures migrated to canonical explicit IDs
    (`TEST_PLAYER_1..4` via `parsePlayerId`); the wire-shaped test frames now
    carry canonical identities (the real 0.3.0 validator rejects numeric
    `playerId`, which is why the pre-wave suites timed out). New
    `tests/unit/state/identity-authority.test.ts` pins forged/mismatched-ID
    order denial + ID preservation across reconnect, tick, terminal, rematch,
    and spectator state. The 1000-tick determinism golden hash was **regenerated**
    with `scripts/generate-determinism-golden.ts` (the identity-keyed session
    serialization legitimately changed the hashed output); the test re-runs
    green and is stable.
  - **Cross-package finding (report only, not fixed)**: `@europa/design`'s game
    primitives (`EuropaTroopChip`, `EuropaCityMarker`) still model `owner` as a
    numeric `1 | 2 | 3 | 4` and `specs/014-shared-ui-components/spec.md` still
    documents that shape truthfully. The console does not use those primitives
    with player identities (only generic components), so nothing is broken today;
    migrating design's owner props to `PlayerId` (or removing the numeric
    contract) is a separate design-owned change.
  - **Verification**: console typecheck + `typecheck:conformance`, lint,
    `format:check`, and build clean; node-mode coverage suite green (1,185 tests)
    at 89.52% stmts / 83.04% branches / 86.77% funcs / 89.53% lines (all ≥80%);
    browser component 237/237; a11y 69/69; identity-migration guard reports
    **ZERO console violations** (the whole repository guard is now green).
    E2E (T040) was out of scope for this dispatch.

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
