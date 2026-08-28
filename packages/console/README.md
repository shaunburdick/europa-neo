# @europa/console

Europa Neo client console — satellite-view board rendering, region-based
pipe orders, subcell paratroop/gun targeting, reserves control, and the
modern QoL layer. React 19 SPA; server-authoritative (never simulates).

**Status**: Implemented (feature 005, all five user stories + Phase 8
polish). See `specs/005-client-console/spec.md`.

## Install

From the repo root (pnpm 11 workspace):

```bash
pnpm install
```

## Scripts

| Script                | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `dev`                 | Vite dev server on :5173 (`?e2e` boots the Playwright harness)       |
| `build`               | typecheck → vite build → asset pipeline → tsc library emit           |
| `build:lib`           | Library emit only (`tsc` + flatten `dist/src` → `dist`)              |
| `build:assets`        | SVG→PNG sprites + sound copy into `public/`                          |
| `test:unit`           | Unit tests (node/happy-dom): reducer, input math, QoL primitives     |
| `test:component`      | Component tests (Vitest Browser Mode + vitest-browser-react)         |
| `test:a11y`           | axe-core WCAG 2.2 AA acceptance tests (browser mode)                 |
| `test:e2e`            | Playwright E2E (requires `pnpm exec playwright install chromium`)    |
| `test:perf`           | Perf budgets in real Chromium: paint < 8 ms, reduce < 1 ms, preflight < 0.1 ms |
| `test:determinism`    | SC-002: 1000-tick scripted match vs committed golden fixture         |
| `test:parity`         | Subcell mapping vs the original's documented behavior                |
| `test:selfhost`       | Production build → remote-URL scan → gzip bundle budget (< 150 KB)   |
| `lint` / `format`     | Biome                                                                |
| `typecheck`           | `tsc --noEmit` over `src/`                                           |
| `typecheck:conformance` | Strict tsc program over `src/` + the conformance test              |
| `coverage`            | Vitest v8 coverage (80% thresholds — constitution III)               |

The console inherits the root `biome-config-shaunburdick` baseline. Its
package config intentionally keeps three scoped accessibility exceptions:
`useSemanticElements`, `useFocusableInteractive`, and
`noNoninteractiveTabindex`. The ARIA grid overlay uses custom keyboard
semantics for cell navigation; the exceptions do not apply to other packages.

## Usage

The console is an embeddable library. Hosts call `createConsole`,
mount it into a container, and tear it down when done:

```ts
import { createConsole } from '@europa/console';

const europa = createConsole({
  client: {
    url: 'ws://localhost:8080',
    displayName: 'Alice',
    matchId, // join a known match; omit to connect only
  },
  // The console never touches localStorage; the host persists QoL.
  persist: (settings) => localStorage.setItem('europa:qol', JSON.stringify(settings)),
});

await europa.mount(document.getElementById('root')!);
// ... user interacts; the runtime drives state + network ...
await europa.unmount();
```

Programmatic surface (all on the returned handle): `subscribe`, `getState`,
`dispatch`, `sendOrder`, `getConnectionStatus`, `requestSurrender`,
`setQolSettings`, and `setCamera`. The full type surface lives in
`dist/index.d.ts`; the
source-of-truth contracts are `specs/005-client-console/
contracts/` (mirrored byte-identically under `contracts/`).

### Network client (browser WebSocket, shipped)

The console ships a real browser client: `createWsMatchClient`
(`src/net/ws-match-client.ts`) speaks feature 004's wire protocol over
the native `WebSocket` API using networking's own frame codec (via the
`@europa/networking/browser` subpath — a browser-safe export that never
pulls in `ws`/`node:*`). It is the DEFAULT: `createConsoleClient` and
`createConsole` connect to `client.url` with no injection required.
Handshake (`hello`→`helloAck`), seat claim (`joinMatch`→`joinAck`),
order acks correlated by true wire seq, heartbeat pings at half the
server-advertised interval, and reconnect-token joins are all handled.

Hosts can still swap the transport:

```ts
createConsole(config, {
  clientFactory: (clientConfig) => myMatchClientAdapter(clientConfig),
});
```

