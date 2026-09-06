import { describe, expect, it } from 'vitest';
import { sanitizeLogText } from '../src/sanitize';

describe('sanitizeLogText', () => {
    it('replaces control characters with spaces', () => {
        // \r\n = two control chars → two spaces; trim collapses nothing
        expect(sanitizeLogText('user\r\ninjected\nhandle')).toBe('user  injected handle');
    });

    it('trims leading and trailing whitespace', () => {
        expect(sanitizeLogText('  hello  ')).toBe('hello');
    });

    it('truncates to default maxLength (200) with ellipsis', () => {
        const long = 'a'.repeat(300);
        const result = sanitizeLogText(long);
        expect(result.length).toBeLessThanOrEqual(200);
        expect(result.endsWith('…')).toBe(true);
    });

    it('respects custom maxLength', () => {
        // maxLength 5 → slice(0, 4) = "hell" + "…" = "hell…"
        const result = sanitizeLogText('hello world', 5);
        expect(result).toBe('hell…');
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeLogText('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
        expect(sanitizeLogText('   ')).toBe('');
    });

    it('passes through non-control text unchanged', () => {
        expect(sanitizeLogText('normal text 123')).toBe('normal text 123');
    });

    it('does not truncate text shorter than maxLength', () => {
        const short = 'a'.repeat(100);
        expect(sanitizeLogText(short)).toBe(short);
    });

    it('handles text exactly at maxLength', () => {
        const exact = 'a'.repeat(200);
        expect(sanitizeLogText(exact)).toBe(exact);
    });

    it('replaces tab characters', () => {
        expect(sanitizeLogText('a\tb')).toBe('a b');
    });

    it('handles null bytes', () => {
        expect(sanitizeLogText('a\x00b')).toBe('a b');
    });

    it('truncates text one char over maxLength correctly', () => {
        // 201 chars → slice(0, 199) = 199 'a's + "…" = 200 chars
        const over = 'a'.repeat(201);
        const result = sanitizeLogText(over);
        expect(result.length).toBe(200);
        expect(result.endsWith('…')).toBe(true);
    });
});
