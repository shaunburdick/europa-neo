import { createInterface } from 'node:readline';
import { isAllowlistedRemoteUrlToken } from './remote-url-allowlist.js';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const violations: string[] = [];

for await (const urlToken of input) {
    if (urlToken.length > 0 && !isAllowlistedRemoteUrlToken(urlToken)) {
        violations.push(urlToken);
    }
}

if (violations.length > 0) {
    process.stdout.write(`${violations.join('\n')}\n`);
}
