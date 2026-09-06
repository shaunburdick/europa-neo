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
 *
 * Orphan prevention (verified 2026-09-06):
 *   - PM2's default kill only signals the direct pid, orphaning the
 *     vite/astro node child when the pnpm wrapper dies. `treekill: true`
 *     on every app makes PM2 kill the whole process tree.
 *   - Astro 7.x additionally auto-detects AI agent environments
 *     (am-i-vibing) and daemonizes `astro dev` into a detached background
 *     server that survives even a tree-kill. The docs app sets
 *     ASTRO_DEV_BACKGROUND (any value) to disable that auto-detection.
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
            // Kill the whole process tree (pnpm wrapper + node child), not just
            // the direct pid — PM2's default simple-kill orphans the child.
            treekill: true,
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
            treekill: true,
        },
        {
            name: "docs",
            cwd: path.join(ROOT, "docs", "manual"),
            script: "pnpm",
            // Astro ignores the PORT env var (defaults to 4321); the --port
            // CLI flag is the only reliable override.
            args: `dev --port ${process.env.DOCS_PORT || "4321"}`,
            env: {
                // Astro 7.x auto-detects AI agent environments (am-i-vibing)
                // and daemonizes `astro dev` into a detached background server
                // that survives PM2's tree-kill. Setting ASTRO_DEV_BACKGROUND
                // (any value) disables that auto-detection so the server stays
                // a foreground child of pnpm and dies with the tree.
                ASTRO_DEV_BACKGROUND: "0",
            },
            max_restarts: 3,
            restart_delay: 1500,
            autorestart: true,
            treekill: true,
        },
    ],
};
