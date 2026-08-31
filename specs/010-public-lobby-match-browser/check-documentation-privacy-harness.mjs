#!/usr/bin/env node

/**
 * Focused executable harness for the Feature 010 documentation/privacy check.
 *
 * The harness creates short, disposable documentation trees so the checker is
 * exercised both with permitted correlation identifiers and with representative
 * credential leaks. Nothing written here is a real credential.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const checkerPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'check-documentation-privacy.mjs');
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

const allSurfaces = [...playerSurfaces, ...implementationSurfaces];
const identityFixture = 'guestPlayerId: guest-player-42; playerId: player-17; matchId: match-9';

/** Return the minimum text needed for one approved surface. */
function baselineText(relativePath) {
    if (relativePath === 'docs/manual/index.md') {
        return `# Manual\nChoose a handle. ${identityFixture}`;
    }
    if (relativePath === 'docs/manual/lobby.md') {
        return `# Lobby\nSpectator guidance and in-memory lifecycle. ${identityFixture}`;
    }
    if (relativePath === 'README.md') {
        return `# Europa Neo\nPublic lobby and handle visibility. ${identityFixture}`;
    }
    if (relativePath === 'specs/010-public-lobby-match-browser/spec.md') {
        return `# Spec\nServer-authoritative directed identity delivery. ${identityFixture}`;
    }
    if (relativePath === 'packages/console/README.md') {
        return `# Console\nSame-host and cross-host usage with --create. ${identityFixture}`;
    }
    if (relativePath === 'packages/matchmaking/README.md') {
        return `# Matchmaking\nState is in-memory. ${identityFixture}`;
    }
    return `# Documentation\n${identityFixture}`;
}

/** Write the checker’s explicitly approved surfaces beneath a temporary root. */
async function writeFixture(root, additions = new Map()) {
    await Promise.all(
        allSurfaces.map(async (relativePath) => {
            const filePath = path.join(root, relativePath);
            const directory = path.dirname(filePath);
            await mkdir(directory, { recursive: true });
            await writeFile(filePath, `${baselineText(relativePath)}\n${additions.get(relativePath) ?? ''}\n`, 'utf8');
        }),
    );
}

/** Run the real checker from a disposable fixture root. */
function runChecker(root) {
    return spawnSync(process.execPath, [checkerPath], {
        cwd: root,
        encoding: 'utf8',
    });
}

const badExamples = [
    ['sessionToken value', 'sessionToken: "fixture-session-token"', 'credential value'],
    ['reconnectToken value', 'reconnectToken: fixture-reconnect-token', 'credential value'],
    ['credential-bearing URL', 'wss://example.invalid/match?token=fixture-token', 'credential-bearing URL'],
    ['bearer Authorization value', 'Authorization: Bearer fixture-token', 'bearer Authorization value'],
];

const temporaryRoots = [];
try {
    const passingRoot = await mkdtemp(path.join(os.tmpdir(), 'europa-doc-privacy-pass-'));
    temporaryRoots.push(passingRoot);
    await writeFixture(passingRoot);
    const passingResult = runChecker(passingRoot);
    assert.equal(passingResult.status, 0, `permitted identifiers should pass:\n${passingResult.stderr}`);

    for (const [label, example, expectedDescription] of badExamples) {
        const failingRoot = await mkdtemp(path.join(os.tmpdir(), 'europa-doc-privacy-fail-'));
        temporaryRoots.push(failingRoot);
        await writeFixture(failingRoot, new Map([['README.md', example]]));
        const failingResult = runChecker(failingRoot);
        assert.notEqual(failingResult.status, 0, `${label} should fail the checker`);
        assert.match(failingResult.stderr, new RegExp(expectedDescription));
    }

    process.stdout.write(`Documentation/privacy harness passed: ${badExamples.length} forbidden examples rejected.\n`);
} finally {
    await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
}
