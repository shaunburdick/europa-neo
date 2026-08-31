/** Guard production surfaces against retired query links and credential leaks. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const productionRoots = [
    'README.md',
    'Dockerfile',
    'docker-compose.yml',
    'packages/console/src',
    'packages/console/scripts',
    'packages/console/tests/fixtures',
    'packages/console/README.md',
    'docs/manual',
] as const;

const textExtensions = new Set(['.css', '.html', '.json', '.md', '.sh', '.ts', '.tsx', '.yml', '.yaml']);
const retiredQueryPattern = /(?:^|[?&])(?:live(?:[=&]|$)|ws=|match=|name=|token=)/i;
const credentialQueryPattern = /(?:^|[?&])(?:guest(?:Id)?|handle|reconnect(?:Token)?|token|name|ws)=/i;

type FindingKind = 'retired-query' | 'credential-query';

interface Finding {
    readonly file: string;
    readonly line: number;
    readonly kinds: readonly FindingKind[];
    readonly text: string;
}

function trackedProductionFiles(): readonly string[] {
    const output = execFileSync('git', ['ls-files', '-z', '--', ...productionRoots], {
        cwd: repositoryRoot,
        encoding: 'utf8',
    });

    return output.split('\0').filter((file) => {
        if (file.length === 0 || file === 'packages/console/tests/integration/semantic-url-privacy.test.ts') {
            return false;
        }

        const extension = file.slice(file.lastIndexOf('.'));
        return file === 'Dockerfile' || textExtensions.has(extension);
    });
}

function scanTrackedProductionReferences(): readonly Finding[] {
    const findings: Finding[] = [];

    for (const file of trackedProductionFiles()) {
        const contents = readFileSync(resolve(repositoryRoot, file), 'utf8');
        contents.split('\n').forEach((text, index) => {
            if (isAllowedHistoricalNote(file, text)) {
                return;
            }

            // Remove the one permitted query marker rather than exempting its whole line. A
            // line containing both `?e2e` and a retired production query must still fail.
            const productionText = text.replace(/\?e2e\b/gi, '');
            const kinds: FindingKind[] = [];
            if (retiredQueryPattern.test(productionText)) {
                kinds.push('retired-query');
            }
            if (credentialQueryPattern.test(productionText)) {
                kinds.push('credential-query');
            }
            if (kinds.length > 0) {
                findings.push({ file, line: index + 1, kinds, text: text.trim() });
            }
        });
    }

    return findings;
}

function isAllowedHistoricalNote(file: string, text: string): boolean {
    return file.startsWith('docs/') && /^\s*(?:[-*]\s*)?(?:historical|clarification note):/i.test(text);
}

describe('semantic URL production-surface guard', () => {
    it('rejects retired query links and credential-bearing generated links', () => {
        const samples = [
            '?live&ws=wss%3A%2F%2Fexample.test&match=m-1&name=Alice&token=secret',
            'https://example.test/match/m-1?token=secret',
            'https://example.test/match/m-1?handle=guest-123',
        ];

        for (const sample of samples) {
            expect(retiredQueryPattern.test(sample) || credentialQueryPattern.test(sample)).toBe(true);
        }
    });

    it('permits the unchanged test-only e2e query', () => {
        const sample = 'http://localhost:5173/?e2e';

        const productionText = sample.replace(/\?e2e\b/gi, '');

        expect(retiredQueryPattern.test(productionText)).toBe(false);
        expect(credentialQueryPattern.test(productionText)).toBe(false);
    });

    it('does not let an e2e marker hide a retired production query on the same line', () => {
        const sample = 'http://localhost:5173/?e2e&live';
        const productionText = sample.replace(/\?e2e\b/gi, '');

        expect(retiredQueryPattern.test(productionText)).toBe(true);
    });

    it('does not treat historical clarification prose as a production surface', () => {
        const historicalNote =
            'Clarification note: the retired /?live route is intentionally documented here for migration history.';
        const historicalQueryPrefix =
            'Historical: the retired https://example.test/?live&ws=example.test route is retained for migration history.';
        const historicalPath = 'specs/013-semantic-url-routing/spec.md';

        expect(historicalPath.startsWith('specs/')).toBe(true);
        expect(retiredQueryPattern.test(historicalNote)).toBe(false);
        expect(retiredQueryPattern.test(historicalQueryPrefix)).toBe(true);
        expect(productionRoots.some((root) => historicalPath === root || historicalPath.startsWith(`${root}/`))).toBe(
            false,
        );
        expect(isAllowedHistoricalNote('docs/manual/quick-start.md', historicalNote)).toBe(true);
        expect(isAllowedHistoricalNote('docs/manual/quick-start.md', historicalQueryPrefix)).toBe(true);
        expect(isAllowedHistoricalNote('README.md', historicalNote)).toBe(false);
    });

    it('scans only tracked production surfaces', () => {
        const findings = scanTrackedProductionReferences();
        const untrackedFixture = relative(repositoryRoot, resolve(repositoryRoot, 'dist/index.html'));

        expect(trackedProductionFiles().every((file) => !file.includes(untrackedFixture))).toBe(true);
        expect(
            findings.every((finding) =>
                productionRoots.some((root) => finding.file === root || finding.file.startsWith(`${root}/`)),
            ),
        ).toBe(true);
    });

    it('has no overlapping stale and privacy findings after migration', () => {
        const finding = scanTrackedProductionReferences().find(({ kinds }) => kinds.length === 2);

        expect(finding).toBeUndefined();
    });

    it('has no stale production links or privacy violations in tracked surfaces', () => {
        expect(scanTrackedProductionReferences()).toEqual([]);
    });
});
