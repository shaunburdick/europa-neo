# `@europa/design`

Europa Neo's shared design system — the authoritative source of tokens and reusable
component/layout primitives for the console and the player manual.

The authoritative design contract is **`DESIGN.md` at the repo root**. That file
is the versioned, living spec for every token, every `europa-*` class-name family,
and every accessibility pairing. This README is intentionally short and carries no
competing catalog — see `DESIGN.md` for the full reference.

- **Package**: `packages/design` → `@europa/design` (`private: true`, never published)
- **Contract**: [`DESIGN.md`](../../DESIGN.md) at the repo root
- **Feature spec**: [`specs/012-design-system/spec.md`](../../specs/012-design-system/spec.md)
- **Plan**: [`specs/012-design-system/plan.md`](../../specs/012-design-system/plan.md)
- **Brand spec**: [`specs/015-logo-assets/spec.md`](../../specs/015-logo-assets/spec.md)

Generated brand assets are available only after `pnpm --filter @europa/design build`:
`@europa/design/brand` exposes the typed manifest and
`@europa/design/brand/*` exposes declared files below `dist/brand/`. Source masters
and unlisted files are not package exports.

## Usage (after tokens land in T-005)

```ts
import { TOKENS } from '@europa/design';
import '@europa/design/dist/design.css'; // single stylesheet source

console.log(TOKENS.color.pageBg); // '#0b0f19'
```

```css
/* Any consumer stylesheet */
.my-panel {
    background: var(--europa-color-surface);
    border-radius: var(--europa-radii-plate);
}
```

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @europa/design build      # tsup → dist/ (ESM + dts)
pnpm --filter @europa/design test       # vitest
pnpm --filter @europa/design lint       # biome check
pnpm --filter @europa/design typecheck  # tsc --noEmit
```

## Project layout

```
packages/design/
├── src/
│   └── index.ts              # public barrel (re-exports tokens once they land)
├── tests/                    # drift / no-literals / a11y guards (from T-011)
├── tsup.config.ts            # entry src/index.ts → dist/index.{js,d.ts} + CSS emitter hook
└── tsconfig.json             # extends tsconfig.base.json (strict:true)
```

---

## License

Open source; license TBD by the project owner.
