# Implementation Plan: Player-ID Visibility Policy Correction

**Branch**: `013-relaxed-player-id-visibility`
**Spec**: [spec.md](./spec.md) (existing Feature 010, approved v1.7)
**Correction scope**: Existing Feature 010 source-of-truth amendment, cross-referenced by Features 002, 004, 006, 011, and 012. No Feature 013 specification or runtime subsystem.

## Summary

Correct the remaining implementation and acceptance harnesses that still treat
guest identity IDs or gameplay `PlayerId` values as secrets. IDs become ordinary,
non-secret correlation data wherever an existing surface already carries identity
references. Accepted handles remain the preferred UI label. `sessionToken` and
`reconnectToken` remain bearer credentials; private-match existence, server
authority, and fog-of-war boundaries are unchanged.

This is a documentation, contract-comment, checker, and test-harness correction.
It does not add an API, change wire versioning, change match behavior, or alter
the simulation. At the Phase 4–5 gate, the planned change set contained only
planning artifacts; the subsequent Phase 6 implementation is tracked by
C-001–C-010 in `tasks.md`.

## Technical context

- pnpm TypeScript monorepo, Node 22, strict TypeScript, Biome 2, Vitest 4,
  Playwright, existing `ws` networking transport.
- No new runtime dependency, database, account system, timer-driven simulation,
  or cloud service. No new package and no Feature 013 directory.
- Existing branded IDs remain distinct types. The correction changes exposure
  policy and assertions, not identity allocation, validation, or authority.
- Existing 2-player end-to-end behavior and the 2–4 player engine contract remain
  unchanged.

## Constitution alignment

| Principle | Plan decision |
| --- | --- |
| I — Type safety | Preserve branded ID types and mirrored contracts; update prose/JSDoc without weakening strict typechecking or adding suppressions. |
| II — Authoritative/deterministic | IDs are correlation metadata only; server-resolved seat, authorization, and fog filtering remain authoritative. No tick logic changes. |
| III — Tested logic | Replace false ID-secrecy assertions with positive correlation coverage and retain credential/private-match/fog regression coverage. Existing ≥80% gates remain. |
| IV — Specs/docs | Feature 010 remains the normative owner; update affected contract mirrors, comments, READMEs, manual guidance, and checker semantics together. |
| V — Simplicity | Change only stale policy assertions and their tests; do not introduce a privacy abstraction or new transport. |
| VI — Accessibility | Handle-first labels remain accessible; an ID fallback is text and must not rely on color or obscure bearer-credential warnings. |
| VII — Self-hosting | Existing self-hosted URLs/log diagnostics may correlate IDs, but must not expose bearer credentials. |

## Architecture and migration boundaries

### 1. Existing identity and lobby surfaces (no runtime redesign)

The already-shipped identity registry, lobby facade, match records, and seat
records remain unchanged at runtime. Their comments/contracts must describe
`GuestPlayerId` as non-secret correlation data rather than "internal-only" or
"never rendered" data. The server still resolves identity and seat associations;
client-supplied IDs remain advisory and never become authority.

Expected implementation areas:

```
packages/matchmaking/src/
  contracts/lobby-types.ts
  contracts/lobby-api.ts
  internal/guestPlayerIdentity.ts
  internal/identityRegistry.ts
  lobby-service.ts
  lobby-events.ts
```

Identity allocation is server-side and opaque but non-secret. The client may
present a stored identity claim, but the server accepts it only when it matches
its registry; otherwise it creates a fresh identity. Handle changes update the
registry and future projections, while existing reconnect credentials continue to
point to the same identity.

### 2. Existing contracts and transport

No message family is added. Update the Feature 010 contract prose and the
networking mirror comments to permit IDs on existing wire/diagnostic surfaces
where useful. The server continues to resolve identity from connection/session
state, and bearer tokens remain absent from unsafe URLs, logs, diagnostics, and
documentation examples.

The server emits a complete safe lobby snapshot after
mutations and a monotonic revisioned update for create/fill/start/collect.
One connection has at most one lobby or match presence; match joins transition
to the existing networking handshake/session path. Spectator attachment uses
the existing read-only spectator path and never creates a seat.

The message handler resolves identity from server session state, never from
client-supplied seat/guest-ID fields. Gameplay `order` handling remains gated
by the resolved network seat. Lobby actions are serialized by the Node event
loop and each mutation rechecks current state immediately before assignment.

### 3. Existing console and host surfaces

