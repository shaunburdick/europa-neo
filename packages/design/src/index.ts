/**
 * Public surface of the `@europa/design` package.
 *
 * Single entry for both import spellings:
 *   import { TOKENS } from '@europa/design'
 *   import { TOKENS } from '@europa/design/tokens'
 * Both resolve to the same module via `package.json#exports`.
 */

export type { TokenGroup, Tokens } from './tokens.js';
export { TOKENS } from './tokens.js';