Tests use the same seam with `FakeMatchClient` (`src/internal/`). v1
limitation: there is no automatic reconnection loop for the embeddable match
client — a transport loss surfaces as the `reconnecting` status. The host or
integrator must reconnect with the credential supplied for that seat to reclaim
it within the grace window.

### Run the local lobby (`pnpm host`)

One command boots the whole stack — matchmaker + match server on `:8080` and
the built console served from `dist/` on the single HOST_PORT (default `:8080`) — with an empty public lobby:

```bash
pnpm build                        # once; host serves dist/
pnpm --filter @europa/console host
```

Open `http://localhost:8080/`, choose a handle, and create or browse a public
game. **Join** is available only for open waiting matches; **Spectate** is
available only for running matches and is full-visibility but read-only. Port
overrides: `--port N` (or `HOST_PORT`). The default bind is
loopback-safe (`127.0.0.1`). For LAN play, use `--bind-host 0.0.0.0
--public-host 192.168.1.20` or `HOST_BIND_HOST` / `HOST_PUBLIC_HOST`; a
wildcard bind requires an explicit public host so printed links are reachable.
The script is dependency-free glue over node:* builtins; it mirrors the host-wiring
recipe exercised by `tests/e2e/full-stack.spec.ts`.

Pass `--create` for the explicit quick-test mode: it creates and fills a public
two-player match. The default mode never pre-creates a match.

Guest identities and accepted handles are ephemeral, in-memory state. Handles
are validated to 1–24 Unicode code points after trimming, at least one
non-whitespace character, no control characters, no bidirectional formatting
controls, and no unpaired surrogates; uniqueness is case-insensitive on the
trimmed value and well-formed emoji counts as one code point. A reload
can restore the browser's active identity during the reconnect grace window;
clearing browser storage or restarting the server cannot. The server resolves
the identity, handle, seat, order authority, and view, overlaying accepted
handles at the networking boundary without mutating engine simulation state.
A reconnect within the grace window restores that association; an invalid or
mismatched reconnect credential cannot claim it. Player views stay
fog-filtered, while spectators have no seat and cannot issue orders. The lobby
distinguishes an initial loading state from a successfully loaded empty state
and shows distinct empty guidance. The opaque guest identifier is delivered
only in the directed identity event to its owner; public listings, other
connections, URLs, views, and logs remain free of it. Host diagnostics never
log bearer credentials or opaque identity identifiers.

The lobby normally connects to the WebSocket service on the same host as the
page. `?ws=` is retained for non-default ports and tests, but the client rejects
cross-host URLs and URLs containing credentials. The direct
`?live&ws=&match=&name=` route remains a development/test compatibility path,
not the normal self-host entry point. `/version` is served from the static
console origin and can be queried without credentials.

### Full-stack proof

`tests/e2e/full-stack.spec.ts` boots a real `createMatchServer` bound
to a real `createMatchmaker` (the host-wiring recipe lives in that
spec's `buildStack`: the server takes its matchmaker bridge via
`ServerDeps.matchmaker`; the matchmaker hands its handlers over through
an optional `bindMatchmaker` on the server), fills a public 2-player
match programmatically, then drives TWO Chromium consoles through the
real wire — ticks, orders from both seats, authoritative acks, and
per-seat fog-filtered views.

## Architecture notes

- **Runtime** (`src/runtime.ts` + `src/create-console.ts`): one store
  (zustand wrapper over the pure reducer), one network adapter, one
  order bridge. Reducer effects are interpreted by the runtime:
  `sendOrder` → bridge, `announce` → aria-live announcer, `persistQol`
  → host callback, `playSound` → injected sound player.
