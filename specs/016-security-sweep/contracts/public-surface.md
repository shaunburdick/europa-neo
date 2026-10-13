# Contract: Public package surface and version

Covers 005 FR-038 + Implementation Note 17 (corrected). File: `packages/console/src/index.ts`, `packages/console/src/contracts/console-types.ts`.

## Barrel rule

The public `@europa/console` barrel MUST NOT export any declaration marked `@internal`:

- **Removed**: the `ConsoleRuntime` **interface** re-export at `index.ts:217` (`export type { ConsoleRuntime as ConsoleRuntimeContract }` — the interface in `contracts/console-api.ts` carries the `@internal — declared for tests` tag), plus any other `@internal`-tagged declarations that surface through the barrel (e.g., test-only helpers mirrored from `contracts/console-to-networking.ts`).
- **Retained, expressly out of scope**: the `ConsoleRuntime` **class** value export from `./runtime` (`index.ts:28`) — not `@internal`-tagged; its embedding surface stays a future API decision.
- Test-only surfaces remain reachable through dedicated test entry points or direct module imports, never the public API.

## Version

| Item | Value |
|---|---|
| `CONSOLE_API_VERSION` before | `0.4.1` (`contracts/console-types.ts:114`) |
| `CONSOLE_API_VERSION` after | **`0.5.0`** — PO-confirmed (clarifications D5; do not re-open) |
| Rationale | Removing public exports is a breaking public-surface change under the console contract; 0.x minor-line = breaking. Bump lands in the same change set as the removal (005 FR-038). |
| Conformance pin | `tests/integration/contract-conformance.test.ts:352` updates to `'0.5.0'` |
| Unchanged | `NETWORK_API_VERSION`, `APP_VERSION` |

## Note 17 truth correction (005 v1.11, spec-text only)

Implementation Note 17 already amended (unshipped v1.11): shipped truth at amendment time is `CONSOLE_API_VERSION 0.4.1` and `minCellPx 32`; the former "0.2.0 / 12→16" text is marked historical. **Same-change-set obligation (Gate 3 Q2, constitution IV)**: because this sweep ships the literal at **0.5.0**, the same change set updates Note 17's shipped-literal clause via a dated in-entry sub-entry under the unshipped v1.11 note (the note's own "MUST quote the shipped literal" mechanism forces this); manifest row A-07 describes the 0.5.0 end state.

## Conformance pins

- Type-surface test: `ConsoleRuntimeContract` and the other removed `@internal` names are unimportable from `@europa/console`'s barrel (the class `ConsoleRuntime` still is).
- Existing integration conformance test passes with `'0.5.0'`.
