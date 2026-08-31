# Quick start

Europa Neo opens at the **public lobby** (`/lobby`). This page walks you from choosing a handle to issuing your first orders. See [The public lobby](./lobby.md) for the complete browser guide.

## Step 1: Choose a handle

In **Your name**, enter a display name and choose **Set name**. Use 1–24 Unicode characters after trimming, with at least one non-whitespace character. Do not use control characters, invisible direction markers, or malformed Unicode; well-formed emoji counts as one character. If the name is already in use, choose another; comparison ignores case and surrounding whitespace.

You can rename yourself later with **Change name** and **Update name**. Your accepted handle is the name shown in the lobby, waiting room, and match participant labels.

## Step 2: Create or find a match

- To host, choose **Players**, **Board size**, and **Cities per player** in **Create a match**, then choose **Create match**.
- To play in someone else's waiting game, choose **Join**.
- To watch a running game, choose **Spectate**. Spectating is full-visibility and read-only: it has no seat and cannot send player orders.

The resulting match address uses a semantic path such as `/match/m-123/join` for player entry or `/match/m-123/spectate` for read-only viewing. A plain `/match/m-123` address adapts to the match state: an open waiting match offers player entry, while a running match is viewed as a spectator. The address contains no display name, reconnect token, or WebSocket address. Your accepted handle and reconnect session come from this browser's stored guest session.

The lobby list shows loading and empty states explicitly. It updates as games fill, start, and finish. A match that disappears before your action is accepted produces a recoverable message and a refreshed list.

## Step 3: Wait for the game to start

After creating or joining, you may see a waiting overlay — for example, **"Waiting for 2 more players… (1/3)"** — with your handle and the seat count (shown as *k / N*, where *k* seats are filled of *N* total). The game starts automatically when all required seats are filled. You do not need to refresh or press Start. On the first tick, the waiting view changes to the board.

If you return to `/lobby`, your active match is marked **Your match** and cannot be claimed again by the same guest session.

## Step 4: Play

Once ticks start flowing (the HUD shows a running tick counter), you are commanding. Safe first things to try:

- **Click a cell** to select it — a targeting highlight shows where you are aiming.
- **Click near an edge of the selected cell** (or press i/j/k/l) to lay pipes toward that region. Pipes deliver troops into neighboring cells; see [Pipes](./pipes.md).
- **Press a digit key** (0–9) to set reserves on the selected cell; press 0 to clear reserves again. See [Reserves](./reserves.md).

When you are ready for offense, read [Special weapons](./special-weapons.md) for paratroopers and guns, and keep the [Controls](./controls.md) reference open nearby.

## Refreshing, disconnecting, and forfeiting

Life happens: tabs get refreshed, laptops sleep, Wi-Fi drops.

- **Refresh the same semantic match path within 60 seconds** and the existing guest session can reclaim the same seat and accepted handle — the match continues as if you never left.
- **Stay away longer than 60 seconds** and your seat expires: you forfeit the match. Return to `/lobby`, then choose another match or create a new one.
- If the connection drops mid-match but you stay put, the console shows a **"Reconnecting to match…"** banner and tries to restore your session on its own — keep the tab open.

The 60-second grace window is measured from the moment your connection dropped.

## Unstarted matches do not wait forever

A waiting match that never fills is eventually cleaned up by the host after about five minutes. If the waiting overlay never goes away, return to the lobby and choose another match or create a new one.

If the server restarts, its in-memory lobby and guest sessions reset. Reload, choose a handle again, and create or join a new match.

## Hosting a multi-player match (self-host)

If you run Europa Neo yourself, the single-command host boots one web server on `http://localhost:8080/` and prints a join URL for each seat. For a 3-player game on the 48×48 board:

```bash
pnpm host --players 3 --board-size 48
```

This creates a public 3-player match that auto-starts when the third seat is claimed, and prints three join URLs — all served from the single `8080` port (there is no second port). Omit `--board-size` and the host picks the default for the player count (3p → 48). See the project README for the full self-hosting guide.

---

[Back to contents](./index.md)
