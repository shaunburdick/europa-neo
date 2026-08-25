# Controls

Every pointer gesture and keyboard command in Europa Neo, exactly as implemented. Keep this page open during your first match. For what these commands *do* to the game, see [Pipes](./pipes.md), [Reserves](./reserves.md), and [Special weapons](./special-weapons.md).

Most commands act on your **selected cell** — the one highlighted by your last click or arrow-key move. The selected cell is also the launch point for paratroopers and guns.

## Pointer

| Gesture | Effect |
| --- | --- |
| Left-click near an edge of a cell | Toggle a pipe from that cell toward the clicked region (north/east/south/west). Clicking again removes the pipe. |
| Right-click near an edge of a cell | Lay an **exclusive pipe** toward the clicked region — it replaces all pipes in that cell instead of adding to them. |
| Alt+click near an edge of a cell | Same as right-click: an exclusive pipe toward the clicked region. |
| Mouse wheel / middle-button drag | Camera control — see [Camera](#camera) below. |

## Keyboard

| Key | Effect |
| --- | --- |
| i | Pipe north from the selected cell |
| j | Pipe west from the selected cell |
| k | Pipe south from the selected cell |
| l | Pipe east from the selected cell |
| Alt+i / Alt+j / Alt+k / Alt+l | Exclusive pipe north/west/south/east (replaces all pipes in the cell) |
| Space | Clear all pipes in the selected cell |
| p (or h) | Paratroop: launch from the selected cell to the target picked by your cursor's position inside that cell (see [Aiming](#aiming-paratroopers-and-guns)) |
| g (or o) | Gun: shell the target picked by your cursor's position inside the selected cell |
| 0–9 | Set reserves on the selected cell (0 = none, 9 = hold back 90%) |
| Escape | Cancel the current selection |
| Arrow keys | Move the selection one cell up/left/down/right |

### Aiming paratroopers and guns

Pressing p/h or g/o fires from the **selected cell**, and the target is picked without your cursor ever leaving that cell. While a cell is selected, the cursor's position *inside* it acts as a miniature map of everything within 2 cells:

1. Click a cell you own to select it.
2. Keep the cursor inside the selected cell and slide it toward where you want to fire — up for north, lower-right for south-east, and so on. The farther from the center, the longer the throw: halfway to an edge aims about 1 cell out; the edge or a corner aims the full 2.
3. Press p (or h) for paratroop, g (or o) for gun.

A red aim dot drawn on the selected cell shows exactly where you are pointing, and each new target cell is announced to screen readers as it changes. Cursor near the center of the cell means nothing launches — slide it off-center toward your target first (the same happens if the cursor has been still for a moment). Invalid targets — water for paratroops, cells outside your vision, no troops to pay with — are rejected with a short message above the order bar (see [Reading the screen](./reading-the-screen.md)).

## Camera

| Gesture | Effect |
| --- | --- |
| Mouse wheel | Zoom in/out, keeping the point under the cursor pinned in place |
| Middle-button drag | Pan around the board |

Zoom runs from 12 to 96 pixels per cell; a fresh match starts at 32 pixels per cell, which fits a standard 32×32 board on a typical desktop screen.

## On-screen buttons

The console's clickable controls mirror the keyboard commands, so mouse-only play works end to end:

| Control | Where | Effect |
| --- | --- | --- |
| Mode badge ("Mode: Toggle pipes" / "Mode: Exclusive pipes") | Order bar, below the board | Shows whether your next pipe command adds or replaces. Announces changes to screen readers. |
| **Exclusive pipes** toggle | Order bar | Flip sticky exclusive mode: while engaged, every pipe command (pointer or i/j/k/l) replaces the cell's pipes instead of adding. |
| **Clear pipes** | Order bar | Clear all pipes in the selected cell (same as Space). |
| Reserves slider | Reserves panel | Drag or arrow-key a value from 0% to 90% in 10% steps for the selected cell. |
| Digit buttons 0–9 | Reserves panel | One-click presets matching the number keys ("Set reserves to 70%", and so on). |
| **Surrender…** | Below the order bar | Opens the confirmation dialog. Confirming eliminates you on the spot (see [Objective](./objective.md)); Cancel or Escape backs out. |

All order buttons disable themselves when orders cannot be sent — while connecting, reconnecting, spectating, or after the match ends.
