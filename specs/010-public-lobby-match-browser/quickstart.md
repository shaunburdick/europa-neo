# Quickstart: Public Lobby & Match Browser

## Run

```sh
pnpm install
pnpm build
pnpm host
```

Open the printed console URL. Unlike the previous launcher, it opens an empty
landing page. Enter a valid 1–24 Unicode-character handle, create a public
2-player game, then open a second browser profile and choose another handle to
join. Both clients should enter the existing console after the second seat is
accepted. A third browser may spectate after the match is running.

## Manual checks

1. Reload the first browser: its handle remains, but no account is implied.
2. Try blank, control-character, 25-character, and duplicate handles; each
   receives field-specific announced feedback.
3. Confirm the lobby shows occupancy/settings and Join only for open waiting
   matches; after start it no longer offers Join and offers Spectate.
4. Return to lobby, leave before fill, and confirm the match disappears after
   the existing cleanup policy. Finished matches never appear as history.
5. Disconnect/reconnect within the grace period and verify the same handle,
   seat, label, view, and order authority. Try a mismatched token and verify no
   reassignment occurs.
6. Inspect UI and received public/player/spectator payloads: accepted handles
   are preferred; a generic label or non-secret player/guest ID is allowed when
   needed for correlation. Confirm no session/reconnect token appears in a URL,
   log, diagnostic, or documentation example.
7. Use keyboard only through identity setup, create/join, spectate, return, and
   failure recovery. Verify focus and live announcements.
8. Restart the host and verify the lobby is fresh and no old identity/match is
   restored.

