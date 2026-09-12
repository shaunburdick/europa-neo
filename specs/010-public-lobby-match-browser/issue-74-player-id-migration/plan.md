# Implementation Plan: Universal Numeric PlayerId Replacement (Issue #74)

**Planning scope**: Cross-feature implementation plan for the approved amendments to
features 001, 002, 003, 004, 005, 006, 010, 013, and 015.

**Coordination layout**: These artifacts live under the existing Feature 010
directory because the lifecycle begins at the lobby identity boundary and Feature
010 already owns the cross-feature identity/visibility policy. This is a planning
coordination directory, not a new behavioral specification. The amended feature
specifications remain the normative requirements for each package.

**Implementation branch**: `issue-74-numeric-playerid` (already checked out for
planning; Phase 6 must use its delivery branch/worktree policy and must not land on
`main`).

## 1. Goal and non-goals

Replace numeric public `PlayerId` values with one server-generated, branded,
12-character identifier shared by the active lobby guest and the in-match player.
Keep numeric dense indexes only as private implementation details behind explicit
ID↔index mappings. Preserve deterministic simulation, terrain independence,
session/reconnect authentication, fog isolation, and mounted canonical router
handoffs.

This change is intentionally breaking for pre-1.0 public APIs and the gameplay
wire protocol. It does not add accounts, durable identity recovery, a new auth
system, a new runtime dependency, or a compatibility shim for numeric clients.

## 2. Constitution and AGENTS alignment

| Directive | Plan response |
| --- | --- |
| Strict TypeScript, no `any` or suppressions | Branded types, explicit guards, strict conformance programs, and no lint/type suppressions. |
| Server-authoritative deterministic simulation | IDs are generated only at trust boundaries; tick/replay logic receives explicit IDs and uses deterministic UTF-16 code-unit ordering. |
| ≥80% game-logic coverage | Core ID validation/generation, registry, serialization, fog resolution, and migration edge cases receive unit, integration, replay, and security coverage. |
| Specs as documentation | Contract mirrors and this coordination bundle are updated with implementation; no new behavioral spec is created. |
| Simplicity | One small internal rejection-sampling generator; no direct `nanoid` runtime dependency; no speculative persistence or account abstraction. |
| Accessibility | Console changes retain handle-first labels and existing UI semantics; ID fallback text remains readable and does not alter control behavior. |
| Self-hosting | Uses platform CSPRNG APIs already available to server/runtime boundaries; no hosted service or registry dependency. |
| AGENTS determinism/licensing rules | No ID-derived terrain or simulation randomness; no edits or copied code from `europa-source/`; verification uses repository gates. |

## 3. Architecture

### 3.1 Identity authority

`@europa/core` owns the shared branded `PlayerId` type, canonical validator, and
small CSPRNG generator. The generator consumes 9 random bytes at a time and uses
rejection sampling to avoid modulo bias when mapping bytes to the 64-character
alphabet. The API accepts an injected CSPRNG source for tests and uses the
platform CSPRNG in production. Generation is outside the engine tick and replay
paths.

`GuestPlayerId` is structurally branded with the same canonical representation at
the lobby boundary. The matchmaker is the authority that creates an active guest
identity, reserves it in the identity registry, and passes the same value to
engine initialization. Client-provided IDs are correlation data only and are never
accepted as identity proof.

### 3.2 Engine representation

The engine public model uses `PlayerId` strings in players, orders, events,
results, replay inputs, and serialized payloads. `World` owns an immutable,
explicit registry:

```text
PlayerId <-> DensePlayerIndex (0..N-1)
```

The registry validates canonical, unique IDs, constructs a deterministic sorted
ID order using an explicit UTF-16 code-unit comparator, and exposes both lookup
directions. Typed arrays and hot-path loops use the dense index only after a
checked lookup. No caller infers an index from a string, seat position, or array
position.

### 3.3 Terrain boundary

Terrain remains identity-agnostic. Generation receives player count/settings and
uses dense numeric slots only for symmetry and placement. It neither accepts nor
stores universal IDs. The caller maps ordered starting-city bands to explicit
player IDs when creating the engine world. A changed ID list with the same seed,
board size, player count, and settings produces the same terrain bytes.

### 3.4 Fog and networking

Fog resolves a requested universal ID through the authoritative engine registry
before computing a view. Unknown/forged IDs fail closed. Networking carries the
canonical string ID in every gameplay identity field and bumps the wire major
version. Version rejection occurs before payload interpretation; numeric clients
are not parsed through a migration path. Session and reconnect tokens remain
separate bearer credentials and are the only proof accepted for privileged
operations.

### 3.5 Matchmaking and console

Matchmaking stores the universal ID on guest identity, seat, engine config,
terminal result, rematch participant records, and reconnect associations. Seat
indexes remain presentation/lifecycle coordinates, not identity. Console state
keys colors, labels, participants, ownership, and terminal/rematch state by
server-provided IDs; handles remain preferred labels. Create/join/spectate and
share-link completion use the already-mounted TanStack Router route tree and
assert both final URL and mounted view.

## 4. Migration strategy

