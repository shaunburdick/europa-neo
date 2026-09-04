/**
 * Sidebar — sticky navigation for the Unified Design System Dev Page.
 *
 * Renders three category groups (Foundations, Generic Components, Game Primitives)
 * with section links that deep-link via hash routes. Active section is highlighted
 * via `aria-current="true"` (styled by shell.css attribute selectors).
 *
 * On mobile (≤768px), a hamburger button toggles a slide-in drawer with an
 * overlay backdrop. Clicking any link or the overlay closes the drawer.
 *
 * All styling is inherited from shell.css using `var(--europa-*)` tokens —
 * zero hardcoded hex/rgb literals.
 *
 * @see dev/lib/sections.ts — section registry
 * @see dev/hooks/useHashRoute.ts — hash fragment tracking
 * @see dev/components/ThemeToggle.tsx — dark/light toggle in footer
 * @see dev/styles/shell.css — `.dev-sidebar`, `.dev-hamburger`, `.dev-sidebar-overlay`
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { useHashRoute } from '../hooks/useHashRoute';
import { CATEGORIES, SECTIONS } from '../lib/sections';
import { ThemeToggle } from './ThemeToggle';

/**
 * Sidebar navigation component.
 *
 * Displays categorized section links with hash-based active highlighting.
 * Includes a mobile hamburger toggle and a theme toggle in the footer.
 *
 * @returns The sidebar navigation element (fragment — hamburger + overlay + nav).
 */
export function Sidebar(): React.ReactElement {
    const activeHash = useHashRoute();
    const [mobileOpen, setMobileOpen] = useState(false);

    /** Close the mobile drawer when a nav link is clicked. */
    const handleNavClick = useCallback(() => {
        setMobileOpen(false);
    }, []);

    return (
        <>
            {/* Hamburger — visible only on mobile via CSS media query */}
            <button
                className="dev-hamburger"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-label="Toggle navigation"
                type="button"
            >
                ☰
            </button>

            {/* Overlay — closes drawer on click, visible only on mobile */}
            {mobileOpen && (
                <button
                    className="dev-sidebar-overlay"
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar nav — slides in on mobile via .dev-sidebar--open */}
            <nav className={`dev-sidebar${mobileOpen ? ' dev-sidebar--open' : ''}`}>
                <div className="dev-sidebar__header">
                    <strong>Europa Design System</strong>
                </div>

                <div className="dev-sidebar__nav">
                    {CATEGORIES.map((cat) => (
                        <div key={cat.key} className="dev-sidebar__category">
                            <h3 className="dev-sidebar__category-heading">{cat.label}</h3>
                            <ul className="dev-sidebar__list">
                                {SECTIONS.filter((s) => s.category === cat.key).map((section) => (
                                    <li key={section.id}>
                                        <a
                                            href={`#${section.id}`}
                                            className="dev-sidebar__link"
                                            aria-current={activeHash === section.id ? 'true' : undefined}
                                            onClick={handleNavClick}
                                        >
                                            {section.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="dev-sidebar__footer">
                    <ThemeToggle />
                </div>
            </nav>
        </>
    );
}
