# Security sweep — #152 / #146 / #129 (spec 016 amendment manifest)

Closes #152 · Closes #146 · Closes #129

> One PR delivers all three issues — owner-ruled and not reopenable. Requirements are written into the specs that own them (amendment in place): there is no standalone feature spec and no new FRs in `specs/016-security-sweep/`.

## Summary

Three P1 `security` findings from the 2026-09-10 code review, fixed together and reflected back into the specs in the same change set (constitution IV):

| Issue | Finding | Ships |
| --- | --- | --- |
| **#146** | The lobby restored grace-window guest identities from a bare `guestPlayerId` — a non-secret correlation id behaving as a bearer credential. | Per-identity **resume secret**: minted with CSPRNG entropy at establishment, delivered only to the owner on the directed identity event, required for grace-restore / rename / release, rotated on every successful restore (single epoch), stored by the browser beside the id, absent from every projection/roster/log/URL/manual surface, enforced by a durable documentation-privacy check. |
| **#152** | Console WebSocket client had promise/settling, correlation, teardown, timeout, validation, and module-global-state defects. | FR-028…FR-036: rejecting sends, bounded+pruned seq→actionId map (cap 64), mount/teardown race closure, configurable establish timeout (10 s) with honest status, structural inbound frame validation (incl. nested `lobbyEvent`, forward-compatible), per-instance client state (seat-token isolation), stale-socket guards on every handler, allocation-free copy-on-write rehydration, `never`-sink exhaustiveness. |
| **#129** | `?ws=` was consumed after the production query strip (dead override), test patches patched `history.replaceState` in production boots, debug globals were unflagged, the barrel leaked `@internal`. | Capture-`?ws=`-before-strip bootstrap (no history patch required), `?live`/`?match=`/`?name=`/`?token=` query consumption retired (seam = `window.__europaTestMatch` only), `window.__europa*` behind the `__europaTestOptIn` sentinel, single-sourced `returnTo` validator (open-redirect corpus), dead seams deleted, barrel de-`@internal`ed with `CONSOLE_API_VERSION` **0.4.1 → 0.5.0**. |

### Notable decisions (see `specs/016-security-sweep/clarifications.md`, `plan.md`)

- **D2 / 2026-10-12 layering ruling** — supersession is delivered by **credential rotation + immediate eviction of the lobby binding and spectator subscription**, not by socket severing: the rotation is what locks the old holder out of every future restore, and socket severing stays the match server's single-seat re-claim semantic (a layer the lobby facade has no seam to reach). The user-facing mechanism is the console's `identity_invalid` → `superseded` → **"This session moved somewhere else"** plate, not a closed socket (006 FR-026 / 010 FR-041 dated sub-entries; recorded in 016 `clarifications.md`, `data-model.md`, `contracts/wire-identity-credentials.md`).
- **D10 (PO ruling)** — the same-connection idempotent refresh is the sole id-only exception; authority is the pre-existing connection binding, never the id. Every other id-only claim mints fresh.
- **D4/D5 (PO)** — additive wire fields with **no `NETWORK_API_VERSION` bump**; `CONSOLE_API_VERSION` **0.5.0** (breaking public-surface change, PO-confirmed).

### Spec amendments (all unshipped versions; no unrelated version churn)

`004` v1.11 (FR-026/FR-027) · `005` v1.11 (FR-028…FR-038 + Note 17) · `006` v1.9 (FR-026 + FR-016 conformance record) · `007` v1.8 (FR-004a + mandatory manual review) · `010` v1.14 (FR-040…FR-043 + SC-017) · `013` v1.5 (FR-025/FR-034/FR-035, AC-018…AC-020) · `015` (FR-019/FR-020 AC rows) · `016` manifest v1.1.

## Test plan

1. **Full gate**: `bash scripts/verify.sh` — build, lint, typecheck, conformance, design-system guards, all console node-mode + browser-mode suites, coverage mode, Playwright E2E, perf budgets, selfhost build, every other package's tests, documentation-privacy guard, spec-consolidation guard. Tail below.
2. **Targeted suites** (this branch): `@europa/networking` 35 files / 326 tests · `@europa/matchmaking` 47 / 399 · `@europa/console` node-mode 70 / 1054 · console E2E **57 / 57** (was 54 — three new SC-017 trials).
3. **New E2E coverage (T033)**: `tests/e2e/sc-017-resume-secret.spec.ts` drives SC-017's three trials through the real stack — (a) rename → reload → restore keeps identity + handle + credential and rotates the secret (D3), (b) an id-only claim presented by *another* connection restores/renames/leaves/displaces nothing (premise-asserted so a broken seed fails loudly), (c) the run's secret reaches only the owner's directed identity event and no projection, roster frame, console line, URL, DOM text, or manual source. Pre-fix posture recorded in `tasks.md`.
4. **T034 executions**: `routing.spec.ts` AC-018 case (no history init script) green; AC-020 unflagged-boot scan green; AC-014 `?e2e` + `window.__europaTestMatch` fixtures green; `semantic-url-privacy.test.ts` green with the new files present.
5. **agent-browser smoke against `pnpm host`** (below) and the **spec-007 manual review** (below).

### `bash scripts/verify.sh` tail

