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
            args: "dev --host 127.0.0.1",
            env: {
                PORT: process.env.VITE_PORT || "5173",
            },
            max_restarts: 3,
            restart_delay: 1500,
            autorestart: true,
        },
        {
            name: "docs",
            cwd: path.join(ROOT, "docs", "manual"),
            script: "pnpm",
            args: "dev",
            env: {
                PORT: process.env.DOCS_PORT || "4321",
            },
            max_restarts: 3,
            restart_delay: 1500,
            autorestart: true,
        },
    ],
};
