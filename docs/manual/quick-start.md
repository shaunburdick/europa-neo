# Quick start

Europa Neo has no lobby screen. Matches are reached through **join links** — this page walks you from clicking a link to issuing your first orders.

## Step 1: Open your join link

A join link looks like this:

```
http://HOST:5173/?live&ws=ws%3A%2F%2FHOST%3A8080&match=MATCH-ID&name=YOUR-NAME&token=SEAT-TOKEN
```

Whoever starts the match (for example, a friend running the game's local host command) sends you one link per player. Each link contains:

| Part | Meaning |
| --- | --- |
| `?live` | Tells the console to connect to a real match server |
| `ws=` | The match server's address (encoded) |
| `match=` | The match id — which match you are joining |
| `name=` | Your display name, shown to the other player |
| `token=` | Optional. Your personal seat token |

The seat token matters: it identifies *you* as the owner of your seat. Keep your own link to yourself — anyone with it can reclaim your seat.

## Step 2: Get seated

Open the link in a desktop browser. The console connects, shakes hands with the match server, and claims your seat. You will see the status chip move from `connecting` to `live` (see [Reading the screen](./reading-the-screen.md)).

If the match still needs another player, you will see a **"Waiting for opponent to join…"** overlay with a spinner instead of a ticking board. This is normal: the match starts automatically once both seats are filled, and the overlay hides itself at the first tick — you do not need to click anything or refresh.

## Step 3: Play

Once ticks start flowing (the HUD shows a running tick counter), you are commanding. Safe first things to try:

- **Click a cell** to select it — a targeting highlight shows where you are aiming.
- **Click near an edge of the selected cell** (or press i/j/k/l) to lay pipes toward that region. Pipes deliver troops into neighboring cells; see [Pipes](./pipes.md).
- **Press a digit key** (0–9) to set reserves on the selected cell; press 0 to clear reserves again. See [Reserves](./reserves.md).

When you are ready for offense, read [Special weapons](./special-weapons.md) for paratroopers and guns, and keep the [Controls](./controls.md) reference open nearby.

## Refreshing, disconnecting, and forfeiting

Life happens: tabs get refreshed, laptops sleep, Wi-Fi drops.

- **Refresh or reopen your own join link within 60 seconds** and your seat is reclaimed automatically — the match continues as if you never left.
- **Stay away longer than 60 seconds** and your seat expires: you forfeit the match and the console reports `expired`. Rejoining requires a fresh link or a new match.
- If the connection drops mid-match but you stay put, the console shows a **"Reconnecting to match…"** banner and tries to restore your session on its own — keep the tab open.

The 60-second grace window is measured from the moment your connection dropped.

## Unstarted matches do not wait forever

A match that never fills its second seat is cleaned up by the host after about five minutes. If your waiting overlay never goes away, ask whoever created the match for a fresh link.

---

[Back to contents](./index.md)
