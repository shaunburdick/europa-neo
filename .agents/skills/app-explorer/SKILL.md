---
name: app-explorer
description: Explore and verify the Europa Neo app in a real browser with agent-browser. Covers the full app surface — welcome page, profile/identity setup, lobby (create/join/spectate matches), the live match view (board, orders, reserves, HUD, minimap), screenshots, accessibility audits, responsive checks, and two-player testing via parallel browser sessions. Use whenever the user asks to open or use the app, explore or dogfood the UI, verify a route or flow, take a screenshot of the game, check how something renders, or test the lobby/match experience in a browser — even if they don't say "browser" or "screenshot" explicitly.
---

# App Explorer — Europa Neo browser exploration

Drive the running Europa Neo app in a real Chromium browser via `agent-browser`: navigate the semantic routes, set your identity, create/join/spectate matches, click the game board, capture screenshots, audit accessibility, and verify responsive layouts. This skill wires together the **server lifecycle** (repo-local `server-manager` skill) and the **browser automation** (global `agent-browser` skill) with app-specific knowledge: routes, identity gating, match flow, board interaction, and the two-session pattern for multiplayer testing.

## Prerequisites — load these first

1. **agent-browser core workflow** — this skill assumes you know the snapshot/ref loop. If you haven't used agent-browser this session, run `agent-browser skills get core` (and `--full` for the complete command reference) before anything else.
2. **server-manager skill** — read `.agents/skills/server-manager/SKILL.md` for the full PM2 lifecycle (start/stop/restart/delete/status/logs/readiness). This skill only covers the server commands you need for exploration; the server-manager skill has the troubleshooting depth.

## Quick start

```bash
# 1. Start the full-stack host server (built SPA + WebSocket + match server on ONE port)
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
bash .agents/skills/server-manager/scripts/ready.sh host 8080

# 2. Claim a private named browser session (never use the shared default)
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix explore)"

# 3. Open the app and see what's interactive
agent-browser open http://localhost:8080/
agent-browser snapshot -i
```

