# `@europa/version`

Europa Neo's shared application version. This tiny private package owns
**`APP_VERSION`** — the single plain-string constant that every guarded
surface projects:

- the WebSocket hello acknowledgment (`HelloAckPayload.appVersion`, spec 004),
- the unauthenticated `GET /version` HTTP endpoint,
- the console HUD footer,
- the README header line and the player-manual index footer.

One value, visible everywhere it matters (feature 009, spec at
`specs/009-shared-app-versioning/spec.md`).

## Rules

- **Single source (FR-001)**: the root `package.json` `version` field is
  the source of truth. Every workspace package carries the identical
  version in lockstep, and `APP_VERSION` mirrors that value exactly.
- **Private + dependency-free (FR-002)**: never published to any
  registry (`"private": true`); zero runtime dependencies; consumed via
  pnpm workspace linking (bundled into the browser build,
  symlink-resolved on Node, carried inside images).
- **App ≠ protocol (FR-004 boundary)**: `APP_VERSION` is *release
  identity*; spec 004's `NETWORK_API_VERSION` is the *compatibility
  contract*. Separate lifecycles — neither implies nor derives the other.
- **Drift-checked (FR-009)**: a drift check (CI workflow + local
  script) fails whenever any guarded surface disagrees with
  `APP_VERSION`, naming every offending file.

## The one-commit bump convention

Releases bump **every** guarded location in one dedicated commit —
never one file at a time:

1. the root `package.json` `version`,
2. every `packages/*/package.json` `version`,
3. `src/app-version.ts` (`APP_VERSION`),
4. the README header line and the manual index footer line.

The commit message convention is `chore(release): vX.Y.Z`. (The first
lockstep value, `0.0.1`, lands inside feature 009's own change set per
the spec's Clarifications v1.1.) After bumping, run `pnpm version:check`
— it must exit 0 before the commit lands.

## Usage

```ts
import { APP_VERSION } from '@europa/version';

console.log(`Europa Neo v${APP_VERSION}`);
```

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @europa/version build      # tsup → dist/ (ESM + dts)
pnpm --filter @europa/version test       # vitest
pnpm --filter @europa/version lint       # biome check
pnpm --filter @europa/version typecheck  # tsc --noEmit
```

## Project layout

```
packages/version/
├── src/
│   ├── app-version.ts      # APP_VERSION — the single-source constant
│   └── index.ts            # public barrel
└── tests/                  # vitest suites (unit + integration)
```

---

## License

Open source; license TBD by the project owner.
