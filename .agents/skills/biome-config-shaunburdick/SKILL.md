---
name: biome-config-shaunburdick
description: Install, set up, and debug the biome-config-shaunburdick Biome config (v1) — the Rust-based alternative to eslint-config-shaunburdick. Use when `biome check` fails with a rule you don't recognize, when adding Biome to a project, when deciding between Biome and the ESLint config, when upgrading @biomejs/biome and getting new errors, or when a nursery rule changes. Covers the three layers, the nursery-rule stability risk, version pinning via biome migrate, and what has no Biome equivalent.
metadata:
  author: shaunburdick
  version: "1.0.1"
---

# biome-config-shaunburdick

Shaun's [Biome](https://biomejs.dev/) configuration: one `biome.json` providing linting,
formatting, and import organization in the same house style as the ESLint config —
4-space indent, 120-char lines, single quotes, semicolons.

**Biome is an alternative to ESLint, not a companion to it.** Pick one. If you need
the `llm-core` agentic guardrails, JSDoc rules, the `security` plugin, promise
discipline, the naming denylist, or `max-inline-disables`, use the
`eslint-config-shaunburdick` skill instead — none of those have a Biome equivalent.
See [When to use which](#when-to-use-which) for the full list.

## Install

Requires **Node.js >= 22** (higher floor than the ESLint config's 20.19) and
**`@biomejs/biome` >= 2.5 < 3**.

```sh
npm install --save-dev @biomejs/biome@^2.5.0 biome-config-shaunburdick
```

## Set up

Extend it from your project's `biome.json`:

```json
{
    "extends": ["biome-config-shaunburdick"]
}
```

Then wire the scripts so lint runs in your test cycle:

```json
{
    "scripts": {
        "lint": "biome check .",
        "lint:fix": "npm run lint -- --write",
        "test": "npm run lint && jest"
    }
}
```

`biome check` runs lint + format + import organization in one pass. Almost everything
is fixable with `--write`, so **run `--write` first and review the diff** — it is both
your formatter and your autofixer.

## The three layers

The package ships a **single `biome.jsonc`** containing all three layers. This is
deliberate, not a limitation to work around: Biome 2.5 drops `linter` sections from
transitive `extends` inside published packages and does not resolve bare package
subpaths in `extends`, so the layers cannot be split across files.

| Layer | Scope | Rules |
| --- | --- | --- |
| Base JS | every file | 105 |
| TypeScript | `**/*.{ts,tsx}` | 34 (33 TS-specific) |
| React | `**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}` | 26 (all React-specific) |

**164 unique rules** are active. Of those, ~91 correspond to a rule in the ESLint
config; the rest are Biome-native checks (`correctness`, `security`) with no ESLint
counterpart. A layer-by-layer breakdown of the port, with the resolved thresholds for
each rule, is in
[`references/biome-mapping.md`](references/biome-mapping.md).

Formatting is delegated to Biome's formatter (`indentStyle: space`, `indentWidth: 4`,
`lineWidth: 120`, single quotes); import ordering runs via the `organizeImports` assist
action rather than an `import-x/order` port.

Biome infers types natively, so the TypeScript layer's promise and exhaustiveness
checks work **without `tsc` and without `projectService`** — the practical advantage
over the ESLint config's `projectService: true` setup.

## Version pinning — read this before upgrading Biome

**13 of the 164 active rules come from Biome's `nursery` group.** Nursery rules are
unstable: they may change options, move groups, or be removed in a **minor** release.
Unlike ESLint rules, a minor `@biomejs/biome` bump can therefore introduce new lint
errors with no config change on your side.

The nursery rules this config enables:

| Group | Rules |
| --- | --- |
| Base JS | `noImpliedEval`, `useArraySome`, `useIncludes`, `useStringStartsEndsWith` |
| TypeScript | `noFloatingPromises`, `noMisusedPromises`, `useAwaitThenable`, `useExhaustiveSwitchCases`, `useNullishCoalescing` |
| React | `noJsxLeakedDollar`, `noJsxNamespace`, `useIframeSandbox`, `useReactAsyncServerFunction` |

**Pin `@biomejs/biome` to an exact version.** The peer range is `>=2.5.0 <3`, which is
deliberately loose so consumers can take security and bugfix patches — but if a minor
release breaks you on a nursery rule, the range will not protect you. If you need a
hard floor, pin exactly in your own `devDependencies`.

The config's `$schema` URL is version-pinned (`.../schemas/2.5.14/schema.json`). When
you bump Biome, run:

```sh
npx biome migrate --write
```

Without it the config reports a schema mismatch.

## When to use which

| | ESLint config | Biome config |
| --- | --- | --- |
| Rules | ~675 active | 164 configured (~91 ported) |
| Node | >= 20.19 | >= 22 |
| Type checking | `projectService: true`, needs `tsconfig.json` | Native inference, no `tsc` needed |
| Install | `eslint` + this package | `@biomejs/biome` + this package |

**Use the ESLint config if you rely on:** the `llm-core` guardrails (over-engineering,
swallowed errors, unsafe types, type assertions), JSDoc rules, the `security` plugin,
promise discipline (`always-return`, `catch-or-return`), the naming denylist
(`any`, `Number`, `String`, …) and `id-length`, `shaunburdick/max-inline-disables`, or
the `max-file-length` / `max-function-length` / `max-nesting-depth` complexity budgets.
**None of those have a Biome equivalent.**

## Known divergences from the ESLint config

1. **Magic numbers are stricter.** Biome's `noMagicNumbers` has no ignore-list option,
   so it flags 3–5, 12, 15, and 120 (which the ESLint config's llm-core layer
   explicitly ignores) and exempts 24/60 (which the ESLint config flags). If you are
   porting, expect churn on numeric literals.
2. **Promise discipline is thinner.** Only nested promises are checked; `always-return`,
   `catch-or-return`, and `param-names` remain ESLint-only.
3. **No JSDoc, security-plugin, or llm-core coverage.**
4. **`max-inline-disables` is impossible in Biome.** Its GritQL plugin system cannot
   read comments, so a rule that counts `eslint-disable` comments has no equivalent.
5. **Complexity budgets are looser.** Biome sets `useMaxParams: 5` and
   `noExcessiveCognitiveComplexity: 15`. The ESLint config is stricter on both —
   `llm-core/max-params` allows **2** positional parameters (5 for constructors) and
   `llm-core/max-complexity` caps at **10** (it also enforces `sonarjs/cognitive-complexity`
   at 15). Biome has no file-length, function-length, or nesting-depth budget.
6. **13 rules are nursery** — see [Version pinning](#version-pinning--read-this-before-upgrading-biome).

## When lint fails

Read the rule name in the output; it is namespaced by Biome group (`lint/a11y/…`,
`lint/nursery/…`, `lint/suspicious/…`). The groups map to:

| Prefix | Group |
| --- | --- |
| `lint/correctness/` | Likely bugs — types, async correctness, class/interface mistakes |
| `lint/suspicious/` | Code that looks wrong: duplicate cases, control chars, no-control-regex |
| `lint/style/` | Conventions Biome can express but ESLint has no equivalent for |
| `lint/complexity/` | Cognitive complexity, params, nesting |
| `lint/nursery/` | Unstable — see [Version pinning](#version-pinning--read-this-before-upgrading-biome) |
| `lint/a11y/` | Accessibility |
| `lint/security/` | Security patterns |

Most findings are fixable with `biome check --write`. Do not suppress formatting or
`correctness` findings — the autofix is the correct answer, and a suppression buys you
a file that differs from what the next contributor will generate.

## Development

Smoke tests assert that representative violations actually fire the expected rules while a
compliant fixture passes clean. Run them with `npm test` from the `biome/` directory of the
repository.

## Reference files

- [`references/biome-mapping.md`](references/biome-mapping.md)
  — ESLint-to-Biome rule mapping with resolved thresholds, and the full known-gaps list
