# The public lobby

The lobby is Europa Neo's default landing page. It is where you choose the name other players see, browse public matches, and decide whether to play or watch. No account is required.

## Choose a handle

On your first visit, the **Your name** card asks for a display name. Enter a name and choose **Set name**. Once accepted, the card says **Playing as** your handle and **Ready to play**. The browser remembers this guest session and name when you reload.

Handles must:

- contain 1–24 Unicode characters after surrounding whitespace is trimmed;
- contain at least one non-whitespace character; and
- contain no control characters or unsafe invisible direction markers.

Well-formed emoji count as one character. Unpaired or malformed Unicode characters are rejected. If the name is invalid, the field shows an explanation; correct it and submit again. A name can also be rejected because another active visitor is already using the same name, ignoring case and surrounding whitespace. Choose a different name in that case.

The accepted spelling and casing are shown to other players. To rename yourself, enter a new value in **Change name** and choose **Update name**. Renaming does not create a second player. Your updated name takes effect in the lobby list and for future matches; while you are in an ongoing match, other participants continue to see the name that was active when you joined. A name remains reserved while a temporary connection is within its reconnect grace period.

> **Tip:** Handles are temporary guest names, not accounts. Clearing browser storage or restarting the server starts a fresh guest session; it does not recover the old name.

## Find a match

The **Public matches** list shows eligible public games. Each row gives a short match label, status, occupied seats, capacity, board size, and tick interval.

| Row status | Action |
| --- | --- |
| **Waiting for players** with an open seat | Choose **Join** to claim one player seat. |
| **Waiting for players** and full | No action is offered; the game is about to start automatically. |
| **In progress** | Choose **Spectate** to watch without joining as a player. |
{: .europa-table }

The list updates when games are created, filled, started, or cleaned up. Finished games are not kept as history. If a game fills or disappears between the time you read the list and choose an action, the lobby reports that it is unavailable and refreshes the list.

If there are no eligible games, the lobby says **No public matches right now — create one to get started.**

## Create a public match

Choose settings in **Create a match**, then choose **Create match**:

- **Players:** 2, 3, or 4;
- **Board size:** 32 × 32 or 48 × 48 (64 × 64 is temporarily disabled — terrain generation is unreliable, issue #26 pending fix); and
- **Cities per player:** 1–4.

The server validates the settings. If a setting is unsupported, an explanation appears beside the relevant field and no match is created. Creating a match reserves your player seat and opens a waiting room. There is no separate Start button: when the required seats fill, the match starts automatically.

## Join and wait

After **Join** or **Create match**, you enter the match view. Before the game starts, it shows a waiting overlay — for example, **"Waiting for 2 more players… (1/3)"** — your accepted handle, and the seat count (shown as *k / N*). Keep the page open; the board appears and begins ticking when the match starts. The waiting message announces the transition for screen readers as well as visually.

Your own active match is marked **Your match** if you return to the lobby. Its row does not offer another Join or Spectate action, so the same guest session cannot accidentally claim a second seat.

## Spectate

Choose **Spectate** only on an **In progress** row. Spectator mode shows the full match view, including all participant handles, but it is read-only:

- you have no player seat;
- order controls do not issue orders; and
- you cannot change the match state.

Participant labels are handle-first and come from the server's accepted handles.
If a handle is unavailable, the interface uses a generic label or a safe ID
fallback; IDs are correlation data, not credentials. Labels are presented as
separate, direction-safe fields, so a right-to-left or mixed-direction name
cannot reorder surrounding text. Bearer credentials are never shown as labels,
printed in diagnostics, or requested from players.

## Leave, reconnect, and return

The match header has **Leave to lobby**. Choose it to release your match presence and return to the landing page; focus moves to the lobby heading and the return is announced. The accepted handle remains available for your next lobby action.

If a player's connection drops, the match shows **Reconnecting to match…** and tries to restore the connection. Keep the tab open. A temporary disconnect can reclaim the same seat and handle during the existing 60-second reconnect grace period. After the grace period, the seat is forfeited and you must choose another match or create a new one. The resume credential is handled by the browser and server; do not copy or share it.

## If something goes wrong

The lobby uses visible messages and screen-reader announcements instead of leaving a blank page:

- **Loading public matches…** means the first lobby list has not arrived yet; it is not an empty result.
- **Connection lost** or **Reconnecting to lobby…** means recovery is in progress.
- **Connection failed** provides **Retry connection**. Correct the server address or retry when the host is available.
- A duplicate name, invalid name, full match, unavailable match, or invalid session explains what to correct or try next.
- If the server restarts, the in-memory lobby is reset. Existing names, matches, and guest sessions are gone; reload to begin a fresh session.
- **This session moved somewhere else** means another browser took over the same guest session. Acknowledge the notice and set a new name to start fresh.

Use the native buttons, fields, radio buttons, and selects with Tab, Shift+Tab, arrow keys, and Enter or Space. The first Tab stop is **Skip to main content**. Errors and state changes are announced, focus is visible, and returning from a match places focus on the lobby heading. Reduced-motion settings are respected.

---

[Back to contents](./index.md)
