# Contract: Canonical Identity Generation and Validation

## Normative constants

```text
PLAYER_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
PLAYER_ID_LENGTH = 12
PLAYER_ID_BITS = 72
PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/
```

The exported type is opaque/branded. Runtime validation is mandatory at every
input boundary. The generator is server-side and uses a platform CSPRNG with
rejection sampling. It retries active-set collisions and fails closed when the
configured retry budget is exhausted. No direct runtime `nanoid` import is
permitted.

## Required API behavior

- `isPlayerId(value: unknown): value is PlayerId` is non-throwing and rejects all
  numbers and non-canonical strings.
- `parsePlayerId(value: unknown): PlayerId` returns only validated IDs and throws
  a typed/domain error otherwise.
- `generatePlayerId(source?, isActive?, options?): PlayerId` never reads a clock,
  uses seeded simulation RNG, or falls back to weak randomness.
- A separately branded `GuestPlayerId` may share the representation but must not
  be confused with `SessionToken`, `ReconnectToken`, `MatchId`, or `ConnectionId`.

## Test vectors

Valid (all exactly 12 characters): `A0b_-9XyZ120`, `------------`, `____________`, `aBcDeF012_-x`.

Invalid: `1234`, `1234567890123`, `12345678901!`, `guest-0001`, `A BcDeF012_-`,
`éBcDeF012_-`, numeric `1`, `null`, and objects. Also invalid: the 11-character
near-misses `A0b_-9XyZ12` and `aBcDeF012_-`.
