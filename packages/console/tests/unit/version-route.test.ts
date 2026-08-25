import { NETWORK_API_VERSION } from '@europa/networking';
import { APP_VERSION } from '@europa/version';
import { describe, expect, it } from 'vitest';
import { STATIC_SECURITY_HEADERS } from '../../scripts/host-config';
import { handleVersionRoute } from '../../scripts/version-route';

/**
 * Minimal stand-in for `IncomingMessage`: {@link handleVersionRoute}'s
 * contract reads ONLY `method` (the path arrives as the separate
 * `urlPath` argument). The single assertion keeps the production
 * signature honest while the stub stays two fields wide; this file is
 * excluded from every tsconfig by design (repo-wide convention), so
 * the cast is documentation, not a hole.
 *
 * @param method HTTP verb exactly as received (`undefined` possible on
 *               malformed requests — treated as non-GET).
 * @param url    Request URL (unused by the route; kept for realism).
 * @returns A request stub usable as `IncomingMessage`.
 */
function stubRequest(method: string | undefined, url: string): IncomingMessage {
    return { method, url } as IncomingMessage;
}

/** What a test wants to know about the response the route wrote. */
interface RecordedResponse {
    /** Status passed to `writeHead` (0 = never written). */
    readonly status: number;
    /** Header map merged across `writeHead` calls ({} = never written). */
    readonly headers: Record<string, string>;
    /** Body passed to `end` (`undefined` = empty body or never ended). */
    readonly body: string | undefined;
}

/**
 * A response stub carrying just the two methods the route drives —
 * `writeHead(status, headers)` chained into `end(body?)` — plus the
 * captured values above. One assertion adapts the literal to the
 * production parameter type; nothing else fakes the node:http surface.
 *
 * @returns The stub (also doubles as the recorder via field reads).
 */
function stubResponse(): ServerResponse & RecordedResponse {
    const stub = {
        status: 0,
        headers: {} as Record<string, string>,
        body: undefined as string | undefined,
        writeHead(status: number, headers: Record<string, string>): ServerResponse & RecordedResponse {
            stub.status = status;
            Object.assign(stub.headers, headers);
            return stub;
        },
        end(body?: string): ServerResponse & RecordedResponse {
            stub.body = body;
            return stub;
        },
    } as ServerResponse & RecordedResponse;
    return stub;
}

/** Run the route and return what it did to the response pair. */
function serve(method: string | undefined, urlPath: string): { handled: boolean; recorded: RecordedResponse } {
    const res = stubResponse();
    const handled = handleVersionRoute(stubRequest(method, urlPath), res, urlPath);
    return { handled, recorded: res };
}

describe('GET /version on the host static surface (feature 009 FR-006)', () => {
    it('answers 200 JSON with the exact release-identity body and no credentials (SC-002)', () => {
        const { handled, recorded } = serve('GET', '/version');
        expect(handled).toBe(true);
        expect(recorded.status).toBe(200);
        // Exact bytes: key order is part of the FR-006 contract shape.
        expect(recorded.body).toBe(JSON.stringify({ appVersion: APP_VERSION, protocolVersion: NETWORK_API_VERSION }));
        // …and semantically parseable as exactly the two string fields.
        expect(JSON.parse(recorded.body ?? '')).toEqual({
            appVersion: APP_VERSION,
            protocolVersion: NETWORK_API_VERSION,
        });
        expect(recorded.headers['content-type']).toBe('application/json; charset=utf-8');
        // SC-002's "no credentials supplied": the request carries nothing
        // but a method + path, proving no auth gate exists.
    });

    it('is query-string tolerant', () => {
        for (const urlPath of ['/version?ci=1', '/version?']) {
            const { handled, recorded } = serve('GET', urlPath);
            expect(handled).toBe(true);
            expect(recorded.status).toBe(200);
            expect(recorded.body).toBe(
                JSON.stringify({ appVersion: APP_VERSION, protocolVersion: NETWORK_API_VERSION }),
            );
        }
    });

    it('sends the shared static security headers alongside the version payload', () => {
        const { recorded } = serve('GET', '/version');
        for (const [header, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
            expect(recorded.headers[header]).toBe(value);
        }
    });

    it('rejects non-GET methods with 405 + Allow: GET and writes no body', () => {
        for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'get']) {
            const { handled, recorded } = serve(method, '/version');
            expect(handled, `method ${method} should still claim the path`).toBe(true);
            expect(recorded.status, `method ${method} must be rejected`).toBe(405);
            expect(recorded.headers.Allow, `method ${method} must advertise GET`).toBe('GET');
            expect(recorded.body, `method ${method} must produce no body side effects`).toBeUndefined();
            for (const [header, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
                expect(recorded.headers[header], `method ${method} keeps security headers`).toBe(value);
            }
        }
    });

    it('leaves every other path untouched for the SPA fallback (case-sensitive, exact match)', () => {
        for (const urlPath of ['/version/extra', '/Version', '/VERSION', '/versionx', '/api/version', '/', '/v', '']) {
            const { handled, recorded } = serve('GET', urlPath);
            expect(handled, `path "${urlPath}" must not be claimed`).toBe(false);
            expect(recorded.status, `path "${urlPath}" must see zero writes`).toBe(0);
            expect(Object.keys(recorded.headers), `path "${urlPath}" must see zero headers`).toHaveLength(0);
            expect(recorded.body, `path "${urlPath}" must see no body`).toBeUndefined();
        }
    });
});
