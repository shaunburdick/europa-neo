import type { Rule, UserConfig } from '@commitlint/types';

/**
 * Forbidden bot co-author trailers.
 *
 * GitHub's squash-merge preserves `Co-authored-by:` trailers from branch
 * commits into the squash commit, which puts bot accounts on the repository's
 * Contributors list. Match by name (not email domain) so future variants
 * (e.g. "Claude Opus 4.5") are caught. Case-insensitive per git trailer
 * conventions. Human co-authors remain allowed — only bot names are rejected.
 */
const BOT_CO_AUTHOR = /Co-authored-by:\s*(?:GitHub\s+)?(?:Copilot|Claude)\b/i;

/**
 * Rejects commit messages carrying a bot co-author trailer. The full raw
 * message is scanned (not just the parsed footer) so trailers after GitHub's
 * `---------` squash-merge separator are caught too.
 */
const noBotCoauthors: Rule = (parsed) => {
    const raw = parsed.raw ?? '';
    if (BOT_CO_AUTHOR.test(raw)) {
        return [
            false,
            'commit must not contain bot co-author trailers (Copilot/Claude) — they add bots to the GitHub Contributors list',
        ];
    }
    return [true];
};

const config: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    plugins: [
        {
            rules: {
                'no-bot-coauthors': noBotCoauthors,
            },
        },
    ],
    rules: {
        'no-bot-coauthors': [2, 'always'],
    },
};

export default config;
