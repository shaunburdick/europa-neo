/**
 * ThemeToggle — dark/light theme switcher for the dev page sidebar.
 *
 * Renders a single button that flips between dark and light themes via the
 * {@link useTheme} hook. All styling is inherited from shell.css and uses
 * `var(--europa-*)` tokens exclusively — no hardcoded colors.
 *
 * @see dev/hooks/useTheme.ts — persistence + DOM attribute sync
 * @see dev/styles/shell.css — `.dev-theme-toggle` rules
 */

import type React from 'react';
import { useTheme } from '../hooks/useTheme';

export function ThemeToggle(): React.ReactElement {
    const [theme, toggleTheme] = useTheme();

    return (
        <button
            className="dev-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            type="button"
        >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
    );
}
