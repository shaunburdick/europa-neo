import { describe, expect, test } from 'vitest';
import { isAllowlistedRemoteUrlToken } from '../../../scripts/remote-url-allowlist.js';

// These 20 inputs come from the deleted selfhost-budget.test.ts at 4eea8cb^.
// Expected booleans pin the current Bash case outcomes, not strict rejection
// expectations or a security guarantee. Some inputs intentionally match via
// substring patterns; scanner hardening remains deferred to issue #222.
const HISTORICAL_URL_CASES = [
    ['manual host path', 'https://shaunburdick.github.io/other', true],
    ['manual URL query', 'https://shaunburdick.github.io/europa-neo/manual/?source=external', true],
    ['manual URL fragment', 'https://shaunburdick.github.io/europa-neo/manual/#external', true],
    ['repository URL query', 'https://github.com/shaunburdick/europa-neo?token=external', true],
    ['repository URL fragment', 'https://github.com/shaunburdick/europa-neo#external', true],
    ['uppercase GitHub scheme', 'HTTPS://github.com/shaunburdick/europa-neo', true],
    ['uppercase GitHub hostname', 'https://GITHUB.com/shaunburdick/europa-neo', false],
    ['GitHub hostname lookalike', 'https://github.com.evil.invalid/shaunburdick/europa-neo', true],
    ['uppercase manual scheme', 'HTTPS://shaunburdick.github.io/europa-neo/manual/', true],
    ['uppercase manual hostname', 'https://SHAUNBURDICK.github.io/europa-neo/manual/', false],
    ['manual hostname lookalike', 'https://shaunburdick.github.io.evil.invalid/europa-neo/manual/', true],
    ['non-exact localhost spelling', 'HTTP://LOCALHOST/', false],
    ['non-exact namespace spelling', 'https://WWW.W3.ORG/2000/svg', false],
    ['uppercase React scheme', 'HTTPS://react.dev/errors/', true],
    ['uppercase React hostname', 'https://REACT.dev/errors/', false],
    ['React error URL suffix', 'https://react.dev/errors/418', true],
    ['React error URL query', 'https://react.dev/errors/?args=external', true],
    ['React error URL fragment', 'https://react.dev/errors/#external', true],
    ['legacy React error-decoder host', 'https://reactjs.org/docs/error-decoder.html?invariant=1', true],
    [
        'nested URL on manual path',
        'https://shaunburdick.github.io/europa-neo/manual/?next=https://unexpected.invalid/x',
        true,
    ],
] as const;

describe('self-host remote URL allowlist', () => {
    test.each(HISTORICAL_URL_CASES)(
        'preserves current Bash case behavior for %s',
        (_description, urlToken, allowed) => {
            expect(isAllowlistedRemoteUrlToken(urlToken)).toBe(allowed);
        },
    );
});
