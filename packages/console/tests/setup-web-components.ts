/**
 * Browser-only setup file — registers all @europa/design web components
 * before component tests render any <europa-*> custom elements, and
 * loads the design-system stylesheet so CSS custom properties
 * (--europa-*) are available to component styles.
 *
 * Split from tests/setup.ts because that file imports @axe-core/playwright
 * and axe-core (Node-only packages) that may not resolve in the browser
 * bundle, causing the entire setup to fail silently. This file imports
 * ONLY browser-safe @europa/design modules.
 *
 * This is the sole setupFiles entry for vitest.config.browser.ts and
 * the browser project in vitest.config.coverage.ts.
 */

import '@europa/design/dist/design.css';
import { register } from '@europa/design/components';
import { beforeEach } from 'vitest';

beforeEach(() => {
    register();
});
