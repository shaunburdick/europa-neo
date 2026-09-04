import { useEffect, useState } from 'react';

/**
 * Tracks the current URL hash fragment, excluding the leading `#`.
 *
 * Subscribes to the browser `hashchange` event and re-renders whenever
 * the hash portion of the URL changes. Returns the empty string when
 * no hash is present (e.g. the root path).
 *
 * @returns The current hash value without the `#` prefix.
 *
 * @example
 * ```tsx
 * function Navigation() {
 *     const hash = useHashRoute();
 *     const activeSection = hash || 'home';
 *     return <Section id={activeSection} />;
 * }
 * ```
 */
export function useHashRoute(): string {
    const [hash, setHash] = useState(window.location.hash.slice(1));

    useEffect(() => {
        const handler = (): void => {
            setHash(window.location.hash.slice(1));
        };

        window.addEventListener('hashchange', handler);

        return () => {
            window.removeEventListener('hashchange', handler);
        };
    }, []);

    return hash;
}
