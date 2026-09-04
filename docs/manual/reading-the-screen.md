# Reading the screen

The lobby and console are deliberately minimal. This page tours the status, participant, and recovery information they can show you. The lobby lives at `/lobby`; match views retain semantic addresses such as `/match/m-123/join` or `/match/m-123/spectate` while you play or watch.

## The lobby

The default landing page is **Europa Neo lobby**. Its cards show **Your name**, **Create a match**, and **Public matches**. The lobby connection and identity status are separate: **Connected** means the lobby transport is ready, while **Ready to play** means a valid handle has been accepted.

Public-match rows show **Waiting for players** or **In progress**, seat occupancy as *Players k / N* (for example, *Players 1 / 3*), capacity, board size, and tick interval. Open waiting rows have **Join**; in-progress rows have **Spectate**; full waiting rows say **Full**. The list may announce that a match was added, updated, started, or left the list.

The lobby can also show **Loading public matches…**, **No public matches right now — create one to get started**, an inline validation error, or a recoverable action error. See [The public lobby](./lobby.md) for the actions and recovery steps.

## The status chip

The HUD's status line tells you where you stand in the match lifecycle. It shows one of these values:

| Status | What it means | What to do |
| --- | --- | --- |
| <span class="europa-chip">idle</span> | Not connected to a match | Wait for the lobby or choose a match |
| <span class="europa-chip">connecting</span> | Handshake with the match server is in progress after choosing a lobby action | Wait a moment |
| <span class="europa-chip">live</span> | You are seated and receiving ticks; your orders are accepted | Play! |
| <span class="europa-chip">reconnecting</span> | The connection dropped; automatic reconnection is under way and a banner shows above the board | Keep the tab open |
| <span class="europa-chip">expired</span> | The 60-second grace window elapsed while you were away — your seat is forfeited | Return to the lobby and choose a match or create one (see [Quick start](./quick-start.md)) |
| <span class="europa-chip">spectating</span> | You are watching without a seat | Watch freely; orders are not available |
| <span class="europa-chip">game_over</span> | The match's final result has been delivered; the end-of-match announcement is shown | Review the board, then start a new match for another game |
| <span class="europa-chip">closed</span> | The console session was explicitly closed | Return to the lobby and choose another match |
{: .europa-table }

While anything other than `live`, all order controls are disabled — the buttons gray out rather than silently swallowing clicks.

In the match header, **In match** identifies a player view and **Spectating** identifies a read-only spectator view. **Leave to lobby** returns to `/lobby`. Every occupied player seat is labeled with its accepted handle, including your own. Names are displayed as isolated participant labels so mixed writing directions cannot rearrange nearby interface text.
If a handle is unavailable, a generic label or safe guest/player ID fallback may
be used. These IDs are non-secret correlation data, not access credentials.

The status bar also shows a small version indicator — the app version your console was built from — which stays visible whatever state the match is in.

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

## Overlays and recovery messages you will meet

| Overlay | When | Meaning |
| --- | --- | --- |
| "Waiting for N-k more players… (k/N)" | You are seated but the match has not started | The match auto-starts when all N seats fill; the overlay hides itself at the first tick. For a 2-player game this reads "Waiting for 1 more player… (1/2)"; for 3 players at 1/3 it reads "Waiting for 2 more players… (1/3)". |
| "Reconnecting to match…" banner | Connection lost mid-match | Auto-reconnect is trying; stay in the tab (see [Quick start](./quick-start.md)) |
| Surrender dialog | After clicking **Surrender…** | Explicit confirm step — Cancel/Escape backs out, confirming eliminates you on the spot (see [Objective](./objective.md)) |
| "This session moved somewhere else" | Another browser took over the guest session | Acknowledge it and set a new name |
| "The server restarted — the lobby was reset" | The in-memory server state was lost | Reload, set a name, and choose or create a match |
| "That match is no longer available" / "That match just filled up" | The listing changed before your action completed | Return to the refreshed list and choose another action |
{: .europa-table }

## End of match

When a match ends — victory, defeat, or draw — the console announces **"Match over"** and switches to `game_over`. The final board stays on display so you can survey the wreckage. If you finished playing but the match is somehow still running (for example, you surrendered), you spectate with a full-board view and no orders until it wraps up. Choose **Leave to lobby** when you are ready for another match.

## Keyboard and accessibility cues

The first Tab stop is **Skip to main content**. Native buttons, form fields, radio buttons, and selects are keyboard-operable with Tab, Shift+Tab, arrow keys, Enter, and Space. Focus is visible. Loading, empty, connection, identity, and action failures are announced without requiring a mouse; returning to the lobby moves focus to its heading. Reduced-motion preferences are honored by waiting and transition indicators.

---

[Back to contents](./index.md)
