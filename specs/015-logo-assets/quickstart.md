# Phase 6 Validation Quickstart

Implementation must be validated from a clean checkout with Node 22+, pnpm
11.22.0, and no network-dependent asset service.

```bash
pnpm install --frozen-lockfile
pnpm --filter @europa/design build
pnpm --filter @europa/design test
pnpm --filter @europa/design check:brand
pnpm build
pnpm --filter @europa/console test:selfhost
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Manual verification must build the Pages-scoped tree and inspect `docs/manual`
for every referenced brand file. Browser verification covers `/lobby` and a
match at desktop/mobile widths, keyboard focus, screen-reader names, reduced
motion, and a repository-subpath base. Host/Docker verification requests the
same paths and asserts status 200 plus `image/svg+xml`, `image/png`,
`image/x-icon`, and `application/manifest+json` content types.

The final acceptance record must include exact dimensions, contrast ratios,
generated-vs-source drift results, full-suite output, and the originality /
licensing checklist.
