/**
 * Serialization / Replay Conformance Witness — Issue #74 Wave 3 (T018)
 *
 * Pins the two boundaries that make serialization/replay strict:
 *
 *   1. **Identity-table surface** — the `engine-types.ts` contract declares
 *      the explicit registry/ID-table surface (`PlayerRegistry`,
 *      `playerRegistry`, `PlayerId`, `playerIds`).
 *   2. **Version boundary** — the contract sources `ENGINE_API_VERSION` from
 *      `@europa/core`, the serialization/replay source contains no hardcoded
 *      semantic-version literal, and the payload `SERIALIZE_FORMAT_VERSION`
 *      is a distinct, positive layout version whose mismatch is rejected
 *      independently of the API-version header.
 *
 * NOTE: Test (1) from the original suite — "every local contract .ts file
 * has a semantically-equal spec twin" — was removed because the spec-side
 * .ts files no longer exist. The package copies in
 * packages/engine/src/contracts/ are now the sole source of truth.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/create';
import {
    deserializeWorld,
    EngineFormatVersionMismatchError,
    EngineVersionMismatchError,
    SERIALIZE_FORMAT_VERSION,
    serializeWorld,
} from '../src/serialize';
import { ENGINE_API_VERSION } from '../src/types';
import { buildSmallBoard } from './fixtures/board';
import { playerIds } from './fixtures/ids';

/** Resolve a path relative to the monorepo root, not the test file. */
function repoPath(relativePath: string): string {
    // packages/engine/tests/serialization-conformance.test.ts → 3 levels up.
    return resolve(__dirname, '..', '..', '..', relativePath);
}

/**
 * Remove block and line comments so a source scan only sees executable
 * code (documentation examples of version strings must not trip the
 * literal-version guard).
 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('serialization/replay conformance — contract surface', () => {
    it('the engine-types contract declares the explicit identity-table surface', async () => {
        const localTypes = await readFile(repoPath('packages/engine/src/contracts/engine-types.ts'), 'utf-8');
        for (const token of ['PlayerId', 'PlayerRegistry', 'playerRegistry', 'MatchConfig']) {
            expect(localTypes, `engine-types.ts must declare '${token}'`).toContain(token);
        }
    });

    it('the engine-types contract sources the version boundary from @europa/core', async () => {
        const localTypes = await readFile(repoPath('packages/engine/src/contracts/engine-types.ts'), 'utf-8');
        expect(localTypes).toContain("from '@europa/core'");
        expect(localTypes).toContain('ENGINE_API_VERSION');
    });

    it('serialization and replay sources contain no hardcoded semantic-version literal', async () => {
        const sources = [
            'packages/engine/src/serialize.ts',
            'packages/engine/src/replay/replay.ts',
            'packages/engine/src/replay/validate.ts',
        ];
        const semverLiteral = /['"]\d+\.\d+\.\d+['"]/;
        for (const source of sources) {
            const content = await readFile(repoPath(source), 'utf-8');
            const code = stripComments(content);
            expect(semverLiteral.test(code), `${source} must use ENGINE_API_VERSION, not a literal`).toBe(false);
        }
    });
});

describe('serialization/replay conformance — version boundary behavior', () => {
    const board = buildSmallBoard(8, [
        [1, 1, 1],
        [6, 6, 2],
    ]);
    const world = createWorld(
        {
            boardSize: 8,
            playerIds: playerIds(2),
            tickIntervalMs: 250,
            seed: 7,
            visibilityRadius: 4,
        },
        board,
    );

    it('exposes a positive integer payload format version distinct from the API version', () => {
        expect(Number.isInteger(SERIALIZE_FORMAT_VERSION)).toBe(true);
        expect(SERIALIZE_FORMAT_VERSION).toBeGreaterThan(0);
    });

    it('rejects an unknown payload format version even when the API version matches', () => {
        const bytes = serializeWorld(world);
        const formatOffset = 3 + ENGINE_API_VERSION.length;
        bytes[formatOffset] = SERIALIZE_FORMAT_VERSION + 1;
        expect(() => deserializeWorld(bytes)).toThrow(EngineFormatVersionMismatchError);
    });

    it('rejects a wrong API version even when the payload layout is current', () => {
        const valid = serializeWorld(world);
        const payload = valid.subarray(3 + ENGINE_API_VERSION.length);
        const badVersion = new TextEncoder().encode('9.9.9');
        const bad = new Uint8Array(3 + badVersion.length + payload.length);
        bad[0] = 0x00;
        bad[1] = 0x00;
        bad[2] = badVersion.length;
        bad.set(badVersion, 3);
        bad.set(payload, 3 + badVersion.length);
        expect(() => deserializeWorld(bad)).toThrow(EngineVersionMismatchError);
    });

    it('round-trips the canonical identity table and placement-slot order', () => {
        const restored = deserializeWorld(serializeWorld(world));
        const restoredIds = [...restored.playerRegistry.ids];
        expect(restoredIds).toEqual([...world.playerRegistry.ids]);
        // Canonical order is strict ascending UTF-16 (all ids are 12 chars).
        expect(restoredIds).toEqual([...restoredIds].sort());
        expect(restored.config.playerIds).toEqual(world.config.playerIds);
    });
});
