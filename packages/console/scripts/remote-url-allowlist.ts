/** Match the self-host script's current Bash case allowlist, including its substring semantics. */
export function isAllowlistedRemoteUrlToken(urlToken: string): boolean {
    return (
        urlToken === 'http://' ||
        urlToken === 'https://' ||
        urlToken === 'http://localhost' ||
        urlToken.includes('www.w3.org') ||
        urlToken.includes('react.dev/errors') ||
        urlToken.includes('reactjs.org/docs/error-decoder') ||
        urlToken.includes('github.com') ||
        urlToken.includes('shaunburdick.github.io')
    );
}
