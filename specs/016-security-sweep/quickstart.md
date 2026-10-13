# Quickstart — verifying the 016 security sweep

For the implementer (Phase 6) and the reviewer. Run from the repo root on branch `security-sweep`. Full gate: `pnpm verify` (or `bash scripts/verify.sh`) — CI-equivalent, all packages (AGENTS.md rule 6). Faster inner loop: `pnpm verify:changed`.

## 1. Local stack

```bash
pnpm host                 # single-port stack (match server + WS + console) on :8080
# or: pnpm host --port 9090 / HOST_PORT=9090 pnpm host
```

Wait for "Match server listening" before opening a browser session.

## 2. Targeted tests (one per AC cluster — all fail pre-fix)

```bash
# #146 — resume secret (server)
pnpm --filter @europa/matchmaking test -- identityRegistry      # mint/verify/rotate, drop-mid-restore, reactivate seam
pnpm --filter @europa/matchmaking test -- lobby.facade         # establishment delivery (secret in all 3 outcomes, none on rename — AD-11),
                                                                # advisory id-only mint-fresh, rename/leave rejection;
                                                                # F-8 carve-out tests stay green (lobby.facade.test.ts:245/:264)
pnpm --filter @europa/networking test -- contract               # optional wire fields, NETWORK_API_VERSION unchanged

# #146 — resume secret (client)
pnpm --filter @europa/console test -- lobby-storage             # shape guard incl. legacy records; JSDoc mirrors data-model §4
pnpm --filter @europa/console test -- ws-lobby-client           # claim/adoption carries secret; secret-less event preserves stored
                                                                # secret (AD-9/Q1a); redaction; SC-017 scenarios
pnpm --filter @europa/console test -- lobby-transport           # US1 AC-3 integration suite — establishNamedClient seeded with
                                                                # resumeSecret by T038; id-only restore must NOT pass (W3 F3-1)

# #152 — net hardening
pnpm --filter @europa/console test -- ws-match-client           # send promise contract, correlation map, stale-socket guards
pnpm --filter @europa/console test -- client                    # instance isolation (two interleaved instances)
pnpm --filter @europa/console test -- connection                # establish timeout (fake timers), never-sink
pnpm --filter @europa/console test -- envelope-to-event         # malformed nested lobbyEvent dropped, not severed
pnpm --filter @europa/console test -- rehydrate-wire-views      # no-op path returns input by reference; spine-only repair

# #129 — routing/debug seams
pnpm --filter @europa/console test -- profile-url               # open-redirect corpus (AC-019) against the single validator
pnpm --filter @europa/console test -- main-bootstrap            # capture-before-strip (?ws= honored, no patch); sentinel gating (file added by W1)
pnpm --filter @europa/console test -- contract-conformance      # CONSOLE_API_VERSION === '0.5.0'; barrel type surface

# documentation privacy (secret name + credential-shaped values denied)
node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs
```

(Adjust test file names to what Phase 5 names them; every row in `plan.md`'s FR→test map must have exactly one failing-pre-fix test behind it.)

## 3. E2E

```bash
pnpm --filter @europa/console test:e2e        # or pnpm test:e2e at root
```

Must pass after migration (the sentinel one-liner rides **W1** with the gate — every wave boundary stays green; see plan.md green-branch invariant):
- `lobby.spec.ts`, `identity-migration.spec.ts`, `shareable-links.spec.ts`, `spectator-sidebar.spec.ts` — now opt in via the `window.__europaTestOptIn` init script; reads of `window.__europaLobby` unchanged.
- `routing.spec.ts` — includes the AC-018 case: `?ws=` on a semantic path points at a non-default server with **no** `history.replaceState` init script installed; the shared helper exports **both** patch variants (preserve-ws-only and merge) per AD-5.
- SC-017 scripted trials (010): (a) stored id + stored secret restores identity and handle after reload within grace — extended to **rename → reload → restore** so the secret-preservation regression (AD-9/Q1a) is actually caught; (b) valid id without secret never restores/renames/leaves/displaces (mint-fresh); (c) the secret value appears in no projection, roster frame, log line, URL, or manual page.

## 4. agent-browser smoke (D6 — mandatory)

```bash
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix sweep)"
agent-browser open http://localhost:8080/lobby
agent-browser snapshot -i          # lobby renders once identity is ready
# bad transport override fail-soft (?ws= with a malformed/foreign URL → config-error page, no identity connection)
agent-browser open 'http://localhost:8080/lobby?ws=ws://localhost:9'
agent-browser snapshot             # "Lobby unavailable" alert, no crash
# reload within grace: back to /lobby, same handle restored (secret path end-to-end)
agent-browser open http://localhost:8080/lobby
agent-browser screenshot lobby-smoke.png
agent-browser close
```

Checklist (record results in the PR body):
1. Lobby connects; identity/handle flow works.
2. Bad `?ws=` fail-softs to the configuration-error page; console shows no uncaught errors.
3. Reload within the grace window restores the same identity and handle.
4. Match entry and lobby recovery work.
5. Zero page-console errors throughout (`agent-browser` snapshot error reporting + DevTools console).
6. No `resumeSecret` value visible in any app-printed log or UI surface.

## 5. Manual review checkpoint (007 v1.8 — mandatory, same change set as #146)

Re-read `docs/manual/lobby.mdx` and `docs/manual/quick-start.mdx` against the implemented restore behavior. Survey (2026-10-11) says the wording is compatible; expected delta is zero or one clarifying sentence ("the stored resume credential is required to restore"). Record the review outcome — the review is the obligation, even when no edit results (spec 007 FR-012).

## 6. Spec-text riders (don't drop)

- [x] 005 v1.11: one-sentence FR-028 void-send precision (plan AD-4). *(T013 — verified in FR-028's shipped text.)*
- [x] 005 Implementation Note 17 updated to the 0.5.0 end state (dated v1.11 sub-entry; its "MUST quote the shipped literal" clause — Gate 3 Q2, T009). *(T009.)*
- [x] 013 v1.5 changelog row names the AC-014 amendment + preamble scoping (Gate 2 polish note 1). *(T010.)*
- [x] 013 Clarifications row 3 one-word supersession marker (polish note 2). *(T010 — "(Superseded by v1.5 FR-025/FR-035…)" at v1.1's direct-match seam note.)*
- [x] `lobby-storage.ts` JSDoc mirrors `data-model.md` §4 (constitution IV obligation). *(T031 — the `{ guestPlayerIdClaim, resumeSecret, handle }` triple.)*
- [x] `CONSOLE_API_VERSION` conformance pin `'0.5.0'`. *(T009 — `contract-conformance.test.ts:348`.)*

All six verified against the tree on 2026-10-12; only the checkboxes were outstanding.

## 7. Commit / PR hygiene

Conventional commits, one PR for #152/#146/#129, `Generated-By` trailer via the attribution hook, `pnpm verify` green before the PR is marked ready. No bot co-author trailers (commitlint forbids). Update AGENTS.md "Current state" when the sweep lands.
