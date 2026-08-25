# Reading the screen

The console is deliberately minimal. This page tours everything it can show you, so no status or message is ever cryptic.

## The status chip

The HUD's status line tells you where you stand in the match lifecycle. It shows one of these values:

| Status | What it means | What to do |
| --- | --- | --- |
| `idle` | Not connected to any match yet (for example, the console opened without a join link) | Open a join link to start |
| `connecting` | Handshake with the match server is in progress after opening a join link | Wait a moment |
| `live` | You are seated and receiving ticks; your orders are accepted | Play! |
| `reconnecting` | The connection dropped; automatic reconnection is under way and a banner shows above the board | Keep the tab open |
| `expired` | The 60-second grace window elapsed while you were away — your seat is forfeited | Rejoin via a fresh link or a new match (see [Quick start](./quick-start.md)) |
| `spectating` | You are watching without a seat — after surrendering/elimination, or joining a full match as an observer | Watch freely; orders are not available |
| `game_over` | The match's final result has been delivered; the end-of-match announcement is shown | Review the board, then start a new match for another game |
| `closed` | The console session was explicitly closed | Reload your join link to return |

While anything other than `live`, all order controls are disabled — the buttons gray out rather than silently swallowing clicks.

## The tick counter

Next to the status chip, **Tick** counts game heartbeats since the match started at four per second. It is the game's clock: production, pipe flow, combat, and decay all resolve once per tick (see [Cities and troops](./cities-and-troops.md)). A running counter means the match is alive; a frozen one means nobody is seated or the connection stalled.

## The minimap

The small map in the HUD mirrors the whole visible board and draws a rectangle showing which part currently fills your main view:

- **Click anywhere on the minimap** to jump the camera there.
- Use it to keep an eye on distant fronts without scrolling.

## The order bar

Below the board: the current pipe mode ("Toggle pipes" or "Exclusive pipes"), the **Exclusive pipes** toggle, and the **Clear pipes** button. Details in [Controls](./controls.md).

## The reserves panel

Appears when you have a selected cell: a slider from 0% to 90% plus ten digit buttons, mirroring the number keys. Details in [Reserves](./reserves.md).

## Feedback messages

Short messages appear near the bottom of the screen after your actions:

- Confirmations: "Pipe north at (5, 7)", "Reserved 70% at (3, 4)", "Cleared all pipes at (2, 2)".
- Rejections: "Target is out of range (max 2 cells)", "Can't target a water cell", "You don't own that cell", "Source cell has no troops", "You have already surrendered", "The match is already over".

They fade after a couple of seconds. A rejection always means nothing was sent — fix the cause and try again.

## Overlays you will meet

| Overlay | When | Meaning |
| --- | --- | --- |
| "Waiting for opponent to join…" | You are seated but the match has not started | The match auto-starts when both seats fill; the overlay hides itself at the first tick |
| "Reconnecting to match…" banner | Connection lost mid-match | Auto-reconnect is trying; stay in the tab (see [Quick start](./quick-start.md)) |
| Surrender dialog | After clicking **Surrender…** | Explicit confirm step — Cancel/Escape backs out, confirming eliminates you on the spot (see [Objective](./objective.md)) |

## End of match

When a match ends — victory, defeat, or draw — the console announces **"Match over"** and switches to `game_over`. The final board stays on display so you can survey the wreckage. If you finished playing but the match is somehow still running (for example, you surrendered), you spectate with a full-board view and no orders until it wraps up.

---

[Back to contents](./index.md)