1. **Establish shared primitives** in core and canonical contract mirrors.
2. **Migrate engine internals** with the registry and explicit serialization table;
   update replay fixtures to carry explicit IDs.
3. **Migrate terrain and fog** to their independent/authoritative boundaries.
4. **Migrate matchmaking** so one active guest ID flows into a seat and engine.
5. **Migrate networking** and reject the old major version before parsing payloads.
6. **Migrate console and router handoffs**; preserve the mounted router lifecycle.
7. **Sweep fixtures, conformance mirrors, security tests, docs, and version
   surfaces**, then run full verification.

There is no dual-format production period. During implementation, tests may use
deterministic explicit fixture IDs, but all fixture IDs must satisfy the canonical
validator. Any old numeric fixture or serialized payload is a deliberate negative
test, never a compatibility fixture.

## 5. Package/file ownership

| Owner | Planned implementation surfaces | Required verification |
| --- | --- | --- |
| Core | `packages/core/src/player-id.ts`, `types.ts`, `index.ts` and unit tests | ID format, rejection sampling, injectable CSPRNG, collision-independent generation, API/version conformance |
| Engine | `src/playerRegistry.ts`, create/read/resolve/serialize/replay/contracts/scripts/tests | Registry bijection, deterministic ordering, ID-table serialization, unknown/duplicate/missing/extra rejection, replay determinism |
| Terrain | city placement/generation/contracts/tests | No ID dependency; unchanged seed/settings output; contract drift |
| Fog | player-view/visible-set/contracts/tests | Authoritative ID lookup, unknown/forged rejection, no hidden-state leakage |
| Matchmaking | identity registry, seat/match lifecycle, id generator, contracts/tests | One active ID per guest/seat, persistence across reconnect/rematch, collision fail-closed, token separation |
| Networking | wire contracts/version/validation/server/reconnect/match channel/tests | Major-version rejection before decode, canonical IDs, explicit UTF-16 ordering, bearer-only auth |
| Console | contracts/reducer/render/net/router tests and fixtures | ID ownership, handle-first UI, spectator behavior, canonical mounted route handoffs |
| Documentation/CI | package READMEs, spec mirrors, conformance/version guards, quickstart evidence | No stale numeric public contract, no credential leakage, full `pnpm verify` |

## 6. Versioning and contract policy

The engine/core and terrain shared contract version must be coordinated. The
networking protocol receives the approved breaking major bump and rejects old
numeric clients before payload interpretation. Console/networking compatibility
tests must use the new protocol version. No numeric-to-string adapter is allowed
in production. The application release version remains independent from protocol
version.

## 7. Acceptance verification

Phase 6 is complete only when all of the following are demonstrated:

- Canonical IDs are exactly 12 characters from `A-Za-z0-9_-`; malformed,
  numeric, duplicate, missing, and extra IDs fail closed.
- Generated IDs use CSPRNG rejection sampling, collision retry/fail-closed logic,
  and no direct runtime `nanoid` dependency.
- Identical explicit ID fixtures produce byte-identical engine ticks, replay
  results, serialization round trips, and ordering on every locale.
- Terrain output is byte-identical when only IDs change.
- Fog cannot be selected by a forged/unknown ID and exposes no hidden state.
- Lobby→seat→engine→wire→console→terminal→reconnect/rematch preserves the same
  ID while the guest identity is active.
- Session/reconnect credentials remain mandatory and absent from logs and risky
  documentation/URLs.
- Numeric clients are rejected at the version boundary before payload parsing.
- Create/join/spectate/share-link flows end in mounted canonical router paths.
- Relevant package coverage remains ≥80% on every required metric; typecheck,
  lint, format, build, conformance, security, replay, E2E, and self-host checks
  pass.

## 8. Known risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Hidden numeric assumptions in fixtures or comments | Repository-wide typed search plus compile-time contract witnesses and negative wire tests. |
| Index order differs from insertion order | Registry tests use IDs whose UTF-16 order differs from seat order; all callers use explicit lookup. |
| IDs accidentally enter deterministic terrain/tick RNG | Boundary tests vary IDs while hashing terrain/tick outputs; code review forbids generator calls in simulation. |
| ID mistaken for bearer credential | Security tests attempt ID-only identity mutation, seat claim, reconnect, order, and view selection; logs are scanned for tokens. |
| Major-version rollout mismatch | Raw old-version frames are tested against real server admission and must be rejected before payload validation. |
| Router handoff race or bypass | Mounted-router E2E tests assert final pathname and rendered route after create/join/spectate/share-link flows. |
| Closed PR #113 defects recur | Explicit tasks cover `localeCompare`, temporary serialization IDs, numeric fallback fixtures, terrain contract assumptions, and unverified router/authority paths; each is a review gate. |

## 9. PM orchestration guidance

Use the waves in `tasks.md`. Waves 1–3 establish foundations and can be partly
parallelized by package. Waves 4–6 depend on the shared types and contract
decisions. Wave 7 is cross-package integration/security/replay/router validation;
Wave 8 is documentation and final gates. A task marked `[P]` is safe to dispatch
only when its listed files do not overlap another task in the same wave.
