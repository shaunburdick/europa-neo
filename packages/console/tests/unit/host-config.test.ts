import { describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../../scripts/host';
import {
    isPathInside,
    isWildcardHost,
    type NPlayerHostConfig,
    resolveConfig as resolveNPlayerConfig,
    STATIC_SECURITY_HEADERS,
    sanitizeLogText,
} from '../../scripts/host-config';

describe('host configuration security helpers', () => {
    it('does not confuse a sibling directory with a child path', () => {
        expect(isPathInside('/srv/console/dist', '/srv/console/dist-escape/index.html')).toBe(false);
        expect(isPathInside('/srv/console/dist', '/srv/console/dist/index.html')).toBe(true);
    });

    it('recognizes wildcard bind addresses', () => {
        expect(isWildcardHost('0.0.0.0')).toBe(true);
        expect(isWildcardHost('192.168.1.10')).toBe(false);
    });

    it('keeps defaults loopback-safe and requires a LAN advertisement', () => {
        expect(resolveConfig([], {})).toMatchObject({
            bindHost: '127.0.0.1',
            publicHost: 'localhost',
            port: 8080,
            wsPort: 8080,
        });
        // staticPort no longer exists — single port only
        expect((resolveConfig([], {}) as unknown as Record<string, unknown>).staticPort).toBeUndefined();
        expect(resolveConfig(['--bind-host', '0.0.0.0'], {})).toBeNull();
        expect(resolveConfig(['--bind-host', '0.0.0.0', '--public-host', '192.168.1.20'], {})).toMatchObject({
            bindHost: '0.0.0.0',
            publicHost: '192.168.1.20',
        });
    });

    it('defaults to lobby mode (no pre-created match) per FR-017', () => {
        expect(resolveConfig([], {})?.createMatch).toBe(false);
    });

    it('accepts --create as a bare flag in any position', () => {
        expect(resolveConfig(['--create'], {})?.createMatch).toBe(true);
        expect(resolveConfig(['--port', '9000', '--create'], {})).toMatchObject({
            createMatch: true,
            port: 9000,
            wsPort: 9000,
        });
        expect(resolveConfig(['--create', '--port', '6000'], {})).toMatchObject({
            createMatch: true,
            port: 6000,
            wsPort: 6000,
        });
    });

    it('rejects values glued to --create instead of treating them as truthy', () => {
        expect(resolveConfig(['--create=1'], {})).toBeNull();
        expect(resolveConfig(['--create='], {})).toBeNull();
    });

    it('defines the static server security headers', () => {
        expect(STATIC_SECURITY_HEADERS).toEqual({
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
        });
    });

    it('strips control characters so wire-derived text cannot forge log lines', () => {
        expect(sanitizeLogText('ok\nINJECTED line')).toBe('ok INJECTED line');
        expect(sanitizeLogText('\u001b[31mred\u0000')).toBe('[31mred');
        expect(sanitizeLogText('  padded\ttext  ')).toBe('padded text');
    });

    it('caps sanitized text length so one huge field cannot flood the log', () => {
        const flooded = sanitizeLogText('x'.repeat(500));
        expect(flooded.length).toBeLessThanOrEqual(200);
        expect(flooded.endsWith('…')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// N-player host config resolution (012 FR-011 / FR-012) — exhaustive matrix.
// These tests exercise the STRICT resolver exported from `host-config.ts`
// (NPlayerHostConfig), which rejects the second-port surface (HOST_STATIC_PORT
// / --static-port) per FR-012. The lenient launcher wrapper in `host.ts`
// (HostLaunchConfig, adds `createMatch`) is covered by the tests above and by
// the sibling host-collapse-tdd.test.ts.
// ---------------------------------------------------------------------------

describe('N-player host config resolution (012 FR-011/FR-012)', () => {
    /** Run the strict resolver while capturing everything written to stderr. */
    function run(
        args: readonly string[],
        env: NodeJS.ProcessEnv = {},
    ): { result: NPlayerHostConfig | null; stderr: string } {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            const result = resolveNPlayerConfig(args, env);
            return { result, stderr: errSpy.mock.calls.map((c) => String(c[0])).join('') };
        } finally {
            errSpy.mockRestore();
        }
    }

    describe('playerCount resolution (4 sources: flag / alias / env / default)', () => {
        it('defaults to 2 when no flag and no env (implied board 32)', () => {
            expect(run([]).result).toMatchObject({ playerCount: 2, boardSize: 32 });
        });

        it('--players N sets the count', () => {
            expect(run(['--players', '3']).result).toMatchObject({ playerCount: 3, boardSize: 48 });
            expect(run(['--players', '4']).result).toMatchObject({ playerCount: 4, boardSize: 48 });
            expect(run(['--players=2']).result).toMatchObject({ playerCount: 2, boardSize: 32 });
        });

        it('--player-count N alias sets the count', () => {
            expect(run(['--player-count', '3']).result).toMatchObject({ playerCount: 3, boardSize: 48 });
            expect(run(['--player-count=4']).result).toMatchObject({ playerCount: 4, boardSize: 48 });
        });

        it('HOST_PLAYER_COUNT env sets the count', () => {
            expect(run([], { HOST_PLAYER_COUNT: '3' }).result).toMatchObject({ playerCount: 3, boardSize: 48 });
            expect(run([], { HOST_PLAYER_COUNT: '4' }).result).toMatchObject({ playerCount: 4, boardSize: 48 });
        });
    });

    describe('boardSize resolution (flag > env > implied BOARD_SIZE_DEFAULTS[N])', () => {
        it('implies BOARD_SIZE_DEFAULTS[2] = 32 when only --players 2', () => {
            expect(run(['--players', '2']).result).toMatchObject({ playerCount: 2, boardSize: 32 });
        });

        it('implies BOARD_SIZE_DEFAULTS[3] = 48 when only --players 3', () => {
            expect(run(['--players', '3']).result).toMatchObject({ playerCount: 3, boardSize: 48 });
        });

        it('implies BOARD_SIZE_DEFAULTS[4] = 48 when only --players 4', () => {
            expect(run(['--players', '4']).result).toMatchObject({ playerCount: 4, boardSize: 48 });
        });

        it('--board-size S sets the size explicitly', () => {
            expect(run(['--board-size=32']).result).toMatchObject({ boardSize: 32 });
        });

        it('--boardSize S alias sets the size explicitly', () => {
            expect(run(['--boardSize', '48']).result).toMatchObject({ boardSize: 48 });
        });

        it('HOST_BOARD_SIZE env sets the size explicitly', () => {
            expect(run([], { HOST_BOARD_SIZE: '32' }).result).toMatchObject({ boardSize: 32 });
        });
    });

    describe('explicit override wins over the implied default', () => {
        it('--players 3 --board-size 32 overrides the implied 48', () => {
            expect(run(['--players', '3', '--board-size', '32']).result).toMatchObject({
                playerCount: 3,
                boardSize: 32,
            });
        });

        it('--players 4 --board-size 32 overrides the implied 48', () => {
            expect(run(['--players', '4', '--board-size', '32']).result).toMatchObject({
                playerCount: 4,
                boardSize: 32,
            });
        });

        it('--players 2 --board-size 48 overrides the implied 32', () => {
            expect(run(['--players', '2', '--board-size', '48']).result).toMatchObject({
                playerCount: 2,
                boardSize: 48,
            });
        });
    });

    describe('flag-present beats env', () => {
        it('--players 3 overrides HOST_PLAYER_COUNT=4', () => {
            expect(run(['--players', '3'], { HOST_PLAYER_COUNT: '4' }).result).toMatchObject({ playerCount: 3 });
        });

        it('--player-count 2 overrides HOST_PLAYER_COUNT=4', () => {
            expect(run(['--player-count', '2'], { HOST_PLAYER_COUNT: '4' }).result).toMatchObject({ playerCount: 2 });
        });

        it('--board-size 48 overrides HOST_BOARD_SIZE=32', () => {
            expect(run(['--board-size', '48'], { HOST_BOARD_SIZE: '32' }).result).toMatchObject({ boardSize: 48 });
        });

        it('--boardSize 32 overrides HOST_BOARD_SIZE=64', () => {
            expect(run(['--boardSize', '32'], { HOST_BOARD_SIZE: '64' }).result).toMatchObject({ boardSize: 32 });
        });

        it('flag playerCount is independent of env boardSize (no implied coupling)', () => {
            // --players 3 would imply board 48, but HOST_BOARD_SIZE=32 is explicit → 32 wins.
            expect(run(['--players', '3'], { HOST_BOARD_SIZE: '32' }).result).toMatchObject({
                playerCount: 3,
                boardSize: 32,
            });
        });
    });

    describe('invalid playerCount fails with the exact allowed-set message', () => {
        const cases: Array<{ label: string; args: readonly string[]; env?: NodeJS.ProcessEnv }> = [
            { label: '5 (out of set)', args: ['--players', '5'] },
            { label: '1 (out of set)', args: ['--players', '1'] },
            { label: 'non-finite "abc"', args: ['--players', 'abc'] },
            { label: 'alias mismatch 32 (board-size domain)', args: ['--players', '32'] },
            { label: 'env 5', args: [], env: { HOST_PLAYER_COUNT: '5' } },
            { label: 'env non-finite "xyz"', args: [], env: { HOST_PLAYER_COUNT: 'xyz' } },
            { label: 'alias --player-count 64', args: ['--player-count', '64'] },
        ];
        for (const c of cases) {
            it(`rejects ${c.label}`, () => {
                const { result, stderr } = run(c.args, c.env ?? {});
                expect(result).toBeNull();
                expect(stderr).toContain('host: --players must be 2, 3, or 4');
            });
        }
    });

    describe('invalid boardSize fails with the exact allowed-set message', () => {
        const cases: Array<{ label: string; args: readonly string[]; env?: NodeJS.ProcessEnv }> = [
            { label: '16 (out of set)', args: ['--board-size', '16'] },
            { label: '5 (out of set)', args: ['--board-size', '5'] },
            { label: 'non-finite "abc"', args: ['--board-size', 'abc'] },
            { label: 'alias mismatch 3 (player-count domain)', args: ['--board-size', '3'] },
            { label: 'env 16', args: [], env: { HOST_BOARD_SIZE: '16' } },
            { label: 'env non-finite "xyz"', args: [], env: { HOST_BOARD_SIZE: 'xyz' } },
            { label: 'alias --boardSize 4', args: ['--boardSize', '4'] },
        ];
        for (const c of cases) {
            it(`rejects ${c.label}`, () => {
                const { result, stderr } = run(c.args, c.env ?? {});
                expect(result).toBeNull();
                expect(stderr).toContain('host: --board-size must be 32 or 48');
            });
        }
    });

    describe('boardSize 64 is temporarily disabled (terrain issue #26)', () => {
        const cases: Array<{ label: string; args: readonly string[]; env?: NodeJS.ProcessEnv }> = [
            { label: '--board-size 64', args: ['--board-size', '64'] },
            { label: '--boardSize=64', args: ['--boardSize=64'] },
            { label: 'HOST_BOARD_SIZE=64', args: [], env: { HOST_BOARD_SIZE: '64' } },
        ];
        for (const c of cases) {
            it(`rejects ${c.label} with the temp-disabled message`, () => {
                const { result, stderr } = run(c.args, c.env ?? {});
                expect(result).toBeNull();
                expect(stderr).toContain(
                    'host: --board-size 64 is temporarily disabled — 64×64 generation is unreliable (terrain issue #26 pending fix)',
                );
            });
        }

        it('flag 64 still beats env (rejected before the env value is read)', () => {
            const { result, stderr } = run(['--board-size', '64'], { HOST_BOARD_SIZE: '32' });
            expect(result).toBeNull();
            expect(stderr).toContain('host: --board-size 64 is temporarily disabled');
        });
    });

    describe('FR-012: second-port surface is hard-rejected', () => {
        it('--static-port 5173 fails fast', () => {
            const { result, stderr } = run(['--static-port', '5173']);
            expect(result).toBeNull();
            expect(stderr).toContain('host: --static-port / HOST_STATIC_PORT no longer supported');
        });

        it('--static-port=5173 inline form fails fast', () => {
            const { result, stderr } = run(['--static-port=5173']);
            expect(result).toBeNull();
            expect(stderr).toContain('host: --static-port / HOST_STATIC_PORT no longer supported');
        });

        it('HOST_STATIC_PORT env fails fast', () => {
            const { result, stderr } = run([], { HOST_STATIC_PORT: '5173' });
            expect(result).toBeNull();
            expect(stderr).toContain('host: --static-port / HOST_STATIC_PORT no longer supported');
        });

        it('rejection takes precedence over otherwise-valid N-player flags', () => {
            const { result, stderr } = run(['--players', '3', '--static-port', '5173']);
            expect(result).toBeNull();
            expect(stderr).toContain('host: --static-port / HOST_STATIC_PORT no longer supported');
        });
    });

    it('resolves the base HostConfig surface alongside the N-player fields', () => {
        expect(run(['--players', '3', '--board-size', '32']).result).toMatchObject({
            bindHost: '127.0.0.1',
            publicHost: 'localhost',
            port: 8080,
            wsPort: 8080,
            playerCount: 3,
            boardSize: 32,
        });
    });
});
