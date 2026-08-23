# @europa/console

Europa Neo client console — satellite-view board rendering, region-based
pipe orders, subcell paratroop/gun targeting, reserves control, and the
modern QoL layer. React 19 SPA; server-authoritative (never simulates).

**Status**: Phase 1 scaffolding (Wave 8A). No business logic yet — see
`.specify/features/005-client-console/tasks.md`.

## Scripts

| Script                | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `dev`                 | Vite dev server on :5173                                       |
| `build`               | typecheck → vite build → asset pipeline                        |
| `build:assets`        | SVG→PNG sprites + sound copy into `public/`                    |
| `test`                | Vitest (node mode, happy-dom)                                  |
| `test:unit`           | Unit tests only                                                |
| `test:component`      | Component tests (Vitest Browser Mode + vitest-browser-react)   |
| `test:a11y`           | axe-core acceptance tests (browser mode)                       |
| `test:e2e`            | Playwright E2E (requires `pnpm exec playwright install chromium`) |
| `test:perf`           | Render perf tests (browser mode)                               |
| `test:determinism`    | Scripted-match determinism (node mode)                         |
| `test:selfhost`       | Build + fail on remote URLs in `dist/` (constitution VII)      |
| `lint` / `format`     | Biome                                                          |
| `typecheck`           | `tsc --noEmit`                                                 |
| `coverage`            | Vitest v8 coverage (80% thresholds — constitution III)         |

## Phase 1 notes / known deviations

- **Contract mirrors are ambient declarations.** The four files under
  `contracts/` are byte-identical copies of
  `.specify/features/005-client-console/contracts/` and are kept
  pristine (excluded from Biome and from the tsconfig program). They
  use declaration-file syntax (uninitialized `export const`), which
  cannot compile as implementation modules (TS1155). The minimal
  `src/index.ts` barrel declares `CONSOLE_API_VERSION` /
  `ConsoleConstants` locally until Phase 2 rewires it to the
  compilable sources (task T037); the Polish-phase conformance test
  enforces parity with the mirrors.
- **Skip-link target**: `index.html` links to `#main`, which the
  placeholder App renders as `<main id="main">`; Phase 3's real App
  must keep an element with that id.
- **Version pins** resolved from the registry at scaffold time:
  `@vitejs/plugin-react@^6.1.0` (Vite 8 peer requirement; plan said
  ^4.x), `vitest-browser-react@^2.2.0` (latest major is 2.x), and
  `happy-dom@^20.11.6` (plan said ^15.x). All others match the plan.
- **Self-host scan allowlist**: besides SVG namespace URIs and license
  comment lines, React's minified error-message URLs
  (`react.dev/errors/…`) are allowlisted — they are prose inside
  thrown `Error` strings, not runtime resource fetches.
