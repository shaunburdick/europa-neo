# Contract: reducer correlation scope (`ReduceOptions.correlation`)

**Spec**: `specs/005-client-console/spec.md` v1.12 FR-045 (issue #153 `F-CON-ST-003`; issue #153 `F-CON-ST-004` — its **`reduce()`-level** same-reference AC only; the wire half of ST-004 is already fixed on `main` and is a regression guard)
**Canonical type**: `packages/console/src/contracts/console-state.ts` (`ReduceOptions`)
**Status**: draft (Phase-4 artifact; UNAPPROVED)

## What changed

`ReduceOptions` gains one optional member:

```ts
export interface ReduceOptions {
    readonly nowMs: number;
    readonly rngSeed?: number;
    /** Per-store pending-order correlation + ActionId counter (FR-045). */
    readonly correlation?: ReducerCorrelation;
}
```

`ReducerCorrelation` is the store-scoped home of the two pieces of
mutable state that previously lived at module scope in
`packages/console/src/state/reducer.ts`:

| Member | Was | Now |
|---|---|---|
| `lastActionId` | `reducer.ts:63` (`let` at module scope) | `correlation.lastActionId` |
| `pendingOrders` (+ `PENDING_ORDERS_CAP = 64` eviction) | `reducer.ts:74-77, 83-105` | `correlation.pendingOrders` |

## Boundary rules

1. **Purity**: `reduce(state, action, options)` continues to depend only
   on its three inputs. `options.correlation` *is* an input; two calls
   with equal `(state, action, correlation content)` are equal.
2. **Isolation**: `createConsoleStore` allocates exactly one bag per
   store and threads it through every `dispatch`. No module-scope
   table may be reintroduced — two stores in one module must not share
   an `ActionId` counter or a pending-order map.
3. **Fallback**: a `reduce()` call without `correlation` allocates an
   ephemeral bag for that call. Such a caller cannot correlate an ack
   across calls; hosts that need correlation MUST go through
   `createConsoleStore` (which is what `createConsole` does).
4. **Heartbeat identity (scoped to `pong`)**: the heartbeat echo returns
   the **same** `state` reference — `reduce` short-circuits before
   allocating `baseState`/`nextState`. That is what keeps subscribers
   from being notified by heartbeats. The guarantee covers `pong` only:
   other no-op arms (e.g. `socketClosed` while `status === 'game_over'`,
   `reducer.ts`) still return a freshly built state. Because the
   short-circuit runs before `reduce`'s lazy feedback prune, a `pong`
   dispatch defers that prune to the next dispatch that is **not a
   `pong` no-op** — other no-op arms still reach the prune.
5. **Visibility**: the allocator is exposed bag-bound as
   `ConsoleStore.allocateActionId` and is absent from `src/index.ts`, so
   the move is not a public-surface change.

## Versioning

No `CONSOLE_API_VERSION` bump. The bump policy is scoped verbatim to
"types or functions in `console-types.ts` and `console-api.ts`"
(`packages/console/src/contracts/console-types.ts:86-88`);
`console-state.ts` is outside that surface, and the change is additive
plus internal. PR #189 bumps the version to `0.5.0` in its own change
set — do not duplicate or inherit that bump during a rebase.

## Conformance

| Check | Test |
|---|---|
| Two stores do not share counters/pending maps | `tests/unit/state/reducer.test.ts` (N3) |
| Heartbeat echo returns the same reference | `tests/unit/state/reducer.test.ts` (N4) |
| Ack correlation resolves through the passed bag | `tests/unit/state/reducer.test.ts` (N3) |
| Host-order ids stay unique with gesture ids | `tests/unit/net/client-role.test.ts` (N5) |
| Version pins unchanged | `tests/integration/contract-conformance.test.ts` |
