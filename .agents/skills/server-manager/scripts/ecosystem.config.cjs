/**
 * PM2 Ecosystem Config — Europa Neo server lifecycle management.
 *
 * Defines the three managed servers as named PM2 processes with sensible
 * defaults for local development and agent-driven testing.
 *
 * Usage:
 *   npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs
 *   npx pm2 start .agents/skills/server-manager/scripts/ecosystem.config.cjs --only host
 *   npx pm2 stop all
 *   npx pm2 delete all
 *
 * Environment variables:
 *   HOST_PORT        — port for the host server (default: 8080)
 *   VITE_PORT        — port for the Vite dev server (default: 5173)
 *   DOCS_PORT        — port for the Astro docs server (default: 4321)
 *   PM2_HOME         — override PM2 daemon home (default: ~/.pm2)
 *
 * Port isolation notes (verified 2026-09-06):
 *   - The host server reads HOST_PORT from its environment (custom code).
 *   - Vite and Astro IGNORE the PORT env var — vite.config.ts hardcodes
 *     `server.port: 5173` and Astro defaults to 4321. The only reliable
 *     override is the `--port` CLI flag, which is why the dev/docs apps
 *     pass it through their `args` below (pnpm forwards extra args to the
 *     underlying script). Set VITE_PORT / DOCS_PORT in the shell before
 *     `pm2 start` to pick a unique port per session.
 */

const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");

module.exports = {
    apps: [
        {
            name: "host",
            cwd: ROOT,
            script: "pnpm",
            args: "host",
            env: {
                HOST_PORT: process.env.HOST_PORT || "8080",
            },
            // Single restart — host crashes are usually config errors
            max_restarts: 2,
            restart_delay: 1000,
            // Host writes to stdout/stderr directly (no PM2 log formatting needed)
            autorestart: true,
        },
        {
            name: "dev",
            cwd: path.join(ROOT, "packages", "console"),
            script: "pnpm",
            // Vite ignores the PORT env var (vite.config.ts hardcodes 5173);
            // the --port CLI flag is the only reliable override.
            args: `dev --host 127.0.0.1 --port ${process.env.VITE_PORT || "5173"}`,
            max_restarts: 3,
            restart_delay: 1500,
            autorestart: true,
        },
        {
            name: "docs",
            cwd: path.join(ROOT, "docs", "manual"),
            script: "pnpm",
            // Astro ignores the PORT env var (defaults to 4321); the --port
            // CLI flag is the only reliable override.
            args: `dev --port ${process.env.DOCS_PORT || "4321"}`,
            max_restarts: 3,
            restart_delay: 1500,
            autorestart: true,
        },
    ],
};
