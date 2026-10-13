import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function consoleSrcRoot(): string {
    const candidates = [resolve(process.cwd(), 'src'), resolve(process.cwd(), 'packages/console/src')];
    for (const candidate of candidates) {
        if (existsSync(candidate) && readdirSync(candidate).includes('render')) {
            return candidate;
        }
    }
    throw new Error('console source root not found');
}

function sourceFiles(dir: string): readonly string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...sourceFiles(full));
        } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
            found.push(full);
        }
    }
    return found;
}

function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('console sources carry no raw <button> elements (FR-043)', () => {
    it('finds zero <button open tags after comment stripping', () => {
        const files = sourceFiles(consoleSrcRoot());
        expect(files.length).toBeGreaterThan(50);

        const offenders = files
            .map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))
            .filter(({ code }) => /<button(?=[\s/>])/.test(code))
            .map(({ file }) => file);

        expect(offenders).toEqual([]);
    });
});