Introduce a lobby state machine beside the existing console match store:
`identitySetup → lobby → waiting → joining/spectating → match → lobby` plus
recoverable `error`/`disconnected` substates. Keep the current live console
mounted for the match state; use semantic paths as the host entry paths. The
legacy query-selected live entry is retired rather than preserved as a
compatibility route. Normal host output contains no match ID, seat, token, or
identity in the URL.
Create a reusable lobby UI with an identity form, create form, status-filtered
public match rows, empty/loading/error states, and accessible transitions. Handle
first labels remain the UX rule; if absent, a generic label or non-secret
guest/player ID is valid. Match IDs and guest/player IDs are correlation data,
not credentials; bearer tokens never appear in URLs, logs, diagnostics, or docs.

### 4. Documentation/privacy checker

Revise `specs/010-public-lobby-match-browser/check-documentation-privacy.mjs` so
it rejects credential values and credential-bearing URLs, while allowing
representative non-secret player/guest IDs and ID field names on implementation,
contract, README, and approved manual surfaces. Keep explicit checks for required
handle guidance and the private-match/fog credential boundary. Add a small
fixture/test seam if needed so both allow and deny cases are executable without
placing live credentials in repository docs.

### 5. Documentation and cross-feature comments

Update only contradictory wording in `packages/{matchmaking,networking,console}`
comments/READMEs, root README, applicable `docs/manual` guidance, and the
Feature 002/004/006/011/012 cross-references. Documentation should use
representative IDs where correlation is useful, never live bearer values. Keep
private-match non-enumeration and fog-of-war wording explicit.

## Compatibility and migration

- Do not change `NETWORK_API_VERSION`, payload shapes, or application behavior.
- Preserve `HelloAck`, `JoinAck`, snapshot/tick, order ack, fog, terminal, and
  reconnect semantics; ID exposure is not authentication or a version change.
- Do not introduce private-match discovery, invitations, accounts, persistence,
  chat, ratings, history, or gameplay mechanics.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| IDs mistaken for authority | Preserve server-side identity/seat resolution; test forged ID/handle/seat claims and unchanged world state. |
| Bearer credential regression | Add checker fixtures and runtime/log assertions proving tokens never enter risky URLs, logs, diagnostics, or docs examples. |
| Private/fog boundary regression | Re-run private-match existence and 500-tick fog audits; IDs may accompany only already-authorized data. |
| Contradictory assertions remain | Run repository-wide targeted search plus contract/readme/manual checker and review the residual list in tasks. |

## Planned file surface (identity-visibility correction)

See [tasks.md](./tasks.md) for the ordered executable list. The planned Phase 6
surface is limited to the checker, stale source comments, contract mirrors/docs,
README/manual wording, and focused test/harness assertions. `specs/013-*` must
not be created. No application source or tests are changed during phases 4–5.

---

# Issue #34: Shareable Match Links — Copy-Link UX & Deep-Link Onboarding

**Branch**: `issue-34-shareable-match-links`
**Spec amendment**: spec 010 v1.8 (commit `55ead09`)
**Date**: 2026-09-06

## Summary

Add two capabilities to the existing lobby/match-browser feature:

1. **Copy-link affordance** (FR-028): A "Copy link" action in the match waiting/live UI that copies `/match/<matchId>` to clipboard with visible confirmation. More prominent for private matches; quieter for public.

2. **Deep-link entry flow** (FR-029–FR-031): Opening `/match/<matchId>` triggers an adaptive entry: handle onboarding if needed → play-or-spectate interstitial for non-participants → join/spectate. Participants go straight in. Spectate-by-link works for private matches.

3. **Supporting**: canonical `/match/<matchId>` URL (FR-032), failure handling (FR-033), host script `publicBaseUrl` config (FR-034), documentation updates (FR-035).

## Technical context

Building on top of already-shipped infrastructure:
- **Route system** (`packages/console/src/routing/route.ts`): `parseRoute` already classifies `/match/<matchId>` with `adaptive | join | spectate` intent; `buildMatchUrl()` constructs canonical `/match/<matchId>` URLs.
- **Route adapter** (`packages/console/src/routing/route-adapter.ts`): `adaptRoute()` resolves routes against lobby snapshots → `player | spectator | unavailable | resolve` entries; `executeRouteEntry()` invokes lobby commands.
- **Lobby runtime** (`packages/console/src/internal/lobby-runtime.tsx`): `LobbyRoot` already handles deep-link resolution — waits for `connection === 'ready'` AND `identityStatus === 'named'`, then calls `adaptRoute` + `executeRouteEntry`. Identity redirect to `/profile` with `returnTo` round-trip already works.
- **Match chrome** (`MatchLegHost` in lobby-runtime.tsx): renders `europa-lobby-match__bar` with title + "Leave to lobby" button — the natural home for a copy-link action.
- **Matchmaker** (`packages/matchmaking/src/matchmaker.ts`): `createMatch`/`joinMatch` return `joinPath` (`/join/<matchId>`) and `joinUrl` (when `publicBaseUrl` configured). `ResolvedConfig.publicBaseUrl` already exists.
- **Host script** (`packages/console/scripts/host.ts`): `--create` mode prints `/match/<matchId>/join` URLs; lobby mode prints only the lobby URL. Uses `NPlayerHostConfig` from `host-config.ts`.

