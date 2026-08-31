#!/usr/bin/env node

/**
 * Documentation acceptance check for feature 010 — CREDENTIAL / IDENTITY PRIVACY.
 *
 * IMPORTANT: This check is about leaking *credentials and opaque player
 * identifiers* into documentation (feature 010 FR-014 / NFR-3). It is NOT about
 * public-vs-private *match visibility* (that is a separate concern handled
 * elsewhere). "Private" in the patterns below means a *credential-bearing /
 * private (token) URL*, never an invite-only match.
 *
 * What it enforces:
 *  - Required privacy-related terminology must be present in certain docs
 *    (handle guidance, spectator, lifecycle, server-authoritative, directed
 *    identity, --create, same/cross-host, in-memory).
 *  - Player-facing surfaces (docs/manual/*) must NOT teach readers bearer
 *    credential fields or credential-bearing URLs. Non-secret player/guest IDs
 *    are permitted where the approved documentation surfaces use them for
 *    correlation.
 *  - All approved surfaces may *name* player/guest ID fields and show
 *    representative non-secret ID values. No approved surface may print a
 *    bearer credential value (e.g. sessionToken: "abc") or a credential-bearing
 *    URL/log/example.
 *
 * This deliberately scans an explicit, reviewable file list (see below) rather
 * than the checker itself, so reviewers can see exactly what is covered.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const playerSurfaces = [
    'docs/manual/index.md',
    'docs/manual/quick-start.md',
    'docs/manual/reading-the-screen.md',
    'docs/manual/lobby.md',
];
const implementationSurfaces = [
    'README.md',
    'packages/console/README.md',
    'packages/matchmaking/README.md',
    'packages/networking/README.md',
    'specs/010-public-lobby-match-browser/spec.md',
    'specs/010-public-lobby-match-browser/plan.md',
    'specs/010-public-lobby-match-browser/quickstart.md',
    'specs/010-public-lobby-match-browser/data-model.md',
    'specs/010-public-lobby-match-browser/contracts/lobby-wire.md',
];

const requiredPlayerTerms = [
    ['docs/manual/index.md', /handle/i, 'manual handle guidance'],
    ['docs/manual/lobby.md', /spectat/i, 'spectator guidance'],
    ['docs/manual/lobby.md', /in-memory|restart/i, 'lifecycle boundary'],
];
const requiredImplementationTerms = [
    ['README.md', /public lobby/i, 'public lobby behavior'],
    ['README.md', /handle/i, 'handle visibility'],
    ['specs/010-public-lobby-match-browser/spec.md', /server-authoritative/i, 'authoritative association'],
    [
        'specs/010-public-lobby-match-browser/spec.md',
        /directed.*identity|identity.*directed/i,
        'directed identity delivery',
    ],
    ['packages/console/README.md', /same-host|cross-host/i, 'WebSocket host boundary'],
    ['packages/console/README.md', /--create/i, 'explicit create mode'],
    ['packages/matchmaking/README.md', /in-memory/i, 'in-memory lifecycle'],
];

// These remain forbidden only on player-facing surfaces (docs/manual/*): a
// player manual should use handles (or a generic fallback) rather than teach
// credential mechanics. Player/guest ID names and representative values are
// deliberately absent from this list: they are non-secret correlation data on
// every explicitly approved surface above.
//
// NOTE on wording: "private" in these patterns means a CREDENTIAL-BEARING /
// private (token) URL — e.g. a URL carrying ?token=… or a sessionToken. It does
// NOT mean a private (invite-only) match; match visibility is out of scope here.
const forbiddenPlayerPatterns = [
    [/sessionToken|reconnectToken/i, 'credential field name'],
    [/(?:session|reconnect)\s+token/i, 'credential term'],
    [/[?&](?:token|sessionToken|reconnectToken)=[^\s)\]}>]+/i, 'credential-bearing URL parameter'],
    [/(?:https?|wss?):\/\/[^\s)\]}>]*(?:token|credential|secret)=[^\s)\]}>]*/i, 'credential-bearing URL'],
];
const forbiddenCredentialPatterns = [
    [
        /(?:sessionToken|reconnectToken|accessToken|refreshToken|bearerToken)\s*[:=]\s*(?:["'`]\S+|(?!(?:string|undefined|null)\b)[A-Za-z0-9._~+/-]+)/i,
        'credential value',
    ],
    [
        /(?:[?&](?:token|sessionToken|reconnectToken|access_token|accessToken|credential|secret|bearer)=[^\s)\]}>]+|(?:https?|wss?):\/\/[^\s)\]}>]*(?:token|credential|secret|bearer)=[^\s)\]}>]*)/i,
        'credential-bearing URL',
    ],
    [/\bAuthorization\s*:\s*Bearer\s+\S+/i, 'bearer Authorization value'],
];

const failures = [];
const contents = new Map();
for (const relativePath of [...playerSurfaces, ...implementationSurfaces]) {
    try {
        contents.set(relativePath, await readFile(path.join(root, relativePath), 'utf8'));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${relativePath}: cannot read required documentation (${message})`);
    }
}

for (const [relativePath, pattern, description] of requiredPlayerTerms) {
    if (contents.has(relativePath) && !pattern.test(contents.get(relativePath))) {
        failures.push(`${relativePath}: missing ${description}`);
    }
}
for (const [relativePath, pattern, description] of requiredImplementationTerms) {
    if (contents.has(relativePath) && !pattern.test(contents.get(relativePath))) {
        failures.push(`${relativePath}: missing ${description}`);
    }
}
for (const relativePath of playerSurfaces) {
    const text = contents.get(relativePath);
    if (!text) {
        continue;
    }
    for (const [pattern, description] of forbiddenPlayerPatterns) {
        const match = text.match(pattern);
        if (match) {
            failures.push(`${relativePath}: forbidden ${description} (${match[0]})`);
        }
    }
}
for (const relativePath of [...playerSurfaces, ...implementationSurfaces]) {
    const text = contents.get(relativePath);
    if (!text) {
        continue;
    }
    for (const [pattern, description] of forbiddenCredentialPatterns) {
        const match = text.match(pattern);
        if (match) {
            failures.push(`${relativePath}: forbidden ${description} (${match[0]})`);
        }
    }
}

if (failures.length > 0) {
    process.stderr.write(`Feature 010 documentation/privacy check failed (${failures.length} issue(s)):\n`);
    for (const failure of failures) {
        process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Feature 010 documentation/privacy check passed: ${playerSurfaces.length} player-facing and ${implementationSurfaces.length} implementation/spec surfaces checked.\n`,
    );
}
