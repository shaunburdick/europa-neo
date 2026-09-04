import { useCallback, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'europa-dev-theme';

/**
 * React hook for dark/light theme toggle with localStorage persistence.
 *
 * Reads initial theme from `localStorage` (falling back to `'dark'`),
 * syncs the chosen theme to `document.documentElement.dataset.theme`,
 * and persists every change back to `localStorage`.
 *
 * @returns A `[theme, toggleTheme]` tuple where `theme` is the current
 *          value (`'dark'` | `'light'`) and `toggleTheme` flips between
 *          the two options.
 */
export function useTheme(): [Theme, () => void] {
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'dark' || saved === 'light') return saved;
        } catch {
            // localStorage unavailable (private browsing, quota exceeded)
        }
        return 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // localStorage unavailable — session-only
        }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    return [theme, toggleTheme];
}
