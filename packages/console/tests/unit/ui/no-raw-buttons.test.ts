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
    let out = '';
    let index = 0;
    let quote: string | null = null;
    let prev = '';
    while (index < source.length) {
        const char = source[index] ?? '';
        const next = source[index + 1] ?? '';
        if (quote !== null) {
            out += char;
            if (char === '\\' && index + 1 < source.length) {
                out += next;
                index += 2;
                continue;
            }
            if (char === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }
        if ((char === "'" || char === '"') && !/[\w$]/.test(prev)) {
            quote = char;
            out += char;
            index += 1;
            prev = char;
            continue;
        }
        if (char === '`') {
            quote = char;
            out += char;
            index += 1;
            prev = char;
            continue;
        }
        if (char === '/' && next === '/') {
            while (index < source.length && source[index] !== '\n') {
                index += 1;
            }
            continue;
        }
        if (char === '/' && next === '*') {
            index += 2;
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
                index += 1;
            }
            index += 2;
            continue;
        }
        out += char;
        if (!/\s/.test(char)) {
            prev = char;
        }
        index += 1;
    }
    return out;
}

function hasRawButtonTag(code: string): boolean {
    return /<button(?=[\s/>])/.test(code);
}

describe('console sources carry no raw <button> elements (FR-043)', () => {
    it('finds zero <button open tags after comment stripping', () => {
        const files = sourceFiles(consoleSrcRoot());
        expect(files.length).toBeGreaterThan(50);

        const offenders = files
            .map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))
            .filter(({ code }) => hasRawButtonTag(code))
            .map(({ file }) => file);

        expect(offenders).toEqual([]);
    });
});

describe('guard self-test (string-preserving comment stripping)', () => {
    it('detects a raw button after a string containing a double slash', () => {
        const source = 'const docs = "https://example.com"; const el = <button />;';
        expect(stripComments(source)).toContain('https://example.com');
        expect(hasRawButtonTag(stripComments(source))).toBe(true);
    });

    it('an apostrophe in JSX text does not swallow the code that follows', () => {
        const source = ["<p>Use this page's host for the server.</p>", 'const el = <button />;'].join('\n');
        expect(hasRawButtonTag(stripComments(source))).toBe(true);
    });
});