All 12 phases green (exit 0). Counts: console node-mode 62 files / 1006 tests (`test:unit`) + determinism 1/1 + parity 1/2 + keepalive 1/2 + lobby-integration 1/9 · console browser-mode 40 / 317 (repeated under V8 coverage in 6b) · console E2E **57 / 57** · perf budgets 3/3 · selfhost build + one-port host smoke PASS · core 121 · engine 518 · terrain 427 · fog 129 · networking 326 · matchmaking 399 · version 42 · design 381.

```
 Test Files  34 passed (34)
      Tests  381 passed (381)
   Start at  02:50:49
   Duration  11.15s (transform 796ms, setup 0ms, import 1.71s, tests 6.96s, environment 13.20s)


--- Phase 11: Documentation privacy guard ---
Feature 010 documentation/privacy check passed: 4 player-facing and 9 implementation/spec surfaces checked.

--- Phase 12: Spec consolidation guard ---
All spec consolidation checks passed.

=== All verification checks passed ===
```

## agent-browser smoke vs `pnpm host` (T035 / D6)

Named session `sweep-c00131edc18f` against the single-port production host on `:8080` (started via PM2 `server-manager`, stopped and deleted afterwards). Screenshots in `__screenshots__/` (gitignored).

| # | Checklist item | Result |
| --- | --- | --- |
| 1 | Lobby connects; identity/handle flow works | **PASS** — `/lobby` gates to `/profile`, `Set name` accepted, identity card shows handle + `Online` + `Manage profile`, `Players online (1)` roster live. Stored claim carries `guestPlayerId` + 36-char `resumeSecret` + handle (`smoke-01-lobby-connect.png`). |
| 2 | Bad `?ws=` fail-softs; no uncaught errors | **PASS** — cross-host override renders the `Lobby unavailable` configuration-error `role=alert` **before any identity connection** (`smoke-02a-bad-ws-config-error.png`); same-host dead port (`ws://localhost:9`) stays in the soft recovery path — `Reconnecting to lobby…` → `Connection failed` + `Retry connection`, controls disabled, no identity connection, no crash (`smoke-02b-bad-ws-dead-port.png`). Zero console messages, zero page errors for both. |
| 3 | Reload within grace restores identity + handle (secret path end-to-end) | **PASS** — stored `guestPlayerId` was `CYaCSuaKU8yP` before the bad-`?ws=` excursion; after re-opening `/lobby` **and** after a hard `reload`, the id, the handle `SweepSmoke`, and a 36-char secret are all still present (`smoke-03-grace-restore.png`). Same identity restored, not mint-fresh. |
| 4 | Match entry | **PASS** — `Create match` → `/match/5ba7a9e5-…` waiting room (`Waiting for 1 more player… (1/2)`) (`smoke-04-match-entry.png`). |
| 5 | Lobby recovery | **PASS** — `Leave to lobby` → `/lobby`, `Returned to the lobby.` announced, identity intact (`smoke-05-lobby-recovery.png`). |
| 6 | Zero page-console errors throughout | **PASS** — final `errors[]` = `[]` and `console[]` = `[]`. The capture pipeline was positively validated first (injected `console.error` and an uncaught timer throw were both recorded), then the session was restarted for a clean buffer; `agent-browser errors --clear` is a no-op in 0.36.0, which is why a restart was used. |
| 7 | No `resumeSecret` in app-printed output | **PASS** — no credential name in console output or rendered text; the live secret value appears in neither `document.body.innerText` nor the URL, while still being present in storage (i.e. the check is not vacuous). |

Two things worth flagging for the reviewer, recorded as observed rather than as the `quickstart.md` comment predicts: the configuration-error page is what a **policy-rejected** override produces (different host); a same-host-but-dead port instead enters the reconnect/failed recovery banner. Both fail soft with no identity connection and no console output.

## Spec-007 manual review (T036 / FR-004a + FR-012)

**Outcome: reviewed, ZERO delta, no edit made.** `docs/manual/lobby.mdx` (identity-card paragraph, "This session moved somewhere else" bullet, reconnect/grace paragraph, "The resume credential is handled by the browser and server; do not copy or share it") and `docs/manual/quick-start.mdx` (refresh-within-60-seconds reclaim, "Reconnect credentials stay in each player's own browser storage") were re-read against the implemented restore behavior. Every reviewed sentence remains true under secret-required restore: the browser really does hold the credential that makes reload-restore work; clearing storage or restarting the server starts a fresh session (now literally — no credential, no restore); and the "session moved somewhere else" wording matches the shipped notice and the amended supersession clause (a notice, not a severed socket). The review itself is the obligation under FR-012 and is recorded here regardless of outcome.

Out of scope, surfaced for a separate ruling (not this change set's drift — `docs/manual/` is untouched on this branch, last changed at the Astro migration): `lobby.mdx:12` and `quick-start.mdx:16` still describe the pre-feature-015 "Your name" card ("Playing as" / "Ready to play"), while the shipped identity card reads handle + `Online` + `Manage profile` and naming lives at `/profile`.

## Commits

Conventional commits (`feat` / `fix` / `test` / `docs` / `chore`), every commit carries a `Generated-By` trailer, no bot `Co-authored-by` trailers (commitlint forbids them; squash-merge preserves trailers into `main`).

---

Generated-By: modern-architect-engineer (model: mimo-v2.6-flash)