## Architecture decisions

### D1: Copy-link URL construction — `window.location.origin` at copy time

The canonical shareable URL is `/match/<matchId>`. At copy time, the console uses `window.location.origin` to construct the full absolute URL:

```ts
const url = `${window.location.origin}/match/${encodeURIComponent(matchId)}`;
```

**Rationale**: The console runs in the browser and always knows its own origin. This avoids any server-side `publicBaseUrl` propagation to the client. For self-hosted setups behind a reverse proxy, the browser's `window.location.origin` is already the correct public origin (the proxy sets `Host`/`X-Forwarded-Host`). The `publicBaseUrl` config (FR-034) is for the host script's terminal output only.

### D2: Copy-link button placement — in the `MatchLegHost` chrome bar

The copy-link button lives in the `europa-lobby-match__bar` section of `MatchLegHost`, alongside the "Leave to lobby" button. Two visual treatments:

- **Private matches**: A dedicated row with prominent styling (e.g., `europa-lobby__button--primary` or a styled share row with icon + "Copy link" text). The bar gains a `visibility` prop derived from the lobby snapshot or creation response.
- **Public matches**: A subtle icon button (clipboard icon) with `aria-label="Copy match link"`, visually quieter.

The `visibility` is not currently in the `PublicLobbyEntry` type (private matches are not lobby-listed). For the match chrome, visibility can be derived from:
1. The create-match response (which returns `visibility` in `SeatAssignedResult`), OR
2. A new `visibility` field on `LobbySnapshot` (additive, per v1.3/v1.6 additive ruling pattern), OR
3. Stored locally when the match was created/joined (the lobby controller already knows).

**Decision**: Store the match visibility in the lobby state when the match is entered (create/join/spectate). The lobby controller's `lobbyEnteredMatch` action gains an optional `visibility` field. This avoids changing the wire contract and keeps the decision local.

### D3: Deep-link interstitial — new component + lobby state phase

When `adaptRoute` resolves to `player` or `spectator` for a non-participant, instead of immediately executing the route entry, the lobby shows an interstitial. This requires:

1. **New lobby state phase**: `deepLinkInterstitial` — holds the resolved `RouteEntry` and match metadata.
2. **New component**: `DeepLinkInterstitial` — renders match info + Play/Spectate buttons.
3. **Modified route resolution effect**: when the resolved entry is for a non-participant, set `deepLinkInterstitial` instead of calling `executeRouteEntry`.
4. **Modified view gate**: when `deepLinkInterstitial` is set, render the interstitial instead of the lobby landing.

**Why a state phase instead of a separate route**: The interstitial is a transient UI state within the lobby, not a new URL. The URL stays as `/match/<matchId>` throughout. Back/Forward navigation re-resolves the route (existing popstate handler), which can dismiss the interstitial.

### D4: Participant detection — reload resume already works

The existing route resolution effect (lines 378–433 of lobby-runtime.tsx) already checks `state.activeMatchId === currentRoute.matchId` for adaptive/join routes and calls `controller.resumeMatch()` — skipping the interstitial entirely. This covers FR-030 (participants go straight in). Spectator routes with an existing association are similarly handled. No new logic needed for this case.

### D5: Play-or-spectate interstitial logic

The interstitial's available actions are determined by the `adaptRoute` result:

| adaptRoute result | Match status | Seats | Actions shown |
|---|---|---|---|
| `player` | waiting | open | Play, Spectate |
| `player` | waiting | full | Spectate only |
| `spectator` | in_progress | — | Spectate only |
| `unavailable` | — | — | Return to lobby (no interstitial — shows RouteNotice) |

The interstitial is ONLY shown for `player` or `spectator` entries (valid matches). `unavailable` entries already show the `RouteNotice` component.

### D6: Clipboard API with fallback

