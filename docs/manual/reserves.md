# Reserves

Reserves are a per-cell promise: *these troops stay put*. This page explains what reserving does, how to set it, and why a reserved garrison beats a hoarded pile.

## What reserves do

Setting reserves on a cell holds back a percentage of that cell's troops. The reserved count is pinned in place — it cannot be eaten by decay, so an unfed, reserved stack keeps its core alive instead of rotting to nothing.

Everything above the reserve remains available: to flow through pipes, to pay for paratroops and guns, and to fight.

## Setting reserves

Select a cell, then either:

- Press a **digit key**: 0–9 sets reserves from 0% to 90% in 10% steps (7 = 70%), or
- Use the **reserves panel**: drag the slider or click one of the digit buttons.

Press 0 (or slide to 0%) to clear reserves entirely.

| Digit | Reserve |
| --- | --- |
| 0 | None — everything is free to move |
| 1 | 10% held back |
| 5 | 50% held back |
| 9 | 90% held back |

There is no 100%: the maximum reserve is **90%**. A cell that reserved everything could never feed a pipe, fund a weapon, or fight — the game simply does not offer it.

The console flashes a confirmation like "Reserved 70% at (3, 4)" when the order lands (see [Reading the screen](./reading-the-screen.md)).

## Why reserves beat hoarding

An open (non-city) cell caps at **30 troops** no matter what. A pile of 30 troops in some backwater:

- produces nothing,
- decays unless fed,
- and cannot grow further.

Reserving changes the picture for cells you intend to hold:

- A **reserved forward garrison** survives supply interruptions that would otherwise decay it to zero — and losing all your troops anywhere brings elimination closer (see [Objective](./objective.md)).
- A **partially-reserved staging cell** keeps a defensive core while still letting the surplus stream to the front through pipes.
- Reserves on a **city** matter less: cities self-feed through production and never decay. Reserve cities only when you want to guarantee troops stay home rather than flow out.

## The rule of thumb

Reserve what you cannot afford to lose; leave the rest free to work. Set reserves before you extend a fragile supply line, clear them when you want everything moving again.

---

[Back to contents](./index.md)
