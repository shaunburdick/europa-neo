# Research: Accuracy-Source Audit (Feature 007)

**Purpose**: The manual's single hardest requirement is FR-002 — *describe the game as implemented, with the real numbers*. This document is the implementer's audit trail: every page's claims must be verifiable against the exact files and values listed here. Where the 1990s original differs from our tuning, **what ships wins** (spec Edge Case; FR-002).

**Method**: Sources are consulted read-only. Zero prose is copied from `europa-source/` (SOS license © Alex Nicolaou — SC-005). Mechanics prose is rewritten from implemented-spec descriptions (specs 001–006) and confirmed against shipped code.

---

## §1 Source precedence

When sources appear to conflict:

1. Shipped code (packages/*) — what actually runs
2. Implemented feature specs `.specify/features/001…006/spec.md` (+ their Clarifications)
3. Original archive `europa-source/games.dangerous-minds.net/Europa/html/Europa/rules.html` / `controls.html` — reference only; never normative, never copied

Known deliberate divergences from the original (document-what-ships, don't apologize, don't import original numbers):

| Topic | Original | Ours (ships) |
| --- | --- | --- |
| Uphill pipe flow | Gravity-driven slope rules | `flowUphillFactor: 0` — uphill pipes move nothing at v1 tuning |
| Paratroop economics | (original ratios) | Order costs 2× troops at source per trooper landed; one order = cost 20, lands 10 |
| Joining a match | Applet lobby | URL-based join (`?live&ws=&match=&name=[&token=]`), no lobby screen in v1 |

---

## §2 Canonical source files (the audit shelf)

| File | Owns | Manual pages fed |
| --- | --- | --- |
| `packages/engine/src/constants.ts` | `ENGINE_CONSTANTS` + `DEFAULT_TICK_INTERVAL_MS` — every engine number | objective, cities-and-troops, pipes, combat, special-weapons, reserves, fog-of-war, numbers |
| `packages/console/contracts/console-types.ts` | `DEFAULT_INPUT_MAPPING` (line ~728), `DEFAULT_CAMERA`, `DEFAULT_PLAYER_COLORS`, `SUBCELL_RANGE` | controls, reading-the-screen, numbers |
| `packages/networking/src/constants.ts` | `NETWORK_CONSTANTS`: tick rate 250 ms, heartbeat 5000 ms, reconnect grace 60 000 ms, ws idle 30 000 ms, replay ring 16 ticks | quick-start, reading-the-screen, numbers |
| `packages/matchmaking/src/constants.ts` | Match TTLs (5-min empty-match, 60-s results/rematch) | quick-start (context only if player-visible) |
| `packages/terrain/src/constants.ts` | Board-size bounds (8–128 generation), water ratio 0.02–0.25, elevation 0–255 | the-board |
| `packages/engine/src/resolution/*.ts` | Per-rule behavior: `production`, `capture`, `flow`, `decay`, `combat`, `paratroop`, `gun`, `terminal` | cities-and-troops, pipes, combat, special-weapons, objective |
| `packages/fog/src/constants.ts` + spec 002 | Vision radius fallback (=4), Chebyshev metric | fog-of-war |
| `packages/console/src/net/connection.ts` | Status state machine → the seven console status values | reading-the-screen |
| `packages/console/src/internal/live-runtime.tsx` | Live join flow: URL params `?live&ws=&match=&name=[&token=]`; `window.__europaLive` | quick-start |
| `packages/console/scripts/host.ts` (`pnpm host`) | What a real join URL looks like; two-seat launch | quick-start |
| `packages/console/src/ui/waiting-overlay.tsx` | "Waiting for opponent to join…" overlay semantics | quick-start, reading-the-screen |
| `packages/console/src/ui/order-bar.tsx`, `reserves-panel.tsx`, `src/render/SurrenderModal.tsx` | HUD buttons: Exclusive toggle, Clear-pipes, reserves slider + digits, Surrender… + confirm | controls, reading-the-screen |
| `packages/console/src/input/order-reserves.ts` | Digit → percent mapping (`resolveReservePercent`) | reserves, controls |
| `packages/console/src/render/palette.ts` | Elevation shading colors | the-board |
| Specs 001–006 `spec.md` | Behavior narratives (plain-language source material) | all |

---

## §3 Exact shipped values (verified 2026-08-24 on `001-europa-core` @ `1d81a03`)

### Engine (`ENGINE_CONSTANTS`)

```
productionRate: 1            # troops/tick per owned city, until saturated
cityCapacity: 30             # city cell saturation cap
cellCapacity: 30             # non-city cell cap (v1 = cityCapacity)
decayPerTick: 1              # unfed stacks lose this per tick
flowBase: 1                  # troops moved per pipe per tick (base)
flowDownhillFactor: 1        # downhill = base
flowUphillFactor: 0          # UPHILL MOVES NOTHING at v1 tuning ← nuance
paratroopCost: 10            # N=10 lands; source pays 2×N=20 ← nuance
gunCost: 5                   # troops per shot
gunDamage: 2                 # damage to EVERY occupant of target cell
visibilityRadiusDefault: 4   # Chebyshev cells
DEFAULT_TICK_INTERVAL_MS: 250  # ≈ 4 ticks/second
```

### Console input (`DEFAULT_INPUT_MAPPING`) — controls.md must match row-for-row

| Binding | Value |
| --- | --- |
| Pipe toggle (pointer) | left button, no modifiers |
| Exclusive pipe (pointer) | right button, no modifiers |
| Pipe keys | i=north, j=west, k=south, l=east |
| Exclusive pipe keys | Alt+i / Alt+j / Alt+k / Alt+l |
| Clear all pipes in cell | Space |
| Paratroop | p (alt: h) |
| Gun | g (alt: o) |
| Reserves | digits 0–9 → 0%,10%,…,90% (never 100%) |
| Cancel selection | Escape |
| Move selection | ArrowUp/ArrowLeft/ArrowDown/ArrowRight |
| Camera | wheel = zoom toward cursor; middle-button drag = pan |
| Camera zoom bounds | 12–96 px/cell, default 32 |

### Console visuals

```
DEFAULT_PLAYER_COLORS:
  1: '#dc2626'  (red)      2: '#2563eb'  (blue)
  3: '#059669'  (emerald)  4: '#d97706'  (amber)
```

Manual names these as shipped ("red, blue, green, orange-gold" with hexes in numbers.md); v1 palette is fixed — no colorblind alternatives promised (Edge Case), though the console's owner-ring shape signal may be mentioned as the redundant cue.

### Networking / match lifecycle (player-visible subset)

```
tick cadence: 250 ms (4 Hz)
reconnect grace window: 60 s   # reopen own link within this → seat reclaimed; beyond → forfeit ('expired')
heartbeat: server expects signs of life; client app-level ping keeps quiet seats alive
empty-match TTL: 5 min         # unstarted matches evaporate (host context)
```

### HUD statuses — all seven, from `connection.ts`

| Status | Plain language for reading-the-screen.md |
| --- | --- |
| `idle` | Not connected to any match yet (e.g., bare console without a join link) |
| `connecting` | Handshake in progress after opening a join link |
| `live` | Seated and receiving ticks; orders accepted |
| `reconnecting` | Transport lost; auto-reconnect underway — banner shown, keep the tab open |
| `expired` | Grace window elapsed while away — seat forfeited; rejoin via a fresh link/new match |
| `spectating` | Watching without a seat (post-surrender or spectator role); full-board view, no orders |
| `game_over` | Terminal result delivered; end-of-match announcement shown |

(`idle` and `spectating` are console-local statuses; the rest map from wire connection states — detail unnecessary for players but useful for the implementer.)

---

## §4 Known nuances checklist (each must land in the right page)

1. **Uphill pipes are inert** (v1 tuning): pipes laid uphill hold troops in place but transfer none. → `pipes.md` states it plainly; `numbers.md` shows `flowUphillFactor: 0`.
2. **Paratroop 20→10**: an order drops 10 troops at the target and removes 20 from the source (2:1). Range ≤ 2 cells Chebyshev; cannot target water; clears the destination's pipes on arrival. → `special-weapons.md`.
3. **Guns have friendly fire**: damage hits everything in the target cell at resolution time regardless of owner. Cost 5, damage 2. → `special-weapons.md`.
4. **Decay & mutual feeding**: unfed stacks lose 1 troop/tick; two stacks piping into each other sustain indefinitely (neither counts as unfed). → `pipes.md` + `combat.md` stalemate callout.
5. **Join flow is URL-based**: no lobby in v1. URL carries match id + optional per-seat token; refreshing own link within 60 s reclaims the seat; waiting overlay hides on first tick when the match auto-starts. → `quick-start.md`.
6. **All seven HUD statuses** incl. `expired` and `spectating` — see table above. → `reading-the-screen.md`.
7. **Reserves max 90%**: digit n holds n×10%; you can't reserve 100% (a stack that reserves everything could never act/feed). → `reserves.md`.
8. **Elimination = zero troops AND zero cities**; surrender requires confirmation then flips to spectator view; mutual elimination = draw. → `objective.md`.
9. **Fog has no memory**: abandoned ground goes dark again; vision = union of 4-cell Chebyshev radii around your stacks; spectators see all. → `fog-of-war.md`.
10. **Fair maps**: point-symmetric terrain, equal starting cities, guaranteed land routes. Default board 32×32 (matchmaking-generated matches use the default — smaller boards can starve terrain placement). → `the-board.md`.
11. **Desktop only** (stated plainly), **fixed four-color palette** (named as shipped). → `index.md` or `the-board.md`.

## §5 Numbers appendix draft (numbers.md skeleton — verify each line at T013/T019)

| Player-facing value | Shipped value | Constant |
| --- | --- | --- |
| Tick cadence | 250 ms (~4/s) | `DEFAULT_TICK_INTERVAL_MS` |
| City production | 1 troop/tick | `ENGINE_CONSTANTS.productionRate` |
| City saturation | 30 troops | `ENGINE_CONSTANTS.cityCapacity` |
| Open-cell cap | 30 troops | `ENGINE_CONSTANTS.cellCapacity` |
| Unfed decay | −1 troop/tick | `ENGINE_CONSTANTS.decayPerTick` |
| Pipe flow (downhill/flat) | 1 troop/tick | `flowBase × factor` |
| Pipe flow (uphill) | 0 | `flowUphillFactor` |
| Paratroop order | costs 20, lands 10 | `paratroopCost` × 2 |
| Gun shot | costs 5, deals 2 to all occupants | `gunCost`, `gunDamage` |
| Special range | ≤ 2 cells (Chebyshev) | preflight rule |
| Vision radius | 4 cells (Chebyshev) | `visibilityRadiusDefault` |
| Board size (default) | 32×32 | matchmaking default config |
| Reconnect grace | 60 s | `NETWORK_CONSTANTS.defaultReconnectGraceMs` |
| Reserves steps | 0–90% by 10% | reserve key mapping |
| Zoom bounds | 12–96 px/cell (default 32) | `DEFAULT_CAMERA` |
| Player colors | red/blue/emerald/amber (hex above) | `DEFAULT_PLAYER_COLORS` |

## §6 License hygiene procedure (SC-005)

1. Write all mechanics prose from specs 001–006 + code reading only.
2. At final review (T019), spot-compare phrasing against `europa-source/.../rules.html` for accidental paraphrase-with-copy; rewrite anything closer than "same facts, different sentences."
3. Record the sweep result in the task checklist.

## §7 Alternatives considered (and already ruled out by the product owner)

- **SSG (Astro/Eleventy/Docusaurus)**: rejected — plain Markdown decision is binding; Jekyll-in-actions gives rendering without repo-side tooling.
- **Single long page**: rejected — multi-page outline is in the approved spec.
- **Screenshots**: rejected for v1 (rot + simplicity); text/tables carry content.
- **Pages preview deployments for PRs**: Out of Scope per spec; branch validation stays structural (plan.md §Publishing, decision 8).
