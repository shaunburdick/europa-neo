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
