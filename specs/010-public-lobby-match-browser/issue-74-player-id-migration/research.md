# Research: Universal PlayerId Migration

## Approved constraints

- Universal active identity: one `GuestPlayerId`/`PlayerId` value.
- Canonical form: `^[A-Za-z0-9_-]{12}$`, 64-symbol alphabet, 72 bits.
- IDs are non-secret correlation metadata; session/reconnect tokens remain bearer
  proof and are never replaced by IDs.
- CSPRNG rejection sampling; collision retry then fail closed.
- No direct runtime `nanoid` dependency.
- Explicit UTF-16 code-unit ordering; never `localeCompare`.
- Dense indexes are private and require explicit bijections.
- Terrain is ID-independent.
- Breaking network major rejects numeric clients before payload interpretation.
- Canonical router handoffs remain mounted-router operations.

## Current repository findings

1. `@europa/core` currently defines `PlayerId` as `1 | 2 | 3 | 4`, and the
   shared core type surface is already the right dependency-free location for a
   branded identity primitive.
2. `@europa/networking/src/ids.ts` already centralizes CSPRNG identity helpers,
   but currently only covers UUID session/connection artifacts. It must not be
   reused to blur ID and credential semantics.
3. Matchmaking already owns an ephemeral guest identity registry and lifecycle
   timestamps. It is the correct authority for allocating and retaining the
   universal ID, while the engine receives it explicitly at start.
4. Engine typed-array state and terrain placement are performance-sensitive;
   retaining dense internal indexes is compatible with the amended contracts if
   the mapping is explicit and public APIs never expose index assumptions.
5. Networking contains both canonical source contracts and mirrored spec
   contracts plus conformance tests. Both must change atomically with the major
   version.
6. Console routing is mounted through TanStack Router. Existing raw-history
   migration work means this issue must extend the route tests, not introduce a
   second navigation mechanism.
7. Test fixtures still contain intentionally numeric assumptions (including
   `guest-0001`-style identity fixtures and numeric seat IDs). They need valid
   deterministic IDs or explicit numeric negative cases.

## Closed PR #113 review context

PR #113 was closed and is research input only. Its useful architecture was the
internal-index/external-ID split and an engine player registry. Its findings to
avoid are:

- `localeCompare` is not a deterministic ordering primitive across locales;
  use an explicit UTF-16 comparator.
- Temporary/generated IDs during serialization or replay violate the explicit-ID
  requirement and can change identity across round trips.
- Numeric fallback fixtures and `playerCount`-derived public identity leave
  migration holes.
- Terrain must not depend on universal IDs; its contracts should remain dense,
  ID-agnostic placement contracts.
- Test/mocking updates must cover the real authority path, not only type casts.
- Version rejection and router mounting require end-to-end tests, not just mirror
  updates.

## Options considered

### Direct `nanoid` dependency — rejected

The product decision explicitly forbids a direct runtime dependency. The observed
transitive package is a tooling dependency and is not an acceptable runtime
contract. A small local generator is easier to audit and self-host.

### Random bytes modulo 64 — rejected

Although simple, modulo mapping introduces bias unless the source range is a
multiple of 64. Rejection sampling consumes only values below the largest whole
multiple, preserving uniformity.

### Numeric compatibility shim — rejected

The amended networking contract is intentionally breaking. Accepting numbers in
the parser would contradict the major-version boundary and create ambiguous
authorization/identity behavior.

### IDs as ordering tokens — rejected

Generation order is not a stable ordering contract. Canonical deterministic
ordering is an explicit UTF-16 code-unit comparator over validated IDs; seat/index
order is separately represented.

### New feature spec — rejected

The approved requirements amend existing feature domains. This bundle coordinates
implementation under Feature 010 without creating a competing behavioral source
of truth.

## Verification research to carry into Phase 6

- Use an injected byte source to prove rejection sampling and deterministic test
  vectors without weakening production entropy.
- Include IDs with ASCII edge ordering (`Z`, `_`, `a`, `-`) and differing UTF-16
  surrogate-containing *invalid* values to prove validation happens before sort.
- Run serializer round trips with permuted input order and assert canonical table
  order plus stable bytes.
- Run locale matrix tests by changing process locale where available and compare
  hashes; the comparator must not consult locale facilities.
- Exercise the actual mounted router and real WebSocket admission for the final
  integration gate.
