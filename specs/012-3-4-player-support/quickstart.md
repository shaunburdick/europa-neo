# Quickstart: 3–4 Player End-to-End Support (012)

**Branch**: `issue-6-3+4-player-matches` | **Spec**: `spec.md` v1.0 | **Plan**: `plan.md`

Post-checkout validation for SC-001..SC-009. Every scenario is runnable; failures terminate loudly.

---

## 0. Preflight

```bash
git branch --show-current   # → issue-6-3+4-player-matches (never main)
pnpm install
pnpm typecheck              # strict TS, no any/suppressions
pnpm lint                   # Biome, zero warnings
pnpm format:check           # four-space/120-column
pnpm build                  # all workspaces (engine→terrain→fog→networking→matchmaking→console→version)
```

No new runtime dep; Node ≥22. If `dist/` missing, `pnpm host` fails with "run pnpm build" (intentional guard).

---

## 1. Defaults map pin

**FR-001 + SC-005 + SC-006**

```bash
pnpm --filter @europa/matchmaking test -- board-size-defaults
pnpm --filter console test -- board-size-defaults   # if mirrored
# assert BOARD_SIZE_DEFAULTS === {2:32,3:48,4:48} and DEFAULT_MATCH_SETTINGS.boardSize===32
pnpm --filter @europa/matchmaking test -- --runInBand
pnpm --filter console test -- --runInBand   # lobby form + overlay + host-config file suites (no browser)
```

Pass: table byte-identical, importable from `@europa/matchmaking`; no second literal table elsewhere.

---

## 2. Lobby create form pre-select / override (component + unit)

**FR-002 + SC-007**

```bash
pnpm --filter console test -- lobby-create-form
# matrix (unit or component — see tasks T017–T018):
#  radio 2 → selects 32; radio 3 → 48; radio 4 → 48
#  manual pick 32 on 3p (override) then switch 3→2 keeps 32 (non-default preserved)
#  manual pick 48 on 2p then switch 2→3 keeps 48 (already the 3p default — re-apply is idempotent)
#  manual pick 64 on 2p then switch 2→4 keeps 64 (non-default preserved)
#  switch when current is still previous default → re-applies target default (e.g. 2→3 when at 32 → 48)
```

---

## 3. Lobby list chrome k/N + board label

**FR-003 + SC-007**

```bash
pnpm --filter console test -- lobby-labels
pnpm --filter console test -- lobby-list-chrome  # component snapshots
# three public entries (2p 1/2, 3p 2/3, 4p 3/4) → each row shows "Players k / N", board label "32×32 board"/"48×48 board",
# Join/Spectate per 010 FR-007, private 3p/4p entries absent from snapshot
```

---

## 4. Waiting overlay N-aware copy

**FR-005 + SC-007**

```bash
pnpm --filter console test -- awaiting-start
pnpm --filter console test -- waiting-overlay
# table: formatWaitingMessage(k,N)
#  1/2 → "Waiting for 1 more player… (1/2)" (singular, 2p retained meaning)
#  1/3 → "Waiting for 2 more players… (1/3)" (plural)
#  2/3 → "Waiting for 1 more player… (2/3)" (singular)
#  1/4 → "Waiting for 3 more players… (1/4)"
#  2/4 → "Waiting for 2 more players… (2/4)"
#  3/4 → "Waiting for 1 more player… (3/4)"
# mounted App: overlay visible while filling (live && tick∈{null,0}) and hidden on tick≥1 per N
# a11y: polite live-region announced once; pointer-events:none; reduced-motion honored; never stacks with reconnecting/game-over
```

---

## 5. Host CLI — --players / --board-size (pre-bind validation)

**FR-011 + FR-012 + SC-008**

```bash
pnpm --filter console test -- host-config
# exhaustive matrix:
#  --players 2|3|4, --player-count alias, HOST_PLAYER_COUNT fallback, default 2
#  --board-size 32|48|64, --boardSize alias, HOST_BOARD_SIZE fallback, implied BOARD_SIZE_DEFAULTS[N] when absent
#  --players 3 alone → 48; --players 4 alone → 48; --players 2 alone → 32
#  --players 4 --board-size 64 → 64; explicit overrides defaults
#  invalid: --players 5 / --board-size 16 / alias mismatch → fail fast naming allowed set, no silent fallback
#  HOST_STATIC_PORT / --static-port → hard failure (FR-012)
#  --static-port with valid --players still fails (no second listener)

# single-server smoke (port:0 fixture per 011 FR-009):
pnpm --filter console test -- host-smoke
# boots real http.Server + matchmaker + networking with port:0, each N∈{3,4}:
#  GET /version === APP_VERSION over same port
#  same-origin WS upgrade over same port
#  --create with N prints N URLs (token-bearing), SIGINT idempotent
```

Manual smoke:

