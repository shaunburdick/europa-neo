---
name: server-manager
description: >
  Manage Europa Neo development and production servers via PM2 for clean lifecycle
  control. Use this skill whenever you need to start, stop, restart, or inspect any
  server in the project — the host server (`pnpm host`), the Vite dev server
  (`pnpm dev`), or the Astro docs server (`docs:dev`). Also use this skill when
  you need to read server logs, check server status, debug server startup failures,
  or clean up server processes after a session. PM2 provides process isolation,
  automatic restarts, and structured logging — far cleaner than managing background
  PIDs manually. Trigger on: "start the server", "run the host", "boot the dev
  server", "check server logs", "stop all servers", "what's running", "server
  crashed", "port in use", or any server lifecycle question.
---

# Server Manager

PM2-based lifecycle management for all Europa Neo servers. PM2 runs as a daemon
in the background, giving you process isolation, automatic restarts, structured
logs, and clean teardown — no orphaned PIDs or stale ports.

## Quick Reference

All commands use `npx pm2` (no global install required). The ecosystem config is
at `.agents/skills/server-manager/scripts/ecosystem.config.cjs` relative to the
repo root.

### Start Servers

```bash
# Start a specific server
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only dev
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only docs

# Start all three at once
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs
```

### Stop Servers

```bash
# Stop a specific server (keeps it in PM2's process list)
npx pm2 stop host

# Stop all managed servers
npx pm2 stop all
```

### Remove Servers from PM2

```bash
# Remove a specific server (stops + deletes from PM2)
npx pm2 delete host

# Remove all managed servers
npx pm2 delete all
```

### Check Status

```bash
# Show all PM2 processes (status, PID, memory, restarts, logs)
npx pm2 status

# Show status for one process
npx pm2 show host
```

### Read Logs

```bash
# Stream live logs (Ctrl-C to stop streaming)
npx pm2 logs host

# Read last N lines without streaming
npx pm2 logs host --lines 50 --nostream

# Read all managed server logs
npx pm2 logs --lines 100 --nostream

# Clear all logs
npx pm2 flush
```

### Restart

```bash
# Restart a specific server
npx pm2 restart host

# Restart all
npx pm2 restart all
```

## Server Details

### `host` — Production Stack

The full game server: match engine + WebSocket transport + lobby + static SPA.
This is what players connect to.

| Property | Value |
|----------|-------|
| Command | `pnpm host` |
| Default port | `8080` |
| Port env | `HOST_PORT` |
| Health check | `GET /version` → `200` |
| Ready signal | Server logs "Match server listening" |

**When to use:** Testing the production deployment path, E2E debugging, exploring
the full stack as a player would see it, verifying self-hosting.

**Port override:**
```bash
HOST_PORT=9090 npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
```

### `dev` — Vite Dev Server

The console SPA development server with hot module replacement. No backend — the
SPA connects to a separate `host` server or operates standalone.

| Property | Value |
|----------|-------|
| Command | `pnpm dev --host 127.0.0.1` |
| Default port | `5173` |
| Port env | `VITE_PORT` |
| Health check | `GET /` → `200` |
| Ready signal | Vite outputs "Local: http://127.0.0.1:5173/" |

**When to use:** Frontend-only development, component debugging, rapid iteration
on the console UI without booting the full backend.

**Port override:**
```bash
VITE_PORT=3000 npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only dev
```

### `docs` — Astro Docs Server

The player manual development server (Astro).

| Property | Value |
|----------|-------|
| Command | `pnpm dev` (in `docs/manual/`) |
| Default port | `4321` |
| Port env | `DOCS_PORT` |
| Health check | `GET /europa-neo/` → `200` |
| Ready signal | Astro outputs "Dev server running at http://localhost:4321" |

**Notes:** The Astro config sets `base: '/europa-neo'`, so all routes are served
under that prefix (e.g. `http://localhost:4321/europa-neo/quick-start/`). Astro
binds to `localhost` (IPv6 `::1` on this machine), not `127.0.0.1` — the bundled
`ready.sh` accounts for both.

**When to use:** Editing or previewing the player manual, testing manual builds.

## Readiness Detection

After starting a server, wait for it to be ready before sending traffic. The
bundled `ready.sh` script polls a health endpoint:

```bash
# Wait up to 30 seconds (default)
.agents/skills/server-manager/scripts/ready.sh host
.agents/skills/server-manager/scripts/ready.sh dev
.agents/skills/server-manager/scripts/ready.sh docs

# Custom port and timeout
.agents/skills/server-manager/scripts/ready.sh host 9090 60
```

Exit 0 means ready. Exit 1 means timeout. The script prints what it's waiting for
and the last HTTP status code on failure — useful for diagnosing startup problems.

If you prefer inline polling without the script:

