---
name: style
description: Set up code style configuration for a project. Installs the right linting and formatting rules based on the repo's GitHub org — @shaunburdick's personal config for shaunburdick/* repos, the org's own style repo for other orgs, or standard recommended defaults as a fallback. Load this skill when setting up a new project, when asked to "add linting", "set up code style", "configure eslint", "add prettier", "set up formatting", "configure editorconfig", or "standardize code style" — even if the user doesn't mention a specific tool by name.
license: MIT
metadata:
  author: shaunburdick
  version: "1.1.0"
---

# Style Setup

Set up code style configuration using the appropriate rules for the repo's organization.

## Step 1: Determine the repo's org

Run `git remote get-url origin` to get the remote URL and extract the org/owner name.

- If the org is **`shaunburdick`** → follow the [shaunburdick org](#shaunburdick-org) instructions below.
- For **any other org** → follow the [other orgs](#other-orgs) instructions below.
- If there is **no git remote** (e.g., a brand-new local project) → ask the user which org this project belongs to, then proceed accordingly.

---

## shaunburdick org

Install @shaunburdick's personal style configuration from [github.com/shaunburdick/style](https://github.com/shaunburdick/style).

1. Check whether a `.editorconfig` file already exists in the project root. If it does, show the user the existing content and confirm before overwriting.

2. Fetch and follow the install instructions in the root `README.md` at `https://raw.githubusercontent.com/shaunburdick/style/main/README.md`

3. If the project contains JavaScript or TypeScript files (look for `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx` files, or a `package.json`), also fetch and follow the install instructions in `https://raw.githubusercontent.com/shaunburdick/style/main/eslint/README.md`

---

## Other orgs

For repos belonging to other organizations, respect that org's existing style choices rather than imposing personal preferences.

1. **Look for an org style repo** — check if `github.com/<org>/style` or `github.com/<org>/eslint-config-<org>` exists (use `gh repo view <org>/style` or a quick web search). If found, fetch its README and follow its install instructions.

2. **Look for existing style config in the repo** — check for `.editorconfig`, `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, or a `lint`/`format` script in `package.json`. If style is already configured, point it out to the user and ask whether they want to extend or replace it rather than silently overwriting.

3. **Fall back to standard recommended defaults** — if no org style repo exists and no config is present, install the ecosystem's standard recommended config:
   - **JavaScript/TypeScript**: `eslint` with `eslint:recommended` (JS) or `plugin:@typescript-eslint/recommended` (TS), plus a minimal `.editorconfig` (2-space indent, LF line endings, UTF-8, final newline).
   - **Python**: `ruff` with default settings (covers both linting and formatting).
   - **Other languages**: use the most widely-adopted linter/formatter for that ecosystem with its recommended defaults.

4. Always tell the user which path was taken (org style repo found, existing config extended, or standard defaults applied) so there are no surprises.