- **Rendering**: Canvas 2D board painter (`src/render/canvas.ts`)
  under a React DOM overlay; the ARIA grid overlay
  (`src/render/grid-overlay.tsx`) is the accessibility source of
  truth (WCAG 1.3.1/4.1.2). Painting happens synchronously on each
  committed state change via `useSyncExternalStore` — there is no rAF
  poller (a deviation from the original task prose, documented in the
  spec's Implementation Notes).
- **Labels**: `buildMapView` raises transient "%" labels from reserves
  diffs against the previous view; the label overlay owns TTL pruning.
- **Local preflight**: out-of-range/water/not-owner orders are
  rejected locally before sending (outcome-returning and silent on the
  wire, per research.md §13 #3); server rejections arrive as
  `orderAck` failures and get reducer feedback.
- **Player colors**: `DEFAULT_PLAYER_COLORS` p1/p2 = red/blue-600,
  p3/p4 = emerald/amber-600 (data-model had none).
- **Minimap**: the viewport rectangle uses the real board-area size
  (`useContainerSize`, ResizeObserver-driven); it falls back to the
  full-board default only when no non-degenerate measurement exists.

## Accessibility

WCAG 2.2 AA target (constitution Principle VI):

- Roving-tabindex ARIA grid with per-cell labels (coord + troops +
  owner); visible ≥3:1 focus ring.
- Hidden polite/assertive aria-live regions announce confirmations,
  rejections, reconnects, and match end without moving focus
  (`src/a11y/live-region.ts`, 500 ms repeat suppression).
- Keyboard-only play: the original control repertoire plus digit-key
  reserves, hotkey toggles, and Tab order skip-link → map → HUD →
  order bar (Q-A04).
- `prefers-reduced-motion` disables combat flashes and shortens
  transients (`src/qol/reduced-motion.ts`).

Enforced by axe-core acceptance tests (`pnpm test:a11y`).

## Determinism

The console never simulates: state advances only through the pure
reducer (`next = reduce(state, action, { nowMs })`), with no
`Math.random` anywhere. The sanctioned wall-clock boundary is the
store's dispatch clock (injectable via `deps.clock`). SC-002 is
proven by `pnpm test:determinism`: a 1000-tick scripted match through
the real pipeline (tick events + gestures + `buildMapView`) must be
byte-identical to the committed golden fixture
(`tests/fixtures/golden-1000-tick.json`). Intentional render-pipeline
changes require regenerating via
`scripts/generate-determinism-golden.ts` and diff-reviewing the
fixture.

## Performance

Budgets enforced in CI by `pnpm test:perf` (real Chromium,
warmup + best-of-rounds medians — never single-shot wall-clock):

| Path                              | Budget   | Observed (this machine) |
| --------------------------------- | -------- | ----------------------- |
| Full-board paint (32×32, 1024 cells) | < 8 ms | ~1.8 ms median          |
| `reduce(state, action)`           | < 1 ms   | ~0.2 µs                 |
| `localPreflightOrder`             | < 0.1 ms | ~0.3 µs                 |
| Initial bundle (gzip, dist/assets)| < 150 KB | ~75 KB                  |

## Self-hosting

Zero external service dependencies (constitution Principle VII):
no CDN assets, no analytics, no remote fonts. `pnpm test:selfhost`
builds for production, fails on any `http(s)` URL in the browser
payload (SVG namespaces and React error-message prose excepted), and
enforces the gzipped-bundle budget. For a complete self-hosted lobby,
use `pnpm host`, which serves `dist/`, the lobby, and the feature 004
match server in one process.

The bundled `pnpm host` is intended for localhost/LAN use only. Direct
internet exposure is not supported yet: public deployment needs a
TLS-terminating reverse proxy, rate limiting, and origin controls. The
static console origin also provides unauthenticated `GET /version` for
operator diagnostics.

## Conformance

The console is a leaf consumer of engine ↔ fog ↔ terrain ↔ networking
and adds nothing upstream (spec boundary rule). Enforced by
`tests/integration/contract-conformance.test.ts`:

- byte-identity of the four contract mirrors vs
  `specs/005-client-console/contracts/`;
- mutual assignability of the engine `Order` (8 variants), `World`,
  fog `PlayerView`, and networking `ConnectionState`/`MatchClient`
  with their canonical declarations;
- completeness of the built package surface (`dist/index.d.ts`
  exposes every contract type/const).

Run it with its strict typecheck program:

```bash
pnpm --filter @europa/console build          # conformance reads dist/
pnpm --filter @europa/console typecheck:conformance
pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/contract-conformance.test.ts
```