## Automated validation

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @europa/matchmaking test -- --coverage
pnpm --filter @europa/networking test -- --coverage
pnpm --filter @europa/console test -- --coverage
pnpm --filter @europa/console test:e2e
pnpm build
node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs
```

Acceptance suites must include 10+ simultaneous handle/seat conflicts, 50
create/join/finish/collect cycles, 10 spectator trials, 10 reconnect trials,
100 forged order claims, and the two-browser create→join→first-tick flow.

## Identity-visibility correction validation (Phase 6)

The checker must have executable allow/deny coverage: representative
`guestPlayerId`/`PlayerId` names and values pass on approved documentation or
correlation surfaces; credential values and URLs containing `token`,
`sessionToken`, or `reconnectToken` fail. Re-run the existing server-authority,
private-match existence, and 500-tick fog audits to prove that ID visibility is
not authority or game-state visibility. The final implementation change set
must update source comments, relevant contracts, READMEs, manual guidance, and
the affected old-policy assertions together.

Expected Phase 6 result: the repository-wide residual sweep finds no normative
prohibition on non-secret player IDs, while the bearer-credential prohibition
and private/fog security boundaries remain present and tested.

## C-001 residual audit (2026-08-30) — historical inventory

> This table records the audit's findings, not active policy. The stale
> normative statements identified below have since been corrected or explicitly
> marked historical. The checker still rejects bearer values and credential
> examples in documentation; that documentation rule does not prohibit the
> narrow runtime `pnpm host` operator exception described in the current spec.

Scope was limited to tracked specifications, contracts, READMEs, source
comments, manual pages, orchestration notes, and tests. This is an inventory,
not a correction; C-002–C-010 own the edits and verification. Classification is
by the assertion's governing boundary: **ID** = non-secret correlation,
**Handle** = preferred UI label, **Bearer** = protected session/reconnect
credential, **Private** = non-enumeration/existence boundary, and **Fog** =
recipient-scoped game-state boundary.

| Path (line at audit) | Residual assertion | Class | Disposition |
| --- | --- | --- | --- |
| `spec.md:202` | v1.1 historical clarification says guest IDs are private and absent from URLs/UI/views/docs. | ID | **Superseded historical wording**; the current v1.7 rule permits non-secret correlation. |
| `spec.md:162,132,165` | Former SC-008/FR-026 wording required opaque IDs not to appear in views/manual/docs. | ID | **Corrected**; correlation is allowed, with handle-first UI and credential/authority/private/fog boundaries retained. |
| `plan.md:50-52,93-95` | IDs are non-secret and may correlate; handles preferred; generic/ID fallback allowed. | ID + Handle | Aligned baseline. |
| `data-model.md:11-16,54-58,72-75,92-96` | IDs may cross correlation surfaces but do not authorize; tokens stay unsafe to expose; views may include IDs without changing auth/fog. | ID + Bearer + Fog | Aligned baseline. |
| `contracts/lobby-wire.md:64-70` | Wire IDs are non-secret correlation; tokens are bearer credentials; no authority/private/fog bypass. | ID + Bearer + Private + Fog | Aligned baseline. |
| `packages/networking/src/contracts/network-types.ts:614-620` | Guest ID is “NEVER” in URLs/views/docs. | ID | **Stale contradiction**; C-002/C-003 must permit safe correlation surfaces. |
| `packages/networking/src/contracts/network-types.ts:670-677` | Directed identity ID is allowed only there and forbidden in listings/UI/URLs/logs. | ID | **Stale over-restriction**; directed delivery remains owner-scoped, but safe ID correlation is not forbidden. |
| `packages/networking/src/contracts/network-types.ts:690-693` | Public entry excludes opaque IDs. | ID + Private | **Review required**: ID may be projected when useful; participant/private data remains excluded. |
| `packages/networking/src/contracts/network-api.ts:455-458` | Only match ID is projected; all other target fields are covered by a “privacy envelope.” | ID + Bearer | **Stale over-broad wording**; match ID and safe IDs may correlate, seat/session credentials remain protected. |
| `packages/matchmaking/contracts/match-types.ts:478-491` | Guest ID association is “internal only” and never serialized publicly. | ID | **Stale contradiction**; association remains authoritative, exposure policy changes. |
| `packages/matchmaking/contracts/match-types.ts:324-347,391-402` | Match ID is public discovery data; private/unknown IDs share `match_not_found`. | ID + Private + Bearer | Aligned: match IDs correlate, private existence remains hidden, session token remains credential. |
| `packages/matchmaking/README.md:139-166,202` | IDs are non-secret correlation; handles are UI-facing; tokens stay secret; private matches are non-enumerable. | ID + Handle + Bearer + Private | Aligned baseline. |
| `packages/networking/README.md:184-194` | IDs may correlate in diagnostics; tokens must not be logged; fog/private boundaries remain. | ID + Bearer + Private + Fog | Aligned baseline. |
| `packages/console/src/state/lobby-state.ts:13`, `src/ui/lobby-landing.tsx:27`, `src/ui/seat-labels.ts:14`, `src/internal/lobby-runtime.tsx:41` | IDs “NEVER” enter state/UI/labels/runtime. | ID + Handle | **Stale contradiction**; UI still prefers handles, but state/diagnostics may carry IDs. C-003/C-007. |
| `packages/console/src/...` comments and `scripts/host.ts:31` | Host/client comments prohibit echoing IDs alongside tokens. | ID + Bearer | **Split assertion**: remove ID prohibition; retain token prohibition. C-003. |
| `packages/console/tests/unit/state/lobby-controller.test.ts:191-248`, `component/ui/participants.test.tsx:10-69`, `e2e/lobby.spec.ts:35,256-272,625-723` | Tests assert IDs never enter application state/HTML/DOM. | ID + Handle | **Stale negative assertions**; replace with handle-preference/correlation checks in C-006, preserving bearer and authority negatives. |
| `packages/console/tests/unit/net/ws-lobby-client.test.ts:25` and `integration/lobby-transport.test.ts:62,1362` | Tests/comments prohibit ID logs or cross-connection delivery. | ID + Bearer + Private | **Partially stale**: IDs may be logged/correlated, but cross-connection directed identity and bearer-token rules remain. C-006. |
| `packages/networking/tests/unit/server-lobby.test.ts:473-501,590-617` | Directed identity ID is treated as a secret and must be absent from all other output. | ID + Private | **Rename/reframe**: owner-directed delivery and no unrelated connection leakage remain; secrecy claim is stale. C-006. |
| `packages/networking/tests/unit/server-lobby-reconnect.test.ts:61-67,102-119` and `tests/fixtures/fakeLobbyService.ts:62` | Guest ID is called bearer-secret. | ID + Bearer | **Stale terminology**; reconnect/session token remains bearer, guest ID does not. C-003/C-006. |
| `packages/networking/tests/contracts-conformance.test.ts:493-514` | Conformance allows ID only in claim input and directed identity state; entries/targets must be ID-free. | ID + Private | **Stale shape policy**; retain directed-owner and no-private-state checks, update safe correlation allowance. C-002/C-006. |
| `packages/console/tests/component/ui/participants.test.tsx:62-69` | Rendered HTML must not contain guest-ID-shaped values. | ID + Handle | **Stale UI prohibition**; replace with accepted-handle-first and valid fallback coverage. C-006/C-007. |
| `specs/010-public-lobby-match-browser/pm-handoff.md:43-44` | Historical handoff says local storage holds an opaque token and IDs never appear in URLs/logs. | ID + Bearer | **Superseded historical note**; the handoff now labels the old wording and records the narrow local `pnpm host` tokenized-URL exception. Bearer protection remains. |
| `specs/012-3-4-player-support/spec.md:71,152,177,215,229,251` and `tasks.md:137` | Private match IDs are described as “not leaked”; other lines preserve ID allowance, handle-only UI, fog, and token checks. | ID + Handle + Private + Bearer + Fog | **Corrected/clarified**: the protected property is private existence, not ID secrecy; the host-local tokenized-URL exception is now explicit. |
| `specs/004-multiplayer-networking/spec.md:124-128`, `specs/006-match-lifecycle-matchmaking/spec.md:115,122`, `specs/012-3-4-player-support/data-model.md:183-185` | IDs are correlation data; authorization, private existence, bearer, and fog rules remain. | ID + Bearer + Private + Fog | Aligned cross-feature policy. |
| `docs/manual/index.md:5` and other `docs/manual/*.md` | Handles are shown instead of private system details; no ID examples are required. | Handle + ID | **Handle preference aligned**; absence of ID is not a prohibition, and no bearer/private/fog boundary is weakened. |
| `README.md:194-208` | IDs may appear in safe correlation surfaces; tokens, private existence, and fog remain protected. | ID + Bearer + Private + Fog | Aligned baseline. |

No application source or test files were changed by C-001. The residuals above
are intentionally handed to the later correction tasks; private-match
non-enumeration and fog-of-war redaction are not reclassified as ID secrecy.

## C-008 residual sweep (2026-08-31)

The tracked repository-wide residual sweep was run after commits `d788bab` and
`81c9fe5`. It found no remaining active normative contradiction: non-secret
guest/player IDs are permitted for correlation, handles remain preferred in UI,
and private-match existence, server authority, fog filtering, and bearer-token
protection remain explicit. Remaining old-policy phrases are confined to the
historical C-001 inventory and are labelled as historical/superseded. A stale
test comment referring to a “no-ID rendering scan” was corrected to describe
handle preference and safe identity correlation; no test assertion or runtime
source was changed.

The narrow approved exception is preserved: local `pnpm host` output may print
per-seat tokenized join URLs for operator seat handoff. These URLs remain bearer
secrets and are not a general public-app URL, log, diagnostic, or documentation
pattern.

### C-008 checks

| Check | Result |
| --- | --- |
| `node check-documentation-privacy.mjs` | PASS — 4 player-facing + 9 implementation/spec surfaces |
| `node check-documentation-privacy-harness.mjs` | PASS — 4 forbidden examples rejected |
| Matchmaking lobby conformance | PASS — 6 tests |
| Matchmaking targeted identity/authority/conformance | PASS — 58 tests |
| Networking targeted contract/lobby conformance | PASS — 32 tests |
| Console contract conformance + strict typecheck | PASS — 9 tests |
| Matchmaking/networking package typecheck | PASS |
| `pnpm build` | PASS |
| Broad matchmaking `typecheck:conformance` | **KNOWN BASELINE FAILURE** — existing settings-mirror witness at `tests/lobby-conformance.test.ts:305-306`; unrelated to C-008 and intentionally not changed |

C-008 is complete based on the passing targeted contract/privacy gates and the
residual classification above. The broad settings-mirror failure remains an
existing follow-up outside this identity-policy correction and must not be
silently reported as green.
