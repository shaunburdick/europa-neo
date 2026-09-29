# ESLint → Biome Mapping

Reference for the `biome-config-shaunburdick` alternative package. Read the
[`biome-config-shaunburdick` skill](../SKILL.md) first if you have not — this file
is the cross-package mapping it points at.

Every figure here is measured from `biome.jsonc` and `eslint --print-config`; the
rule counts are not estimates. This file is the source of truth for the mapping.

## When to use which

`biome-config-shaunburdick` is an **alternative** to the ESLint config, not a
companion to run alongside it. Pick one.

| | ESLint config | Biome config |
| --- | --- | --- |
| Rules | ~675 active on a `.ts` file | 164 unique, ~91 with an ESLint counterpart |
| Rule coverage | Full, including all agentic guardrails | Compatible subset only |
| Node | >= 20.19 | >= 22 |
| Type info | `projectService: true`, needs `tsconfig.json` | Native inference, no `tsc` needed |
| Speed | Slower (JS-based) | Faster (Rust-based) |
| Install | `eslint` + this package | `@biomejs/biome` + this package |

**If you rely on the `llm-core` guardrails, JSDoc rules, promise discipline,
`security` rules, the naming denylist, or `max-inline-disables`, use the ESLint
config.** None of those have Biome equivalents.

## Setup

```json
{
    "extends": ["biome-config-shaunburdick"]
}
```

The package ships a single `biome.jsonc` with three layers inside it. This is
deliberate, not a limitation to work around: Biome 2.5 drops `linter` sections
from transitive `extends` inside published packages and does not resolve bare
package subpaths in `extends`, so the layers cannot be split into separate
files.

- Base JS — applies to every file
- `**/*.{ts,tsx}` override — TypeScript layer
- JSX-capable override — React layer, plus browser and service-worker globals

## Notable mappings

| ESLint | Biome |
| --- | --- |
| `@stylistic/indent` (4) | `formatter.indentWidth: 4` |
| `@stylistic/max-len` (120) | `formatter.lineWidth: 120` |
| `@stylistic/quotes` (single) | `javascript.formatter.quoteStyle: "single"` |
| `import-x/order` | `assist.actions.source.organizeImports: "on"` |
| `max-classes-per-file` (1) | `style/noExcessiveClassesPerFile` |
| `sonarjs/cognitive-complexity` (15) | `complexity/noExcessiveCognitiveComplexity` |
| `llm-core/max-params` (2, constructor 5) | `complexity/useMaxParams` (5) |
| `unicorn/no-for-each` | `complexity/noForEach` |
| `unicorn/no-useless-undefined` | `complexity/noUselessUndefined` |
| `unicorn/prefer-node-protocol` | `style/useNodejsImportProtocol` |
| `unicorn/throw-new-error` | `style/useThrowNewError` |
| `unicorn/prefer-includes` | `nursery/useIncludes` |
| `unicorn/prefer-array-some` | `nursery/useArraySome` |
| `@typescript-eslint/no-floating-promises` | `nursery/noFloatingPromises` |
| `@typescript-eslint/no-misused-promises` | `nursery/noMisusedPromises` |
| `@typescript-eslint/switch-exhaustiveness-check` | `nursery/useExhaustiveSwitchCases` |
| `@typescript-eslint/explicit-member-accessibility` | `style/useConsistentMemberAccessibility` |
| `jsx-a11y-x/alt-text` | `a11y/useAltText` |
| `@eslint-react/dom-no-unsafe-target-blank` | `security/noBlankTarget` |

Biome infers types natively, so the TypeScript layer's promise and exhaustiveness
checks work without `tsc` and without `projectService`.

## Known gaps

No Biome equivalent exists for any of these:

- **JSDoc rules** — `check-alignment`, `tag-lines`, and the rest
- **`security` plugin** — all 13 rules
- **Promise discipline** — `always-return`, `catch-or-return`
- **`llm-core` guardrails** — the entire agentic-programming rule set
- **Naming** — the `id-denylist` (`any`, `Number`, `String`, …) and `id-length`
- **`shaunburdick/max-inline-disables`** — this config's custom rule
- **Complexity limits** — `llm-core`'s `max-file-length`, `max-function-length`,
  `max-nesting-depth`

## Version pinning

Peer dependency is `@biomejs/biome: ">=2.5.0 <3"`. The `$schema` URL in
`biome.jsonc` is version-pinned; when you bump Biome, run
`npx biome migrate --write` to keep them in sync or the config will report a
schema mismatch.
