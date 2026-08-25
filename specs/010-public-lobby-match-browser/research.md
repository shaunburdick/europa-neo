# Research: Public Lobby & Match Browser

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
| URL-encoded guest ID/handle | Violates privacy and allows client-controlled identity; URLs also leak through history/logs. |
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
