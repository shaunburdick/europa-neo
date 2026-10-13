# Contract: Console network clients (hardening)

Covers 005 FR-028…FR-036. Files: `packages/console/src/net/{client,ws-match-client,ws-lobby-client,connection,envelope-to-event,rehydrate-wire-views}.ts`.

## Send contract (FR-028 + AD-4 wording resolution)

| Send kind | Failure behavior |
|---|---|
| Promise-returning (`sendOrder`, join/leave/spectate submissions, promise-based lobby actions) | Transport cannot accept (socket `null`, `CONNECTING`, `CLOSING`, torn down) → returned promise **rejects**; no synchronous throw escapes into React handlers or any synchronous caller; failure surfaces through the FR-008 status/feedback path |
| Void / fire-and-forget (heartbeats, void lobby actions) | **MUST NOT throw** synchronously; **MUST log** the failure via the existing redaction-gated verbose logger; no promise is created |

## Correlation map (FR-029)

- Instance-scoped `Map<SequenceNumber, PendingAck>`; cap **64** (consistent with `PENDING_ORDERS_CAP`), documented constant in the net constants location.
- Consumed on matching ack; pruned on correlation timeout, disconnect, teardown; late/duplicate ack never re-correlates a consumed or evicted entry; growth flat across N acks (unit-tested).

## Mount/teardown (FR-030)

- Every `await` in mount paths re-checks the torn-down flag; post-teardown mount attempts throw synchronously; teardown racing a mount handshake leaves zero roots, listeners, timers.

## Establish timeout (FR-031)

- `connect()` seam-injected timer; default `ESTABLISH_TIMEOUT_MS = 10_000` in `contracts/console-types.ts` (console's single constants file), documented in 005 v1.11.
- Expiry → connect promise settles failed → honest failed/retrying UI status (FR-008). Never fires after successful establish; cleared on teardown.

## Inbound validation (FR-032)

- Every inbound frame structurally validated against its declared kind — including nested discriminated `lobbyEvent` payloads and nested variant fields — **before** dispatch.
- Malformed frame/payload → dropped + diagnostic log; never throws out of `onmessage`, never corrupts state, never unmounts the tree, never severs the connection (004 FR-010 discipline).

## Instance isolation (FR-033)

- `nextWireSeq`, `lastCapturedSeatSessionToken` (bearer), correlation maps, sockets, timers: all instance-scoped; module-global mutable state prohibited.
- Pinned by a two-instance interleaved-lifecycle test, including seat-token unreadability across instances.

## Lobby claim adoption (#146 client side — see data-model §3, plan AD-9/Q1a)

- `wireClaim()` includes `resumeSecret` when the stored claim has one; the directed `identity` event's secret (establishment path only, W-9) overwrites the stored pair (single-epoch).
- **A secret-less identity event (rename path) preserves the stored secret**: `adoptServerGuestId` and the `applyIdentity` claim rebuild carry `resumeSecret` forward unchanged; only `invalidateClaim` clears it.
- Pinned by: client unit (secret-less event → secret intact; secret-bearing event → overwritten) and the rename → reload → restore scenario (SC-017 trial-a extension).

## Stale-socket guards (FR-034)

- `onopen`/`onmessage`/`onclose`/`onerror` verify the event's socket is the client's current socket before acting; superseded/torn-down socket events ignored (extends the guard `onclose` already has).

## Rehydration (FR-035)

- Copy-on-write, allocation-free no-op path: unchanged view envelope returned **by reference** with zero new allocations; repair copies only the changed spine; decoded payload never mutated; runs only for view-bearing payload kinds.

## Status mapping (FR-036)

- `consoleStatusFromConnectionState`: no default-return-input branch; unknown states hit an explicit `never` sink that throws.

## Conformance pins

- One targeted unit/component test per row above, each failing pre-fix (map in `plan.md`).
- Two-instance isolation test; fake-timer establish-timeout test; nested-`lobbyEvent` malformed-drop test; reference-identity no-op rehydration test.
