#!/usr/bin/env node

/**
 * Documentation acceptance check for feature 010.
 *
 * This deliberately scans an explicit, reviewable file list rather than the
 * checker itself. Feature specifications and operator documentation must be
 * able to name the server-side concept; player-facing documentation must not
 * teach readers an opaque identifier or a credential-bearing URL.
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
    ['specs/010-public-lobby-match-browser/spec.md', /directed.*identity|identity.*directed/i, 'directed identity delivery'],
    ['packages/console/README.md', /same-host|cross-host/i, 'WebSocket host boundary'],
    ['packages/console/README.md', /--create/i, 'explicit create mode'],
    ['packages/matchmaking/README.md', /in-memory/i, 'in-memory lifecycle'],
];

// These are forbidden only on player-facing surfaces. The implementation and
// spec surfaces may name the fields to define and validate the privacy boundary.
const forbiddenPlayerPatterns = [
    [/guestPlayerId|GuestPlayerId/i, 'opaque guest ID field name'],
    [/opaque\s+(?:guest\s+)?(?:player\s+)?id(?:entifier)?s?/i, 'opaque identity term'],
    [/sessionToken|reconnectToken/i, 'credential field name'],
    [/(?:session|reconnect)\s+token/i, 'credential term'],
    [/[?&](?:token|sessionToken|reconnectToken)=[^\s)\]}>]+/i, 'credential-bearing URL parameter'],
    [/(?:https?|wss?):\/\/[^\s)\]}>]*(?:token|credential|secret)=[^\s)\]}>]*/i, 'credential-bearing URL'],
    [/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, 'UUID-like opaque value'],
];
const forbiddenExamplePatterns = [
    [/(?:sessionToken|reconnectToken|guestPlayerId)\s*[:=]\s*["'`]\S+/i, 'credential/opaque ID example value'],
    [/[?&](?:token|sessionToken|reconnectToken)=[A-Za-z0-9._~-]{4,}/i, 'credential-bearing example URL'],
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
    if (!text) continue;
    for (const [pattern, description] of forbiddenPlayerPatterns) {
        const match = text.match(pattern);
        if (match) failures.push(`${relativePath}: forbidden ${description} (${match[0]})`);
    }
}
for (const relativePath of implementationSurfaces) {
    const text = contents.get(relativePath);
    if (!text) continue;
    for (const [pattern, description] of forbiddenExamplePatterns) {
        const match = text.match(pattern);
        if (match) failures.push(`${relativePath}: forbidden ${description} (${match[0]})`);
    }
}

if (failures.length > 0) {
    process.stderr.write(`Feature 010 documentation/privacy check failed (${failures.length} issue(s)):\n`);
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Feature 010 documentation/privacy check passed: ${playerSurfaces.length} player-facing and ${implementationSurfaces.length} implementation/spec surfaces checked.\n`,
    );
}
