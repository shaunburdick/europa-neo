/**
 * T-044 — useTheme hook tests.
 *
 * Validates dark/light theme toggle behavior: default state,
 * localStorage persistence, data-theme attribute sync, and toggling.
 * Runs in Vitest node-mode (happy-dom).
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTheme } from '../dev/hooks/useTheme';

const STORAGE_KEY = 'europa-dev-theme';

describe('useTheme hook', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
    });

    it('defaults to dark theme', () => {
        const { result } = renderHook(() => useTheme());
        expect(result.current[0]).toBe('dark');
    });

    it('reads saved theme from localStorage', () => {
        localStorage.setItem(STORAGE_KEY, 'light');
        const { result } = renderHook(() => useTheme());
        expect(result.current[0]).toBe('light');
    });

    it('persists toggle to localStorage', () => {
        const { result } = renderHook(() => useTheme());
        act(() => {
            result.current[1]();
        });
        expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('sets data-theme on documentElement', () => {
        const { result } = renderHook(() => useTheme());
        act(() => {
            result.current[1]();
        });
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('toggles between dark and light', () => {
        const { result } = renderHook(() => useTheme());
        expect(result.current[0]).toBe('dark');

        act(() => {
            result.current[1]();
        });
        expect(result.current[0]).toBe('light');

        act(() => {
            result.current[1]();
        });
        expect(result.current[0]).toBe('dark');
    });

    it('ignores invalid localStorage values and defaults to dark', () => {
        localStorage.setItem(STORAGE_KEY, 'invalid');
        const { result } = renderHook(() => useTheme());
        expect(result.current[0]).toBe('dark');
    });

    it('sets dark data-theme on initial render', () => {
        renderHook(() => useTheme());
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
});
