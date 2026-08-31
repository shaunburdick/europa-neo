import { REGISTRY } from './registry.js';

/**
 * Register every Europa Neo web component with the browser's custom
 * element registry. Idempotent: calling it multiple times, or after a
 * tag has already been registered (e.g. by a selective
 * `customElements.define`), silently no-ops on duplicates.
 *
 * Safe to call in any environment: if `customElements` is undefined
 * (SSR, Node), it no-ops.
 */
export function register(): void {
    if (typeof customElements === 'undefined') {
        return;
    }

    for (const { tag, ctor } of REGISTRY) {
        if (customElements.get(tag) === undefined) {
            customElements.define(tag, ctor);
        }
    }
}