```ts
async function copyMatchUrl(matchId: string): Promise<{ ok: boolean; url: string }> {
    const url = `${window.location.origin}/match/${encodeURIComponent(matchId)}`;
    try {
        await navigator.clipboard.writeText(url);
        return { ok: true, url };
    } catch {
        // Fallback: select from a hidden input
        return { ok: false, url };
    }
}
```

The fallback renders the URL as selectable text in a temporary element. The copy-link button shows "Copied!" confirmation on success, or the URL text on failure (FR-028 edge case: "Clipboard write failure MUST show a fallback").

### D7: Host script `publicBaseUrl` — `--public-url` CLI flag

Add `--public-url` / `HOST_PUBLIC_URL` to `host-config.ts`'s `NPlayerHostConfig`. The host script uses this to:
1. Construct terminal join URLs as `${publicBaseUrl}/match/${matchId}` (new canonical scheme).
2. Pass to `createMatchmaker({ publicBaseUrl })` so `joinLinks()` returns absolute `joinUrl`.

When not configured, the host constructs URLs from `publicHost:port` (existing pattern). The lobby-mode banner prints the lobby URL; the `--create` mode banner prints per-seat match URLs.

### D8: Canonical `/match/<matchId>` — no backend path change

The matchmaker's `joinPath` stays as `/join/<matchId>` for backward compatibility. The canonical `/match/<matchId>` URL is a frontend routing concern:
- Console copy-link uses `buildMatchUrl()` from `route.ts`.
- Host script terminal URLs use the `/match/${matchId}` pattern directly.
- Deep links already route through `/match/<matchId>` via `parseRoute`.

No `NETWORK_API_VERSION` bump. No wire contract changes.

## Constitution alignment

| Principle | Decision |
|---|---|
| I — Type safety | Clipboard API typed via `navigator.clipboard` types; no `any`. New state types use branded/readonly patterns. |
| II — Authoritative deterministic | No simulation changes. Copy-link is pure UI. Interstitial is pre-join UI only. |
| III — Tested logic | ≥80% coverage on new components and state transitions. E2E coverage for copy-link + deep-link flow. |
| IV — Specs as documentation | Spec 010 v1.8 is the source of truth. Plan and tasks amend the existing spec artifacts. |
| V — Simplicity | Reuse existing `adaptRoute`/`executeRouteEntry` pipeline. Interstitial is a thin UI gate, not a new routing system. |
| VI — Accessibility | Copy-link: keyboard-accessible button, `aria-label`, clipboard confirmation announced via live region. Interstitial: `role="dialog"` semantics, focus trap, screen-reader announcements for Play/Spectate choices. |
| VII — Self-hostable | `publicBaseUrl` is optional; default uses `window.location.origin`. No cloud services. |

## File surface (issue #34)

```
packages/console/src/
  ui/
    copy-link-button.tsx          (NEW — copy-link affordance component)
    deep-link-interstitial.tsx    (NEW — play-or-spectate interstitial)
    match-leg-chrome.tsx          (NEW — extracted match chrome bar with copy-link + leave)
  internal/
    lobby-runtime.tsx             (MODIFY — interstitial state, visibility tracking, route resolution gating)
  state/
    lobby-state.ts                (MODIFY — add deepLinkInterstitial phase, visibility field)
    lobby-controller.ts           (MODIFY — no changes needed; commands already support the flow)
  routing/
    route.ts                      (NO CHANGE — buildMatchUrl already exists)

packages/console/scripts/
  host.ts                         (MODIFY — use /match/<matchId> URLs, --public-url flag)
  host-config.ts                  (MODIFY — add publicUrl to NPlayerHostConfig)

docs/manual/
  *.md                           (MODIFY — document copy-link, deep-link, play-or-spectate)
```

## Compatibility and migration

- No `NETWORK_API_VERSION` bump. No wire contract changes.
- The `joinPath` field on `SeatAssignedResult` stays as `/join/<matchId>` (backward compatible).
- Existing lobby join, spectate, and reconnect paths are unchanged.
- The interstitial is a client-side UI gate only — no new server round-trips.
- `publicBaseUrl` in matchmaking config is already optional and additive.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Interstitial blocks deep-link participants | Existing `activeMatchId` check (D4) bypasses the interstitial for participants. Reload resume is unchanged. |
| Clipboard API unavailable (insecure context) | Fallback renders URL as selectable text; button shows URL on failure. |
| Private match visibility not in wire contract | Stored locally in lobby state at join/create time; no wire change needed. |
| Host script URL scheme backward compat | `--create` mode is operator-facing only; no external consumers. |
| Interstitial + Back/Forward race | Popstate handler re-resolves route; interstitial is dismissed on navigation. |
