/**
 * Serialization / Replay Conformance Witness — Issue #74 Wave 3 (T018)
 *
 * Compares the engine's local contract copies (`packages/engine/src/contracts/`)
 * against the canonical spec contracts (`specs/001-core-game-engine/contracts/`)
 * and pins the two boundaries that make serialization/replay strict:
 *
 *   1. **Contract mirror conformance** — every local `.ts` contract file has
 *      a spec twin and is semantically identical (whitespace-normalized).
 *      This is a directory-level superset of the hand-listed pairs in
 *      `contracts-drift.test.ts`: adding a local contract file without a
 *      spec mirror fails here.
 *   2. **Identity-table surface** — the `engine-types.ts` contract declares
 *      the explicit registry/ID-table surface (`PlayerRegistry`,
 *      `playerRegistry`, `PlayerId`, `playerIds`).
 *   3. **Version boundary** — the contract sources `ENGINE_API_VERSION` from
 *      `@europa/core`, the serialization/replay source contains no hardcoded
 *      semantic-version literal, and the payload `SERIALIZE_FORMAT_VERSION`
 *      is a distinct, positive layout version whose mismatch is rejected
 *      independently of the API-version header.
 *
 * If this test fires, treat the spec contract as the source of truth and
 * synchronize the local copy (or, for a genuine contract change, bump
 * `ENGINE_API_VERSION`/`SERIALIZE_FORMAT_VERSION` deliberately and update
 * both copies in the same change set).
 */

import { readdir, readFile } from 'node:fs/promises';
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

/** Collapse whitespace for a semantic (layout-insensitive) comparison. */
function normalize(source: string): string {
    return source.replace(/\s+/g, ' ').trim();
}

/**
 * Remove block and line comments so a source scan only sees executable
 * code (documentation examples of version strings must not trip the
 * literal-version guard).
 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const LOCAL_CONTRACTS_DIR = 'packages/engine/src/contracts';
const SPEC_CONTRACTS_DIR = 'specs/001-core-game-engine/contracts';

describe('serialization/replay conformance — contract mirrors', () => {
    it('every local contract .ts file has a semantically-equal spec twin', async () => {
        const entries = await readdir(repoPath(LOCAL_CONTRACTS_DIR));
        const localTs = entries.filter((name) => name.endsWith('.ts'));
        expect(localTs.length).toBeGreaterThan(0);

        for (const name of localTs) {
            const [localContent, specContent] = await Promise.all([
                readFile(repoPath(`${LOCAL_CONTRACTS_DIR}/${name}`), 'utf-8'),
                readFile(repoPath(`${SPEC_CONTRACTS_DIR}/${name}`), 'utf-8'),
            ]);
            expect(normalize(localContent), `contract mirror '${name}' drifted from the spec`).toBe(
                normalize(specContent),
            );
        }
    });

    it('the engine-types contract declares the explicit identity-table surface', async () => {
        const specTypes = await readFile(repoPath(`${SPEC_CONTRACTS_DIR}/engine-types.ts`), 'utf-8');
        for (const token of ['PlayerId', 'PlayerRegistry', 'playerRegistry', 'MatchConfig']) {
            expect(specTypes, `engine-types.ts must declare '${token}'`).toContain(token);
        }
    });

    it('the engine-types contract sources the version boundary from @europa/core', async () => {
        const specTypes = await readFile(repoPath(`${SPEC_CONTRACTS_DIR}/engine-types.ts`), 'utf-8');
        expect(specTypes).toContain("from '@europa/core'");
        expect(specTypes).toContain('ENGINE_API_VERSION');
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
