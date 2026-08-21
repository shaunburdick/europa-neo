# Europa Neo

A modern, open-source, self-hostable reimplementation of **Europa** — the groundbreaking 1990s Java applet game of real-time nanobot warfare on Jupiter's icy moon.

## What is this?

In the late 1990s, [Europa](https://web.archive.org/web/1999*/games.dangerous-minds.net) let two players wage real-time war across the surface of Europa from their browsers — years before "browser game" meant anything. Players commanded colonies of self-replicating nanobots: cities produced troops, pipes directed their flow across a hostile landscape, and paratroopers and artillery broke stalemates. Fog of war meant you only ever saw what your nanobots could sense.

**Europa Neo** rebuilds that experience for the modern web:

- **TypeScript everywhere** — Node.js server, browser client
- **Server-authoritative deterministic simulation** — replayable, testable, fair
- **Real-time multiplayer over WebSockets** — public matches in a lobby, private matches via shareable links
- **Faithful core loop, modernized UX** — cities, pipes, fog of war, paratroopers, guns; none of the 1990s friction
- **Self-hostable** — run your own server for your friends

## Game concept (the 60-second version)

You land on Europa with a handful of nanobot production facilities (**cities**). Cities produce troops until saturated. You direct troops between cells with **pipes** — downhill flows fast, uphill is slow. Cut off from supply, troops **decay**. Where opposing flows meet, nanobots fight to mutual attrition — bigger forces win. **Paratroopers** (2 spent per 1 landed) hop gaps and sever enemy pipes; **guns** shell anything in range, friend or foe. You see only what your troops sense — no radar memory, no cheating. Last commander standing wins.

## Project status

**Specification phase complete.** The project follows [spec-driven development](https://github.com/github/spec-kit) via spec-kit:

| Phase                                   | Status |
| --------------------------------------- | ------ |
| 1–3. Constitution + feature specs       | ✅ Done |
| 4–5. Architecture plan + task breakdown | ⬜ Next |
| 6. Implementation                       | ⬜ Pending |

Feature specifications live in `.specify/features/`:

1. `001-core-game-engine` — deterministic tick simulation: terrain, cities, pipes, combat, decay, reserves, paratroopers, guns, victory
2. `002-fog-of-war-visibility` — per-player sensor horizons with strict no-memory rule
3. `003-procedural-terrain-generation` — GeoMorph-inspired symmetric, seed-reproducible maps
4. `004-multiplayer-networking` — authoritative WebSocket protocol, delta sync, reconnection
5. `005-client-console` — satellite-view renderer with original control scheme parity + modern QoL
6. `006-match-lifecycle-matchmaking` — lobby (public), shareable-link private matches, rematch, forfeit policy

The governing principles are in `.specify/memory/constitution.md`.

## Repository layout

```
europa-source/          Trimmed documentation subset of the original game site (reference material)
  └── games.dangerous-minds.net/Europa/html/Europa/
      ├── rules.html    Original mechanics (authoritative gameplay reference)
      ├── controls.html Original control scheme
      └── …             Strategy, rating system, background docs + images
.specify/               Spec-kit tooling: constitution, feature specs, templates, scripts
```

## Development

This project is developed agent-first but human-governed: AI agents do the heavy lifting under a constitution (`AGENTS.md` at the repo root defines the working rules). Humans review at every phase gate.

```bash
# After implementation begins:
npm install
npm test
npm run dev
```

(Tooling specifics will be recorded here as phases 4–5 establish them.)

## Credits & licensing

- The original **Europa** was created by **Alex Nicolaou** and **Jay Steele** (University of Waterloo, ~1999), whose design this project celebrates. The archived source in `europa-source/` remains © Alex Nicolaou under the SOS Simple Open Source License v1.03 — it is included unmodified as reference material.
- Europa Neo's new code is an independent reimplementation from documented behavior, not a derivative of the original Java code. A license for the new code will be chosen before first release.
