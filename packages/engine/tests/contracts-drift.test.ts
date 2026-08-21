/**
 * Contract Drift Test — Feature 001, Polish-phase
 *
 * The engine's `src/contracts/` directory contains LOCAL COPIES of the
 * canonical spec contracts at `.specify/features/001-core-game-engine/contracts/`.
 * The local copies exist because `tsc`'s `rootDir: ./src` rejects
 * imports from outside the package (see AGENTS.md "Local copies"
 * note + Phase 2 PM handoff). The risk: an edit to one file but
 * not the other silently desynchronizes the contract surface.
 *
 * This test fails the suite if a semantic (whitespace-normalized)
 * diff exists between any local copy and its spec counterpart.
 *
 * Per Wave 2B-2 code-quality-reviewer: "spec contracts at
 * `.specify/features/001-core-game-engine/contracts/` are the source
 * of truth; local copies at `packages/engine/src/contracts/` could
 * silently drift. This test compares the two semantically (whitespace
 * ignored) and fails on any divergence, catching drift early."
 *
 * If this test fires:
 *   1. Compare the two files with `diff` to see the divergence.
 *   2. If the SPEC is authoritative, copy the spec file into the
 *      local copy (NOT the other way around — the spec wins).
 *   3. If the LOCAL copy is correct, update the spec to match (this
 *      is a breaking change to the engine's documented contract;
 *      bump `ENGINE_API_VERSION` and document in the spec's
 *      "Revision History").
 *   4. NEVER edit only one side. The two must stay in lock-step.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Resolve a path relative to the monorepo root, not the test file. */
function repoPath(relativePath: string): string {
  // packages/engine/tests/contracts-drift.test.ts → 3 levels up = repo root
  return resolve(__dirname, '..', '..', '..', relativePath);
}

/**
 * Read a file and return its contents with all whitespace
 * normalized: collapse runs of whitespace into a single space, then
 * trim. This is a "semantic" comparison — comments and blank lines
 * don't trigger drift failures, but actual code changes do.
 *
 * Note: this is intentionally simple. We are NOT trying to be a
 * TypeScript AST-aware diff tool — the goal is to catch accidental
 * copy-paste oversights (e.g., one file updated and the other not).
 * Semantic understanding of TypeScript isn't required for that.
 */
function normalize(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

const CONTRACT_PAIRS: ReadonlyArray<{
  readonly local: string;
  readonly spec: string;
}> = [
  {
    local: 'packages/engine/src/contracts/engine-types.ts',
    spec: '.specify/features/001-core-game-engine/contracts/engine-types.ts',
  },
  {
    local: 'packages/engine/src/contracts/engine-api.ts',
    spec: '.specify/features/001-core-game-engine/contracts/engine-api.ts',
  },
];

describe('contract drift detection (src/contracts vs spec contracts)', () => {
  for (const { local, spec } of CONTRACT_PAIRS) {
    it(`local '${local}' matches spec '${spec}' semantically`, async () => {
      const [localContent, specContent] = await Promise.all([
        readFile(repoPath(local), 'utf-8'),
        readFile(repoPath(spec), 'utf-8'),
      ]);
      const localNorm = normalize(localContent);
      const specNorm = normalize(specContent);

      if (localNorm !== specNorm) {
        // Build a tiny diff preview to help debug. We don't pull in
        // a diff library — just show the first ~200 characters where
        // they diverge so a maintainer can `diff` the files manually.
        const minLen = Math.min(localNorm.length, specNorm.length);
        let firstDiff = -1;
        for (let i = 0; i < minLen; i++) {
          if (localNorm.charCodeAt(i) !== specNorm.charCodeAt(i)) {
            firstDiff = i;
            break;
          }
        }
        if (firstDiff === -1) firstDiff = minLen;

        const ctxStart = Math.max(0, firstDiff - 80);
        const ctxEnd = Math.min(localNorm.length, firstDiff + 80);
        const specCtxEnd = Math.min(specNorm.length, firstDiff + 80);

        const msg = [
          `Contract drift detected between '${local}' and '${spec}'.`,
          `First divergence at offset ${String(firstDiff)}.`,
          `Local [${String(ctxStart)}..${String(ctxEnd)}]:`,
          `  ${localNorm.slice(ctxStart, ctxEnd)}`,
          `Spec  [${String(ctxStart)}..${String(specCtxEnd)}]:`,
          `  ${specNorm.slice(ctxStart, specCtxEnd)}`,
          '',
          'To fix: copy the authoritative file to the other side.',
          'The spec contract is the source of truth — copy the spec to',
          'the local copy if the spec changed.',
        ].join('\n');
        expect.fail(msg);
      }
    });
  }
});
