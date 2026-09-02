import { existsSync } from 'node:fs';
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import { BRAND_MANIFEST } from '@europa/design/brand';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic } from '../../scripts/host';

/** HTTP client address for the temporary static-host test server. */
let baseUrl = '';
let server: Server;

interface StaticResponse {
    readonly status: number;
    readonly headers: IncomingHttpHeaders;
    readonly body: Buffer;
}

beforeAll(async () => {
    server = createServer((request, response) => {
        void serveStatic(request, response);
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('Static-host test server did not expose a TCP address');
    }
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
});

/** Return the expected wire content type for one manifest format. */
function contentTypeFor(format: (typeof BRAND_MANIFEST.assets)[number]['format']): string {
    switch (format) {
        case 'svg':
            return 'image/svg+xml';
        case 'png':
            return 'image/png';
        case 'ico':
            return 'image/x-icon';
        case 'webmanifest':
            return 'application/manifest+json';
    }
}

/** Request the test server without happy-dom's cross-origin fetch policy. */
function requestStatic(path: string): Promise<StaticResponse> {
    return new Promise((resolve, reject) => {
        const request = httpRequest(`${baseUrl}${path}`, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
            response.on('end', () => {
                resolve({
                    status: response.statusCode ?? 0,
                    headers: response.headers,
                    body: Buffer.concat(chunks),
                });
            });
        });
        request.on('error', reject);
        request.end();
    });
}

describe('single-port static host brand surface (T-026)', () => {
    it('serves every staged manifest asset with its declared content type', async () => {
        for (const asset of BRAND_MANIFEST.assets) {
            const response = await requestStatic(`/assets/${asset.path}`);
            expect(response.status, asset.path).toBe(200);
            const expectedType = contentTypeFor(asset.format);
            expect(response.headers['content-type']?.[0], asset.path).toBe(
                expectedType === 'application/manifest+json' ? `${expectedType}; charset=utf-8` : expectedType,
            );
            expect(response.body.byteLength, asset.path).toBeGreaterThan(0);
        }
    });

    it('returns a genuine 404 for missing assets instead of SPA HTML fallback', async () => {
        const response = await requestStatic('/assets/brand/not-generated.svg');
        expect(response.status).toBe(404);
        expect(response.headers['content-type']).toBeUndefined();
        expect(response.body.toString()).not.toContain('<!doctype html>');
    });

    it('rejects traversal attempts outside the distribution root', async () => {
        const encodedResponse = await requestStatic('/..%2f..%2f..%2f..%2fetc/passwd');
        expect(encodedResponse.status).toBe(403);
    });

    it('does not require or redirect to an external asset fallback', async () => {
        const response = await requestStatic('/assets/brand/not-generated.png');
        expect(response.status).toBe(404);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});

describe('static-host test precondition', () => {
    it('expects the console build to stage the design-owned brand directory', () => {
        expect(existsSync(new URL('../../dist/assets/brand/', import.meta.url))).toBe(true);
    });
});
