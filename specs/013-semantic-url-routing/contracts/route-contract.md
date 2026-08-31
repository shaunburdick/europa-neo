# Semantic Route Contract

| Path | Adapter action | Match socket before resolution |
|---|---|---:|
| `/` | replace-navigate to `/lobby` | no |
| `/lobby` | mount public lobby | no |
| `/match/:id` | adaptive authoritative resolution | no |
| `/match/:id/join` | explicit player entry | no |
| `/match/:id/spectate` | explicit read-only entry | no |
| other safe path | announce recovery, replace-navigate `/lobby` | no |

Host ordering is invariant: `/version` first, then known assets, WebSocket
upgrades, traversal checks, and safe application-path SPA fallback. Missing assets
remain genuine 404s. Malformed escapes are rejected before filesystem resolution.

`?e2e` is unchanged and test-only. Production `?live`, `?ws`, `match`, `name`,
and `token` query boot is unsupported; `resolveInitialViewMode` is removed from
the public contract. Generated links and history entries contain only origin and
semantic path, never guest identity, handle, reconnect token, or WS endpoint.
