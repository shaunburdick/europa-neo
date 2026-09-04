/**
 * T-045 — Responsive layout test for shell.css.
 *
 * Verifies that the dev page shell provides mobile-responsive behavior:
 * sidebar collapse, grid reflow, and hamburger toggle at 768px breakpoint.
 * Runs in Vitest node-mode (happy-dom).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname ?? __dirname, '../dev/styles/shell.css'), 'utf-8');

describe('responsive layout in shell.css', () => {
    it('has a mobile media query at 768px', () => {
        expect(css).toContain('@media (max-width: 768px)');
    });

    it('collapses sidebar grid to single column on mobile', () => {
        const mobileStart = css.indexOf('@media (max-width: 768px)');
        expect(mobileStart).toBeGreaterThan(0);
        const mobileCss = css.slice(mobileStart);
        expect(mobileCss).toContain('grid-template-columns: 1fr');
    });

    it('has hamburger button styles', () => {
        const mobileStart = css.indexOf('@media (max-width: 768px)');
        const mobileCss = css.slice(mobileStart);
        expect(mobileCss).toContain('.dev-hamburger');
    });

    it('positions sidebar off-screen by default on mobile', () => {
        const mobileStart = css.indexOf('@media (max-width: 768px)');
        const mobileCss = css.slice(mobileStart);
        expect(mobileCss).toContain('translateX(-100%)');
    });

    it('provides sidebar-open class to slide sidebar in', () => {
        const mobileStart = css.indexOf('@media (max-width: 768px)');
        const mobileCss = css.slice(mobileStart);
        expect(mobileCss).toContain('.dev-sidebar--open');
        expect(mobileCss).toContain('translateX(0)');
    });

    it('has overlay backdrop for mobile sidebar', () => {
        const mobileStart = css.indexOf('@media (max-width: 768px)');
        const mobileCss = css.slice(mobileStart);
        expect(mobileCss).toContain('.dev-sidebar-overlay');
        expect(mobileCss).toContain('rgba(0, 0, 0, 0.5)');
    });

    it('hamburger button is hidden on desktop (display: none)', () => {
        // The hamburger rule outside the media query should hide it
        const hamburgerRule = css.match(/\.dev-hamburger\s*\{[^}]*display:\s*none[^}]*\}/);
        expect(hamburgerRule).not.toBeNull();
    });

    it('reduces content padding on mobile', () => {
        const mobileStart = css.indexOf('@media (max-width: 768px)');
        const mobileCss = css.slice(mobileStart);
        expect(mobileCss).toContain('.dev-content');
    });

    it('respects prefers-reduced-motion for sidebar transitions', () => {
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
        const reducedCss = css.slice(reducedMotionStart);
        expect(reducedCss).toContain('transition: none');
    });
});
