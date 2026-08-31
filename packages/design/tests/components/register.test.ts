import { describe, it, expect } from 'vitest';
import { register } from '../../src/components/index.js';
import { REGISTRY } from '../../src/components/registry.js';

/**
 * Tests for the `register()` contract (spec 014, FR-003 / FR-004 / FR-005).
 *
 * The barrel (`src/components/index.js`) re-exports `register` and every
 * component class, and `REGISTRY` (imported directly from `registry.js`)
 * references those same classes. Because the component class files are
 * created in Waves 1/2, this module graph does not resolve until they exist —
 * the test gate runs at the end of Wave 1/2, which is the expected state.
 *
 * Covered here:
 * - Idempotency: calling `register()` twice does not throw (FR-003, SC-001).
 * - No auto-register on import: importing the module has no side effects (FR-004).
 * - Registry inventory: exactly 20 components are registered (FR-001 + FR-002).
 */
describe('register()', () => {
    it('does not auto-register any elements on import', () => {
        // FR-004: importing the module must have no side effects — no europa-*
        // element is defined until register() is called. Guard defensively:
        // happy-dom may not fully implement customElements.get, so only assert
        // when the API is present (the idempotency test below exercises the
        // real registration path, which requires it).
        if (
            typeof customElements !== 'undefined' &&
            typeof customElements.get === 'function'
        ) {
            for (const { tag } of REGISTRY) {
                expect(customElements.get(tag)).toBeUndefined();
            }
        }
    });

    it('is idempotent — calling it twice does not throw', () => {
        // FR-003 / SC-001: register() checks customElements.get(tag) before each
        // customElements.define, so duplicates are skipped, never thrown.
        expect(() => {
            register();
            register();
        }).not.toThrow();
    });

    it('registers exactly 20 components', () => {
        // FR-001 (13 generic) + FR-002 (7 game-specific) = 20.
        expect(REGISTRY.length).toBe(20);
    });
});
