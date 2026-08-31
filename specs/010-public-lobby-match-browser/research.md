# Research: Public Lobby & Match Browser

## Identity-visibility correction (2026-08-30)

The approved correction in commit `ecfcfa5` is a policy/assertion migration,
not a new feature. Feature 010 remains the canonical owner because it owns the
identity/lobby checker and affected identity contracts. The implementation must
distinguish three independent boundaries:

1. `GuestPlayerId`, guest identity IDs, `MatchId`, and gameplay `PlayerId` are
   non-secret references. Existing wire fields, URLs, logs, diagnostics, and
   documentation may carry them for correlation.
2. Accepted handles are preferred in human-facing labels; a generic label or ID
   fallback is valid when no handle exists.
3. `sessionToken` and `reconnectToken` are bearer credentials. They remain
   prohibited in risky URLs, logs, diagnostics, and documentation examples.

The correction must not turn an ID into an authority claim. Private-match
existence resistance, server-resolved seat/order authority, reconnect validation,
and fog filtering remain separate security invariants.

### Residual contradictions found (historical inventory)

> This section records the pre-correction research inventory. It is not a
> statement of current policy; C-002–C-007 corrected the listed normative
> surfaces, and C-008 records the residual sweep below.

- The pre-correction checker banned player-facing ID field/term names and
  implementation-surface ID examples.
- Pre-correction source JSDoc/comments said IDs were internal-only or never rendered in
  `packages/matchmaking/src/contracts/lobby-api.ts`, `lobby-types.ts`,
  `src/internal/{guestPlayerIdentity,playerSession,seatRecord}.ts`, and
  `packages/networking/src/contracts/network-types.ts` (and its Feature 004
  contract mirror), plus `packages/console/src/internal/lobby-runtime.tsx`.
- Pre-correction harness assertions/comments encoded the old policy in matchmaking
  `lobby-conformance.test.ts`, `identityAssociation.test.ts`,
  `lobby.serverAuthority.test.ts`, and networking `server-lobby.test.ts`;
  the console lobby component test also named a no-ID rendering scan.
- Historical/operational wording was identified in Feature 010 tasks/orchestration/
  handoff, Feature 012 tasks (including its completed zero-ID checker result),
  and any manual text found by the targeted sweep. Historical results are
  relabelled rather than silently deleted.

The already-corrected README and cross-feature spec paragraphs are review
surfaces, not a reason to invent runtime behavior. Feature 011 contributes the
log-security clarification: permitting IDs in logs does not permit credentials.

## Findings

1. **Reuse the existing WebSocket.** Feature 004 already owns framing,
   version validation, heartbeats, reconnect grace, and server connection state.
   Adding a discriminated lobby message family avoids a second transport and
   keeps self-hosting to one listener. A separate HTTP polling API was rejected:
   it duplicates updates and complicates action races.
2. **Keep matchmaking as lifecycle authority.** Feature 006 already provides
   public projections, settings validation, auto-start, lazy empty/results GC,
   and server bridge events. Feature 010 should wrap/extend those seams rather
   than fork match state or invent another cleanup clock.
3. **Identity is distinct from networking `SessionToken`.** The guest identity
   survives a temporary disconnect and is browser-restorable; a session token
   authorizes one match seat. A `GuestPlayerId` brand is therefore separate from
   `PlayerSessionId`, `MatchId`, `ConnectionId`, and `SessionToken`.
4. **Handle uniqueness requires a normalized index.** Normalize with trim plus
   locale-independent Unicode case folding (`toLocaleLowerCase('und')`), reject
   control characters, and measure Unicode code points (not UTF-16 units) for
   the 1–24 rule. Preserve the trimmed original casing for display. A registry
   index makes conflict checks O(1) and supports atomic rename.
5. **Use revisioned snapshots, not row-level patches.** Lobby scale is bounded by
   the existing max-match setting. A complete `LobbySnapshot` after each event
   is simpler, replay-safe, and prevents clients from reconstructing stale rows.
   `revision` is monotonic per process and clients ignore older snapshots.
6. **No new package.** Existing `@europa/networking`, `@europa/matchmaking`,
   and `@europa/console` boundaries are sufficient. Adding a shared lobby
   package would increase dependency edges without a second consumer.
7. **Browser persistence is best-effort.** Use `localStorage` with a namespaced
   key and catch unavailable/invalid storage. The server remains authoritative;
   failure falls back to a fresh identity and an announced recoverable message.
8. **Compatibility boundary.** Lobby messages are additive. Existing gameplay
   payloads and `NETWORK_API_VERSION` must not be repurposed; if the current
   closed union policy requires a version bump for the new message family, use
   the documented pre-1.0 compatibility ruling and update both contract copies.

## Alternatives rejected

| Alternative | Rejection |
| --- | --- |
| Treat IDs as bearer secrets | Incorrectly blocks correlation and conflates identity references with credentials; IDs still do not authorize requests. |
| URL-encoded guest ID/handle as client authority | URLs may carry non-secret IDs for correlation, but server-side resolution must ignore client claims for authority; bearer credentials remain unsafe in URLs. |
| Server-trusted client seat/handle | Violates FR-021–FR-024 and breaks reconnect security. |
| Polling every second | Slower update semantics, needless load, and poor action race behavior. |
| Persistent SQLite profile table | Explicitly out of scope and violates the in-memory restart boundary. |
| Auto-created compatibility match | Contradicts FR-001/FR-017 and prevents multiple selectable matches. |
| Full lobby history | Explicitly excluded; collected matches must disappear. |

## Verification references

- Feature 004 contracts: networking envelope, connection state, spectator,
  reconnect, and bridge behavior.
- Feature 006 data model: `MatchRecord`, `SeatRecord`, `PlayerSession`, public
  projection, settings validation, and lazy cleanup.
- Feature 005 console: reducer/store/effect pattern, live runtime, accessibility
  helpers, error boundary, and existing Playwright/browser test setup.
- Constitution: strict typing, deterministic server simulation, 80% coverage,
  accessibility, and self-hosting.

### Verification approach

Use repository search as a completeness check, the Feature 010 checker as the
documentation gate, existing contract-conformance suites for mirrored shapes,
and focused negative fixtures for credential-bearing URLs/logs. Run the existing
private-match and fog audits unchanged; success means the policy is relaxed for
IDs without relaxing any actual security boundary.
