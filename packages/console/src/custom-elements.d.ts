/**
 * JSX intrinsic element declarations for @europa/design web components
 * used by the console package's React components.
 *
 * These declarations let TypeScript accept custom element tags in JSX
 * without per-file `declare module` augmentations. The components are
 * registered at runtime by `@europa/design/components`'s `register()`
 * (called once in `main.tsx` before any React render).
 */

import type { ReactNode } from 'react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'europa-page': { children?: ReactNode };
            'europa-card': { children?: ReactNode };
            'europa-stack': { children?: ReactNode };
            'europa-typography': {
                variant?: string;
                children?: ReactNode;
            };
        }
    }
}