```bash
pnpm build
pnpm host --players 3 --board-size 48 --create   # prints 3 URLs on one http.Server
pnpm host --players 4 --board-size 64 --create   # prints 4 URLs
pnpm host --players 5 2>&1 | grep -q "must be 2, 3, or 4" && echo "rejected correctly"
pnpm host --static-port 5173 2>&1 | grep -q "no longer supported" && echo "second port rejected"
HOST_PLAYER_COUNT=3 HOST_BOARD_SIZE=48 pnpm host --create   # env path also → 48
```

---

## 6. Deterministic terrain + balance (SC-003)

**FR-008**

```bash
pnpm --filter @europa/terrain test -- deterministic-n-players
pnpm --filter @europa/terrain test -- balance-n-players
# 10 seeds × {2,3,4} × {32,48,64} including odd citiesPerPlayer for 3p:
#  same-seed regen byte-identical (006 SC-001 protocol)
#  100% pass point symmetry via partnerPlayer, connectivity over land, water 5–15%
#  200-map balance suite extended to N∈{3,4} (003 SC-002/SC-004)
#  effectiveSettings reports normalized city count for 3p (e.g. 1→2)
```

---

## 7. Fog isolation for N>2 (SC-004)

**FR-009 + FR-010**

```bash
pnpm --filter @europa/fog test -- isolation-n-players
pnpm --filter @europa/networking test -- fog-leakage-n-players
# 500-tick zero-leakage audit parameterized over 3 and 4:
#  every payload's cell set ⊆ recipient's VisibleSet (Chebyshev 4, stateless union)
#  spectator on 3p/4p → full-visibility read-only, zero accepted orders
#  per-tick <15 ms budget (004 SC-005 measurement protocol) intact
```

---

## 8. Full-stack E2E parameterized over 3 and 4 (SC-001/SC-002 + SC-006)

**FR-001..FR-011, SC-001/SC-002**

```bash
pnpm build
pnpm --filter console test:e2e -- full-stack-n-players
# single harness describe.each([3,4]) over buildStack() single-server (port:0) recipe:
#  lobby creates public N-player match (default 48) → three/four distinct guest identities claim seats atomically
#  auto-start within 2s → each seat receives tick≥1, per-seat fog views, ok:true order acks, deterministic ticks
#  last-seat atomicity: at most one wins final seat; losers get match_full
#  private N-player link not listed in lobby snapshots
#  victory/surrender/forfeit/rematch reachable for N>2 (also covered by headless 010-style audit if browser flakes)

# 2p non-regression (SC-006) — must stay green:
pnpm --filter console test:e2e -- full-stack
pnpm --filter @europa/matchmaking test -- --runInBand
pnpm --filter @europa/networking test -- --runInBand
```

---

## 9. Victory / forfeit / rematch with N>2 (US5)

**SC-001/SC-002 clause + SC-006**

Headless audit (no browser) in `packages/matchmaking` / `packages/networking`:

```bash
pnpm --filter @europa/matchmaking test -- victory-forfeit-rematch-n-players
#  running 3p: eliminate 2 → last survivor wins; server delivers finished → collectible
#  running 4p: one voluntary leaveMatch → that seat forfeit only; match continues while ≥2 remain
#  running 3p: one disconnect beyond grace → that seat forfeited; telemetry totalForfeits bumps only for timeout
#  finished 3p/4p: all original seats accept rematch within window → new match same playerCount/boardSize/visibility + fresh seed/ID/link
```

---

## 10. Manual truthfulness + privacy + version lockstep (SC-009)

**FR-013/FR-014 + 007 FR-012**

```bash
pnpm version:check                        # APP_VERSION lockstep (009 FR-009)
node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs
# zero SessionToken/reconnect-token values or credential-bearing URLs in docs/manual/**/*.md;
# non-secret player IDs are permitted for correlation (feature 013)

# grep drift checks (same as 010's standing checks):
grep -r --include="*.md" "HOST_STATIC_PORT\|:5173.*http.*:8080" docs/manual/ && echo "stale two-port ref" && exit 1
grep -r --include="*.md" "Waiting for opponent to join" docs/manual/ && echo "stale 2p singular" && exit 1
grep -r --include="*.html" "Waiting for opponent" docs/manual/ && echo "stale html" && exit 1

# manual must mention: 2→32, 3→48, 4→48; 32/48/64 override; k/N occupancy; N-aware waiting phrasing;
# pnpm host --players/--board-size on single-port http://localhost:8080/ (no HOST_STATIC_PORT)
# numbers.md tunable table still matches shipped constants (ENGINE_CONSTANTS + BOARD_SIZE_DEFAULTS)
```

---

## 11. Coverage + gates (SC-005 + SC-009)

```bash
pnpm --filter @europa/matchmaking test -- --coverage
pnpm --filter @europa/terrain test -- --coverage
pnpm --filter @europa/fog test -- --coverage
pnpm --filter @europa/networking test -- --coverage
pnpm --filter console test -- --coverage   # merged node+browser where applicable
# each touched package ≥80% stmts / branches / funcs / lines; zero suppressions

pnpm typecheck
pnpm lint
pnpm format:check
# full CI (path-gated per spec): matchmaking, terrain, fog, networking, console — all green
```
