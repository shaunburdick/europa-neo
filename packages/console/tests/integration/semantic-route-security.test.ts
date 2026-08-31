/** Feature 013 T015 security checks at the native host boundary. */

import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface HttpResult {
    readonly status: number;
    readonly body: string;
}

let host: ChildProcess;
let port: number;

describe('native host route security boundary', () => {
    beforeAll(async () => {
        port = await reservePort();
        host = spawn('pnpm', ['exec', 'tsx', 'scripts/host.ts', '--port', String(port)], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        await waitForPort(collectOutput(host), port);
    }, 15_000);

    afterAll(() => {
        host.kill('SIGTERM');
    });

    it.each(['/../package.json', '/%2e%2e/package.json', '/%2e%2e%2fpackage.json', '/%zz'])(
        'rejects filesystem traversal before SPA fallback: %s',
        async (pathname) => {
            const result = await get(pathname);
            expect(result.status).toBe(pathname === '/%zz' ? 404 : 403);
            expect(result.body).not.toContain('package.json');
        },
    );

    it('does not expose match credentials through the host response or a path fallback', async () => {
        const result = await get('/match/target-match/join?name=Alice&token=secret&ws=wss%3A%2F%2Fother.test');

        expect(result.status).toBe(200);
        expect(result.body).not.toContain('secret');
        expect(result.body).not.toContain('other.test');
    });

    it.each(['/lobby', '/match/target-match', '/match/target-match/join', '/match/target-match/spectate', '/settings'])(
        'serves the SPA shell for safe application path %s',
        async (pathname) => {
            const result = await get(pathname);

            expect(result.status).toBe(200);
            expect(result.body).toContain('<!doctype html>');
        },
    );

    it('does not turn a missing asset into an HTML application response', async () => {
        const result = await get('/assets/does-not-exist.js');

        expect(result.status).toBe(404);
        expect(result.body).toBe('not found — did you run `pnpm build`?');
    });
});

function collectOutput(processHandle: ChildProcess): { readonly text: () => string } {
    let text = '';
    processHandle.stdout?.on('data', (chunk: Buffer) => {
        text += chunk.toString();
    });
    processHandle.stderr?.on('data', (chunk: Buffer) => {
        text += chunk.toString();
    });
    return { text: () => text };
}

async function waitForPort(output: { readonly text: () => string }, expectedPort: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if (output.text().includes(`Console UI   : http://localhost:${String(expectedPort)}`)) {
            return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`host did not start: ${output.text()}`);
}

async function reservePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        server.close();
        throw new Error('could not reserve an ephemeral port');
    }
    const reserved = address.port;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    return reserved;
}

function get(pathname: string): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
        const client = request({ host: '127.0.0.1', port, path: pathname, method: 'GET' }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
                body += chunk;
            });
            response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        });
        client.on('error', reject);
        client.end();
    });
}
