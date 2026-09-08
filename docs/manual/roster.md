# The roster — who is online

The **roster** is a real-time list of every active player in the lobby. It appears on the lobby landing page at `/lobby` and tells you at a glance who is online, who is playing, and who is watching.

## What the roster shows

The roster card displays:

- **A heading** with the total count: "Players online (N)".
- **A list of players**, each showing their handle and a text status badge.
- **Your own entry** is marked with a "(you)" indicator after your handle.

```
Players online (3)
┌─────────────────────────────────────┐
│ Alice (you)         ● In lobby      │
│ Bob                 ● In game       │
│ Charlie             ● Spectating    │
└─────────────────────────────────────┘
```

Players are listed in alphabetical order by handle (case-insensitive). The list updates in real time as players join, leave, or change status.

## Status values

Each player's status is derived from their current activity:

| Status | Meaning |
| --- | --- |
| **In lobby** | The player is in the lobby and not in any match. They are available to play. |
| **In game** | The player is seated in a match (whether it is waiting for players or already in progress). |
| **Spectating** | The player is watching a match as a spectator. They are not a participant. |

The status updates automatically and in near real time — typically within one second of a change.

## How the roster updates

The roster pushes updates from the server:

- When a **new player connects** to the lobby, their entry appears.
- When a player **joins a match**, their status changes from "In lobby" to "In game".
- When a player **spectates a match**, their status changes to "Spectating".
- When a player **leaves a match** and returns to the lobby, their status returns to "In lobby".
- When a player **disconnects** (or their reconnect grace period expires), their entry is removed.

Players in **private matches** appear with their derived status ("In game" or "Spectating") but without any information about which match they are in — only their handle and status are shown.

## Presence unavailable

If the roster connection fails or the server does not support the roster, the card displays:

```
Players online (?)
┌─────────────────────────────────────┐
│ Presence unavailable                │
│ Presence data is not connected.     │
└─────────────────────────────────────┘
```

This means the roster data is not currently available — it does not mean nobody is online. The roster will recover automatically when the connection is restored.

## Accessibility

The roster is fully accessible:

- The list is keyboard-navigable (Tab through entries).
- Status changes are announced to screen readers via a live region (with coalescing to avoid announcement spam during rapid updates).
- All text and status badges meet WCAG 2.2 AA contrast requirements.
- Reduced-motion settings are respected — no animations on status changes.

---

[Back to contents](./index.md)
