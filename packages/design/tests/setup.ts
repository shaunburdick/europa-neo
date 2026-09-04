/**
 * Shared Vitest setup for the design package's React component tests.
 *
 * Imports `@testing-library/jest-dom`'s Vitest matchers so component
 * tests can use DOM assertions like `toBeInTheDocument()`,
 * `toHaveClass()`, and `toHaveAttribute()` directly on rendered
 * elements (FR-027 / FR-029).
 *
 * The former `setup-element-internals.ts` (happy-dom `attachInternals`
 * polyfill) is removed — no web components remain after the React
 * conversion (spec 014 Clarifications v1.2, SC-008).
 */
import '@testing-library/jest-dom/vitest';