```bash
# Wait for the host server's /version endpoint
for i in $(seq 1 30); do
    curl -sf http://127.0.0.1:8080/version >/dev/null 2>&1 && break
    sleep 1
done
```

## Reading Server Logs

PM2 captures stdout and stderr from each process. Use `npx pm2 logs` to inspect
them. This is the primary way to debug server issues.

### Live streaming

```bash
# Stream host server logs in real-time (Ctrl-C stops streaming, server keeps running)
npx pm2 logs host

# Stream all servers at once (interleaved, prefixed with process name)
npx pm2 logs
```

### Historical logs

```bash
# Read the last 100 lines of host logs (no streaming)
npx pm2 logs host --lines 100 --nostream

# Read the last 200 lines of all servers
npx pm2 logs --lines 200 --nostream
```

### Log file locations

PM2 stores logs on disk. The paths are printed by `npx pm2 show <name>`, but
conventionally:

```
~/.pm2/logs/<name>-out.log   # stdout
~/.pm2/logs/<name>-err.log   # stderr
```

You can read these directly for large log volumes or piping:

```bash
# Tail the host server's stdout log
tail -50 ~/.pm2/logs/host-out.log

# Search for errors across all log files
grep -i error ~/.pm2/logs/*-err.log
```

### Clearing logs

```bash
# Flush (clear) all log files
npx pm2 flush
```

## Common Workflows

### Start host for exploration

```bash
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
.agents/skills/server-manager/scripts/ready.sh host
# Server is ready — open http://localhost:8080/lobby in browser
```

### Start dev server for frontend work

```bash
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only dev
.agents/skills/server-manager/scripts/ready.sh dev
# Vite HMR active on http://localhost:5173
```

### Start host + dev for full-stack dev

```bash
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only dev
.agents/skills/server-manager/scripts/ready.sh host
.agents/skills/server-manager/scripts/ready.sh dev
# Host on :8080, Vite on :5173
```

### Debug a server crash

```bash
# Check what happened
npx pm2 status                    # see restart count and status
npx pm2 logs host --lines 50      # read recent logs for the error
npx pm2 show host                 # detailed process info

# If it's an EADDRINUSE, something else is on that port
lsof -i :8080                     # find the occupant
npx pm2 delete host               # clean up the PM2 entry
# Kill the occupant, then restart
```

### Clean up after a session

```bash
# Stop everything and remove from PM2
npx pm2 delete all

# Verify clean slate
npx pm2 status
# Should show an empty process table
```

### Check what's running

```bash
npx pm2 status
```

Output looks like:

```
┌─────┬──────┬───────┬─────┬─────────┬────────┬──────┬────────────┬──────────┐
│ id  │ name │ mode  │ ↺   │ status  │ cpu    │ mem  │ user       │ watching │
├─────┼──────┼───────┼─────┼─────────┼────────┼──────┼────────────┼──────────┤
│ 0   │ host │ fork  │ 0   │ online  │ 0.2%   │ 45M  │ agents     │ disabled │
└─────┴──────┴───────┴─────┴─────────┴────────┴──────┴────────────┴──────────┘
```

Key columns: `status` (online/stopped/errored), `↺` (restart count — high
numbers indicate crashes), `mem` (memory usage).

## Troubleshooting

### "Port already in use" (EADDRINUSE)

Something else is bound to the port. Find and stop it:

```bash
lsof -i :8080
# or
ss -tlnp | grep 8080
```

Kill the occupant, or override with a different port:

```bash
HOST_PORT=9090 npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
```

### Server starts then immediately stops

Check the error log:

```bash
npx pm2 logs <name> --lines 30 --nostream
```

Common causes: missing build artifacts (`pnpm build` first), missing
`node_modules` (`pnpm install`), or a port conflict.

### PM2 daemon is stale

If PM2 is in a weird state (orphaned daemon, won't start processes):

```bash
npx pm2 kill          # kill the daemon and all processes
npx pm2 status        # restart fresh
```

### Logs are missing or empty

PM2 needs the daemon running. Verify with `npx pm2 status`. If the process
shows `errored` or `stopped`, restart it and check `--err` logs specifically:

```bash
npx pm2 logs <name> --err --lines 20 --nostream
```

## Ecosystem Config Location

The PM2 ecosystem config is bundled with this skill:

```
.agents/skills/server-manager/scripts/ecosystem.config.cjs
```

It defines all three servers (`host`, `dev`, `docs`) with sensible defaults.
Override ports via environment variables as documented above. The config uses
CommonJS (`*.cjs`) for PM2 compatibility.

### Adding a new server

Edit `ecosystem.config.cjs` and add a new entry to the `apps` array. Follow
the existing pattern: set `name`, `cwd`, `script`, `args`, and `env`. Then
update this SKILL.md with the new server's details.