The host server prints its banner (Console UI / Lobby / join URLs) to its PM2 logs — see [Reading server output](#reading-server-output).

## App routes

| Route | Purpose |
| --- | --- |
| `/` | Welcome/landing page — "Play" CTA links to `/lobby`; secondary links (Player Manual, GitHub) under a nav labeled "Learn more" |
| `/lobby` | Main lobby — identity card, Create Match form, public match list. **Redirects unnamed visitors to `/profile`** |
| `/profile` | Identity management — set/change your display handle |
| `/match/<id>` | Active match view — board, HUD, order palette, reserves, minimap |
| `/match/<id>/join` | Join a match by ID (takes the first open seat) |
| `/match/<id>/spectate` | Read-only spectator view (no handle required) |

## The core loop (recap)

```bash
agent-browser open <url>      # navigate
agent-browser snapshot -i     # interactive elements, fresh @eN refs
agent-browser click @e3       # act on a ref
agent-browser snapshot -i     # ALWAYS re-snapshot after any page change
```

Refs go stale the moment the page changes (navigation, click, form submit, re-render). When refs are awkward, use semantic locators (`find role button --name "Create match"`, `find text "..."`) or raw CSS selectors (`click "#europa-cell-3-5"`). After page-changing actions, wait for the expected result — `wait --text "..."`, `wait --url "**/match/*"`, or `wait --load networkidle` — never a bare `wait 2000`.

## App-specific flows

### 1. Set your identity (required before the lobby is useful)

`/lobby` redirects unnamed visitors to `/profile`. The profile page has two states:

- **Unnamed** — "Set up your profile" heading, a "Display name" text input, and a "Set name" submit button.
- **Named** — "Welcome back, <handle>" plus a "Continue to lobby" button.

```bash
agent-browser open http://localhost:8080/lobby   # redirects to /profile
agent-browser snapshot -i
agent-browser fill @e1 "TestPilot"               # the Display name input
agent-browser click @e2                          # Set name
agent-browser wait --url "**/lobby"              # auto-navigates to the lobby
agent-browser snapshot -i
```

Note: the redirect lands on `/profile?returnTo=%2Flobby` (query string included), so a `wait --url "**/profile"` glob will NOT match — wait for the "Display name" textbox or use `**/profile*` instead.

### 2. Create a match

The lobby's "Create Match" card (HOST badge) has: **Players** radio group (2/3/4), **Board size** select (e.g. "32 × 32"), **Cities per player** select, and a "Create match" submit button. Defaults are fine for a quick smoke test.

```bash
agent-browser snapshot -i
agent-browser click @eN                          # Players radio (2 is default)
agent-browser click @eM                          # Create match button
agent-browser wait --url "**/match/*"            # host lands on /match/<id>
agent-browser snapshot -i
```

The host lands on `/match/<id>` and sees the **waiting room** — a "Match created — entering the waiting room." notice plus "Waiting for N more player… (M/2)" and "Seated as <handle> · X of 2 seats filled · starting when full" — until a second player joins; matches auto-start when full. The match ID is in the URL; copy it for the join flow below.

### 3. Join or spectate a match

```bash
# Join as a player (takes the first open seat)
agent-browser open "http://localhost:8080/match/<id>/join"

# Spectate read-only (no identity needed)
agent-browser open "http://localhost:8080/match/<id>/spectate"
```

### 4. Explore the live match view

Once a match is running, the snapshot exposes these labeled regions:

| Region | How to find it | Notes |
| --- | --- | --- |
| Game board | `aria-label="Game board"` region; cells are `role="gridcell"` | Cells have stable ids `#europa-cell-<x>-<y>` and aria-labels like `Cell (3, 5), 12 troops, Player 1, city, pipes: N, E` |
| Status bar (HUD) | `aria-label="Status bar"` | Tick counter, reserves %, player colors |
| Order palette | `aria-label="Order palette"` with a toolbar `aria-label="Order commands"` | Buttons: "Exclusive pipes" (toggle), "Clear pipes" |
| Reserves control | `aria-label="Reserves control"` | Per-cell reserve presets in a group labeled "Reserve presets" (digit buttons) |
| Minimap | `role="img"` + `aria-label="Minimap"` | Click to pan the camera |
| Match participants | `aria-label="Match participants"` | Seat list with handles |
| Surrender controls | `aria-label="Surrender controls"` | Only when surrender is available |

**Clicking board cells** — cells are positioned divs with stable ids, so raw CSS selectors work:

```bash
agent-browser click "#europa-cell-3-5"    # select a cell (orders target it)
agent-browser click "#europa-cell-3-6"    # second click lays a pipe / issues the order
```

Cell aria-labels are your ground truth for what's on a cell (troops, owner, city, pipes). Use `snapshot -i` scoped to the board (`-s "#board"` or similar) or `get text` on a cell ref when you need details.

### 5. Two-player testing (parallel sessions)

For multiplayer flows (auto-start, both seats issuing orders, fog-of-war differences), run **two isolated browser sessions** — each has its own cookies, tabs, and refs. Derive stable ids, then pass the **explicit `--session` flag on every command** (more reliable than the `AGENT_BROWSER_SESSION` env var when juggling multiple sessions — the env var can silently apply to the wrong session in subshell contexts):

```bash
S1="$(agent-browser session id --scope worktree --prefix p1)"
S2="$(agent-browser session id --scope worktree --prefix p2)"

# Session A: host creates the match
agent-browser --session "$S1" open http://localhost:8080/lobby
# ... set identity, create match, note the /match/<id> URL ...

# Session B: second player joins
agent-browser --session "$S2" open "http://localhost:8080/match/<id>/join"
# ... set identity if needed, join, watch auto-start ...

# Back to session A to verify the board is live
agent-browser --session "$S1" snapshot -i
```

Each session needs its own identity (the handle is per-session state). Spectators can watch from a third session without any identity.

## Screenshots

```bash
agent-browser screenshot lobby.png              # viewport capture, saved relative to cwd
agent-browser screenshot --full full-page.png   # full scroll height
agent-browser screenshot --annotate map.png     # numbered labels keyed to snapshot refs (great for multimodal review)
```

Save screenshots with descriptive names (route + state, e.g. `lobby-named.png`, `match-board-tick-120.png`) so a human can tell them apart. For "how does this render?" questions, inspect computed styles instead: `agent-browser inspect @eN`.

## Responsive checks

```bash
agent-browser resize mobile     # or tablet, desktop, fill
agent-browser snapshot -i       # re-snapshot after every resize
agent-browser screenshot mobile-lobby.png
```

## Accessibility audit

agent-browser embeds axe-core — audit the current page (or navigate + audit in one command):

```bash
agent-browser a11y                                   # current page
agent-browser a11y http://localhost:8080/lobby       # navigate, then audit
agent-browser a11y --tags wcag2a,wcag2aa             # filter by rule tags
agent-browser a11y --json                            # structured output
```

## Reading server output

The host server prints its startup banner (version, mode, Console UI / Lobby / join URLs) to PM2's captured stdout. When exploring, check the logs to confirm the server is up and see its banner:

```bash
npx pm2 logs host --lines 50 --nostream    # recent host output (startup banner)
npx pm2 logs host --nostream               # stream live (Ctrl+C to stop)
```

Log files live at `~/.pm2/logs/host-out.log` and `~/.pm2/logs/host-err.log`. Note: per-seat join lines (`▶ ... joined`) are tapped in host forwarders and may NOT surface in PM2's captured logs — the browser UI (waiting room seat count, participants list) is the reliable signal for seat state. See the server-manager skill for the full log workflow.

## Cleanup

```bash
agent-browser close                 # close the browser session
npx pm2 delete all                  # stop and remove all managed servers
```

## App-specific gotchas

- **Identity gating**: `/lobby` silently redirects unnamed visitors to `/profile`. If a snapshot shows the profile page when you expected the lobby, you're unnamed — set a handle first.
- **Waiting room**: a player who joins an unfilled match sees the waiting room ("Waiting for N more player… (M/2)", "Seated as <handle> · X of 2 seats filled · starting when full") on a dark board until auto-start. This is correct behavior, not a hang — fill the second seat (or spectate) to proceed.
- **Board cells need the match running**: before auto-start there are no live cells to click; the board is inert. Wait for the first tick (HUD tick counter advancing) before issuing orders.
- **Fog of war**: each player sees only their own territory plus a Chebyshev horizon. Two sessions will legitimately show different boards — that's the feature, not a bug.
- **The dev server is not the full stack**: `pnpm dev` (Vite, :5173) serves the frontend with HMR but no match server. For end-to-end exploration (lobby → match → board), use the host server on :8080. The docs server (:4321) serves the player manual under `/europa-neo/`.