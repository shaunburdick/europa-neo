/**
 * Tests for the no-literals guard (spec 012, T-014 / G-04).
 *
 * Verifies shouldSkipFile() exclusions, scanContent() violation detection,
 * and the allow-list marker behaviour.
 */

import { describe, expect, it } from 'vitest';

import { HEX_LITERAL, isAllowListed, RGBA_LITERAL, scanContent, shouldSkipFile } from '../scripts/check-no-literals.js';

describe('shouldSkipFile()', () => {
    it('allows normal source files', () => {
        expect(shouldSkipFile('packages/console/src/app.tsx')).toBe(false);
        expect(shouldSkipFile('docs/manual/index.md')).toBe(true); // .md excluded
    });

    it('excludes vendored design.css under docs/manual/', () => {
        expect(shouldSkipFile('docs/manual/public/design.css')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/design.css')).toBe(true);
    });

    it('excludes Markdown documentation files', () => {
        expect(shouldSkipFile('docs/manual/pages/combat.md')).toBe(true);
        expect(shouldSkipFile('docs/manual/guide/controls.mdx')).toBe(true);
    });

    it('excludes generated brand assets under docs/manual/assets/brand/', () => {
        expect(shouldSkipFile('docs/manual/assets/brand/europa-neo-emblem.svg')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/europa-neo-lockup-dark.svg')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/favicon.svg')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/favicon.ico')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/icon-192.png')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/icon-512.png')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/icon-512-maskable.png')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/apple-touch-icon.png')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/europa-neo-social.png')).toBe(true);
        expect(shouldSkipFile('docs/manual/assets/brand/site.webmanifest')).toBe(true);
    });

    it('does NOT exclude non-brand assets under docs/manual/', () => {
        expect(shouldSkipFile('docs/manual/assets/some-file.svg')).toBe(false);
        expect(shouldSkipFile('docs/manual/images/logo.png')).toBe(false);
    });

    it('does NOT exclude files outside docs/manual/', () => {
        expect(shouldSkipFile('packages/design/src/tokens.ts')).toBe(false);
        expect(shouldSkipFile('packages/design/assets/brand/icon.svg')).toBe(false);
    });
});

describe('isAllowListed()', () => {
    it('recognises the canvas-fallback marker', () => {
        expect(isAllowListed('  // design-exception: canvas fallback')).toBe(true);
    });

    it('rejects lines without the marker', () => {
        expect(isAllowListed('color: #3b82f6;')).toBe(false);
        expect(isAllowListed('')).toBe(false);
    });
});

describe('scanContent()', () => {
    it('detects hex literals in source lines', () => {
        const violations = scanContent('const c = "#3b82f6";', 'test.ts');
        expect(violations).toHaveLength(1);
        expect(violations[0]?.line).toBe(1);
    });

    it('detects rgba literals', () => {
        const violations = scanContent('background: rgba(0,0,0,0.5);', 'test.ts');
        expect(violations).toHaveLength(1);
    });

    it('allows lines with @europa/design import', () => {
        const violations = scanContent("import { TOKENS } from '@europa/design';", 'test.ts');
        expect(violations).toHaveLength(0);
    });

    it('allows lines with the canvas-fallback marker', () => {
        const violations = scanContent('ctx.fillStyle = "#3b82f6"; // design-exception: canvas fallback', 'test.ts');
        expect(violations).toHaveLength(0);
    });

    it('allows the previous line having the marker', () => {
        const content = '// design-exception: canvas fallback\nctx.fillStyle = "#3b82f6";';
        const violations = scanContent(content, 'test.ts');
        expect(violations).toHaveLength(0);
    });

    it('skips lines with no literals', () => {
        const violations = scanContent('const x = 42;\nreturn x;', 'test.ts');
        expect(violations).toHaveLength(0);
    });
});

describe('HEX_LITERAL regex', () => {
    it('matches 3-digit hex', () => {
        expect(HEX_LITERAL.test('#abc')).toBe(true);
    });

    it('matches 6-digit hex', () => {
        expect(HEX_LITERAL.test('#3b82f6')).toBe(true);
    });

    it('matches 8-digit hex', () => {
        expect(HEX_LITERAL.test('#3b82f6ff')).toBe(true);
    });

    it('rejects too-short hex', () => {
        expect(HEX_LITERAL.test('#ab')).toBe(false);
    });
});

describe('RGBA_LITERAL regex', () => {
    it('matches rgba()', () => {
        expect(RGBA_LITERAL.test('rgba(0,0,0,0.5)')).toBe(true);
    });

    it('matches rgb()', () => {
        expect(RGBA_LITERAL.test('rgb(255,0,0)')).toBe(true);
    });

    it('rejects non-color strings', () => {
        expect(RGBA_LITERAL.test('rgba-content')).toBe(false);
    });
});
