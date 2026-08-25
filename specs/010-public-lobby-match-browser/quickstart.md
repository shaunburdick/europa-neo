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
6. Inspect UI and received public/player/spectator payloads: no opaque guest ID
   is displayed or exposed.
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
```

Acceptance suites must include 10+ simultaneous handle/seat conflicts, 50
create/join/finish/collect cycles, 10 spectator trials, 10 reconnect trials,
100 forged order claims, and the two-browser create→join→first-tick flow.
