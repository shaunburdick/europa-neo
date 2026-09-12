# `@europa/core`

Europa Neo shared foundation — the smallest dependency-free layer that
`@europa/engine` and `@europa/terrain` both build on. It exists to break
the engine ↔ terrain circular build dependency (issue #93) and to hold
the single source of truth for cross-package primitives:

- **Foundational types** — `Board`, `Cell`, `CityPlacement`, `Coord`,
  `Direction`, `MatchConfig`, `Rng`, `Terrain`, and `PlayerId`.
- **Canonical player identity** (issue #74) — the 12-character branded
  identifier, its validators, and the CSPRNG generator.
- **Deterministic PRNG** — the `sfc32` generator and `xmur3` seed hashing
  shared by terrain generation and the engine tick ([`rng.ts`](src/rng.ts)).
- **Pipe-flow formula** — `flowRateForDelta` and the shared flow/engine
  constants ([`flow-rate.ts`](src/flow-rate.ts)).
- **`ENGINE_API_VERSION`** — the coordinated shared type-surface version.

This package has **zero workspace dependencies** and is safe to bundle
for the browser.

---

## Install

From the monorepo root:

```bash
pnpm install
```

## Build

```bash
pnpm --filter @europa/core build
```

Produces `dist/index.js` (ESM) and `dist/index.d.ts` (types) via `tsup`.

## Test

```bash
pnpm --filter @europa/core test
```

Coverage thresholds are 80% on every metric (constitution Principle III
merge gate):

```bash
pnpm --filter @europa/core coverage
```

---

## Canonical player identity

One server-issued, opaque, 12-character identifier is shared by the
active lobby identity (`GuestPlayerId`) and the in-match engine identity
(`PlayerId`). It is defined in [`src/player-id.ts`](src/player-id.ts) and
amends feature 001 to v1.13 (spec `FR-020`..`FR-022`).

| Constant             | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| `PLAYER_ID_ALPHABET` | `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-` |
| `PLAYER_ID_LENGTH`   | `12`                                                     |
| `PLAYER_ID_BITS`     | `72` (12 × 6)                                            |
| `PLAYER_ID_PATTERN`  | `/^[A-Za-z0-9_-]{12}$/`                                  |

> **IDs are correlation metadata — never credentials.** A valid-looking
> `PlayerId` grants no seat, order, view, reconnect, eviction, or forfeit
> authority. `SessionToken` / `ReconnectToken` remain the only bearer
> credentials; they must never be derived from an ID or replaced by one.
> IDs are non-secret, so they may appear in logs and shareable match URLs
> — tokens must not.

### Types

```ts
import type { GuestPlayerId, PlayerId } from '@europa/core';
```

Both are branded (`string & { readonly __brand: … }`) with the same
canonical representation but distinct brands, so a guest identity and a
match-scoped player identity cannot be interchanged without an explicit,
audited conversion. The brands are witnessed at compile time in
[`src/player-id.contract.ts`](src/player-id.contract.ts).

### Validation

```ts
import { isPlayerId, parsePlayerId, isGuestPlayerId, parseGuestPlayerId } from '@europa/core';

isPlayerId('------------');       // true  (non-throwing type guard)
parsePlayerId(raw);               // PlayerId, or throws InvalidPlayerIdError

isGuestPlayerId('------------');  // true
parseGuestPlayerId(raw);          // GuestPlayerId, or throws InvalidPlayerIdError
```

Validation is mandatory at every external trust boundary. Numbers are
always rejected — a numeric value is never coerced or stringified, even
when it lies in `1..4`.

### Generation

```ts
import { generatePlayerId } from '@europa/core';

const id = generatePlayerId();                          // platform CSPRNG
const testId = generatePlayerId(source, isActive, { maxAttempts: 8 });
```

`generatePlayerId(source?, isActive?, options?)` consumes 9 platform
CSPRNG bytes and packs them into 12 six-bit alphabet symbols (exactly 72
bits). Because 256 = 4 × 64, the six-bit mapping is exactly uniform — no
modulo bias. Candidate-level rejection sampling redraws whenever the
optional `isActive` predicate reports a collision, bounded by
`maxAttempts`, and fails closed with `PlayerIdCollisionError` on
exhaustion. Entropy failures throw `PlayerIdEntropyError`.

**Generation never runs inside tick or replay logic.** It is an identity
trust-boundary operation; the seeded simulation PRNG is never consulted
for it.

The production entropy source is `globalThis.crypto.getRandomValues`
(Web Crypto — Node ≥ 19 and all modern browsers), chosen over a static
`node:crypto` import to keep the package browser-safe and
dependency-free. Tests inject a deterministic `RandomBytesSource`.

## API versioning

`ENGINE_API_VERSION` tracks the shared type surface. It is bumped on
every breaking change and update in lockstep across engine, terrain, and
their contract mirrors. `PlayerId` becoming a branded string (issue #74)
bumped it `0.1.0` → `0.2.0`.
