# Quickstart: Semantic URL Routing

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm host
```

Open `/lobby`, create a waiting match, then use its semantic path from a second
browser. Verify adaptive `/match/<id>`, explicit `/join` and `/spectate`, reload,
Back/Forward, unknown/malformed recovery, and accessible notices.

Required gates:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @europa/console test -- --coverage
pnpm --filter @europa/console test:e2e
pnpm --filter @europa/console test:selfhost
pnpm build
docker compose config -q
docker build -t europa:semantic-url-check .
```

Run the repository stale-production-link/privacy guard. The known root `pnpm
test` baseline may report that `@europa/design` has no test files; record that
known issue separately and use package-targeted tests for this feature. Confirm
`?e2e` remains deterministic and `?live` never mounts a match runtime.
