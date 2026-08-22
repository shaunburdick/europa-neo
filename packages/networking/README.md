# @europa/networking

Real-time multiplayer networking & transport for Europa Neo — the
server-authoritative WebSocket channel that accepts orders, runs the
deterministic tick loop, and broadcasts fog-filtered `PlayerView`s.

**Status: Phase 2 (Foundational) landed.** The package currently ships
the wire-protocol contracts, tunable constants, JSON framing, envelope
validation, protocol errors, branded identity generation, and the tick
clock. The match server (`createMatchServer`), reconnection, and
spectator support land with US1–US3 (spec phases 3–5).

## Development

```bash
pnpm install                              # from the repo root
pnpm --filter @europa/networking build    # ESM bundle + d.ts (tsup)
pnpm --filter @europa/networking test     # vitest run
pnpm --filter @europa/networking test --coverage   # v8 coverage, ≥80% gate
pnpm --filter @europa/networking lint     # biome check
pnpm --filter @europa/networking typecheck
```

## Public API (Phase 2)

Import everything from the package root:

```ts
import {
  NETWORK_API_VERSION,     // '0.1.0' — wire-protocol version
  NETWORK_CONSTANTS,       // single tunable-constants location
  encodeFrame,             // envelope → wire JSON
  decodeFrame,             // wire JSON → validated envelope (throws)
  tryDecodeFrame,          // non-throwing variant for ws handlers
  validateEnvelope,        // schema guard (asserts)
  validateVersion,         // major-version comparison (FR-004)
  NetworkError,            // protocol-level rejection hierarchy
  generateSessionToken,    // branded v4 UUID seat claims (FR-007)
  generateConnectionId,    // branded transport handles
  createTickClock,         // setInterval scheduler primitive
} from '@europa/networking';
```

Types (`ProtocolEnvelope`, `MessageKind`, `Server`, `ServerConfig`,
`MatchmakerBridge`, …) are re-exported from the same root import; see
`src/index.ts` and the source-of-truth contracts at
`.specify/features/004-multiplayer-networking/contracts/`.

## Determinism

The engine's simulation stays pure (constitution Principle II):
networking never feeds wall-clock or randomness into game state.
`createTickClock` is the sanctioned wall-clock boundary — it passes
`nowMs` *into* handlers rather than letting them read clocks. Session
tokens use the platform CSPRNG but are identity artifacts only; they
never enter simulation state.

## Conformance

The files in `src/contracts/` are byte-identical mirrors of the spec
contracts under `.specify/features/004-multiplayer-networking/contracts/`
(local copies exist because `tsc`'s `rootDir` rejects imports from
outside the package). Drift between mirror and source-of-truth is a
bug caught by the Polish-phase conformance test (tasks.md T050).

## Self-hosting

Zero external service dependencies: one Node process, one optional TCP
port. `permessage-deflate` will ship disabled by default (zlib memory
fragmentation risk; see plan.md "Risk & Open Questions").
