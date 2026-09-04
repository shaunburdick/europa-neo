/**
 * Browser-only setup file — loads the design-system stylesheet so CSS
 * custom properties (--europa-*) are available to component styles.
 *
 * Split from tests/setup.ts because that file imports @axe-core/playwright
 * and axe-core (Node-only packages) that may not resolve in the browser
 * bundle, causing the entire setup to fail silently. This file imports
 * ONLY browser-safe @europa/design modules.
 *
 * This is the sole setupFiles entry for vitest.config.browser.ts and
 * the browser project in vitest.config.coverage.ts.
 *
 * Note: the old web-component `register()` call was removed when
 * @europa/design converted to React function components — React
 * components render standard HTML and need no custom-element
 * registration.
 */

import '@europa/design/dist/design.css';
