/**
 * Browser-safe CSPRNG access for matchmaking id/seed generation.
 * Uses the Web Crypto API (globalThis.crypto), available in Node >=19
 * and all modern browsers. Avoids a static `node:crypto` import so the
 * package can be bundled for the browser console (012 imports
 * BOARD_SIZE_DEFAULTS from @europa/matchmaking into the lobby UI).
 * Output is identical to node:crypto's randomUUID/getRandomValues
 * (same Web Crypto CSPRNG) — no behavior change, no version bump.
 */
interface WebCryptoLike {
    randomUUID(): string;
    getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

function getCrypto(): WebCryptoLike {
    const c = (globalThis as { crypto?: WebCryptoLike }).crypto;
    if (!c) {
        throw new Error('Web Crypto API (globalThis.crypto) is unavailable in this environment');
    }
    return c;
}

export function randomUUID(): string {
    return getCrypto().randomUUID();
}

export function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    return getCrypto().getRandomValues(array);
}
