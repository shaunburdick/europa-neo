/**
 * Browser-only setup file — registers all @europa/design web components
 * before component tests render any <europa-*> custom elements.
 *
 * Split from tests/setup.ts because that file imports @axe-core/playwright
 * and axe-core (Node-only packages) that may not resolve in the browser
 * bundle, causing the entire setup to fail silently. This file imports
 * ONLY @europa/design/components, which is browser-safe.
 *
 * Added to vitest.config.browser.ts + vitest.config.coverage.ts
 * setupFiles alongside the existing setup.ts.
 */

import { register } from '@europa/design/components';

register();
