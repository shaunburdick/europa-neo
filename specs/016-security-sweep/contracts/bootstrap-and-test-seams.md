# Contract: Bootstrap, routing, and test seams

Covers 013 FR-025/FR-034/FR-035 (+AC-018…AC-020), 005 FR-037, 015 FR-019/FR-020. File: `packages/console/src/main.tsx` + routing/E2E surfaces.

## Production bootstrap (`main.tsx`)

| # | Rule |
|---|---|
| B-1 | The page's query string is captured **before** `stripProductionQuery()` runs; `resolveLobbyServerUrl` receives the captured search, so `?ws=` works in real production boots (013 FR-025). Correctness never depends on a `history.replaceState` test patch (AC-018). |
| B-2 | `guardReplaceStateUrlArgument` is **deleted**; production code performs zero `history.replaceState` monkey-patching (plan AD-5). The E2E init script is fixed to mirror native semantics (missing URL arg → keep current URL) and consolidated into `tests/e2e/helpers/` — exporting **both** existing variants (preserve-ws-only ×4 definitions, merge ×2 across five specs; they differ semantically and both survive, Gate 2 correction A1). |
| B-3 | `?live`/`?match=`/`?name=`/`?token=` query consumption in `live-runtime.tsx` is deleted; the direct-match seam is `window.__europaTestMatch` only (013 FR-025/FR-035). `?token=`-style bearers in URLs are prohibited (013 FR-016). |
| B-4 | The `mountLobbyRuntime` **export** is deleted; the module `internal/lobby-runtime.tsx` is **kept** — `MatchLegHost` has four live importers (`routing/route-tree.tsx:33`, `match-adaptive-route.tsx:19`, `match-join-route.tsx:30`, `match-spectate-route.tsx:30`) (Gate 2 correction A4). |
| B-5 | The `?ws=` policy is unchanged: same-host/loopback/no-credentials; routing ignores it for classification (013 FR-010). |
| B-6 | `?e2e` harness behavior unchanged (013 FR-011). |

## Test sentinel (005 FR-037 / 015 FR-019; plan AD-3)

```ts
// Set by test infrastructure via Playwright addInitScript BEFORE page load.
// Production code only reads it; it is never installed by the app.
interface Window {
    __europaTestOptIn?: { readonly lobby?: true /* extensible */ };
}
```

- Production bootstrap installs `window.__europaLobby = { store }` **only** when `window.__europaTestOptIn?.lobby === true`; an unflagged production boot installs no `__europa*` handle at all.
- Test handles never carry bearer credentials (session, reconnect, seat-session, resume secret) — the lobby handle exposes the store's public state surface only.
- The four dependent E2E specs (`lobby`, `identity-migration`, `shareable-links`, `spectator-sidebar`) migrate in **W1, the same change set as the gate** (Gate 2 Q2, option ii): one `addInitScript` line setting the sentinel; their reads of `window.__europaLobby` are unchanged. No wave boundary is left red (green-branch invariant in `plan.md`).

## `returnTo` validator (013 FR-034)

- Exactly one exported validator, canonical home `packages/console/src/ui/profile-url.ts`; `routing/search-params.ts`'s divergent double-decoding parser is deleted and delegates to the canonical one.
- Safety contract unchanged: relative pathname only, **single** URI-decode, starts with `/`, not `//`, no `://`, no `..`, no embedded query string; unsafe → treated as absent (Continue defaults to `/lobby`).
- AC-019 corpus runs against the exported validator: `//evil.com`, `https://evil.com`, `/%2e%2e/x`, double-encoded variants, backslash and encoded-slash variants, embedded query strings.

## AC-020 runtime/static scan

- No bearer token in any production URL (retired `?token=` path gone); direct-match seam passes with `window.__europaTestMatch` fixtures only; a static/runtime scan finds no `__europa*` handle installed by an unflagged production boot.

## Conformance pins

- Bootstrap unit test: `?ws=` selects the transport with zero `history.replaceState` patching; bad override renders the configuration error page before any identity-bearing connection.
- Sentinel tests: no sentinel → no handles; `{ lobby: true }` → `__europaLobby` present and credential-free.
- Routing E2E: AC-018 no-patch run; AC-014's window-seam fixtures pass unchanged.
