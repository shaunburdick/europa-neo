---
name: design-system
description: "Guide for using the @europa/design component library and CSS token system. Load this skill before implementing any UI work in the console package — it prevents common mistakes like using raw HTML elements when design system components exist. Covers all 20 React components (13 generic + 7 game primitives), CSS custom property tokens, button variants, import patterns, and anti-patterns to avoid. Use whenever writing or modifying UI components, adding sidebar sections, or working with europa-* CSS classes."
---

# Design System — Europa Neo

Guide for using the `@europa/design` component library and CSS token system. Load this skill before implementing any UI work in the console package — it prevents common mistakes like using raw HTML elements when design system components exist.

## When to load this skill

- Implementing or modifying UI components in `packages/console/`
- Adding new sections, panels, or interactive elements to the sidebar, HUD, or lobby
- Writing CSS that references `europa-*` tokens or class names
- Reviewing UI code for design system compliance

## Quick reference: Available components

Import from `@europa/design/components`:

### Generic components (13)

| Component | When to use | Key props |
|-----------|-------------|-----------|
| `EuropaButton` | Any clickable action — **never use raw `<button>`** | `variant` (primary/secondary/ghost/success/warning/error/info), `size` (sm/lg), `disabled`, `type` |
| `EuropaTypography` | Text content with semantic styling | `variant` (heading/body/caption/label) |
| `EuropaCard` | Contained content grouping | `className` |
| `EuropaPlate` | Flat styled surface | `className` |
| `EuropaContainer` | Layout wrapper | `className` |
| `EuropaStack` | Vertical/horizontal stacking | `direction`, `gap` |
| `EuropaGrid` | Grid layout | `columns`, `gap` |
| `EuropaBadge` | Status indicators, labels | `variant` |
| `EuropaChip` | Compact info tokens | `className` |
| `EuropaBanner` | Alert/notice messages | `variant` |
| `EuropaModal` | Dialog overlays | `open`, `onClose`, `title` |
| `EuropaPage` | Page-level wrapper | `className` |
| `EuropaWaiting` | Loading states | `className` |

### Game-specific primitives (7)

| Component | When to use |
|-----------|-------------|
| `EuropaPlayerBadge` | Player identity display |
| `EuropaTroopChip` | Troop count on cells |
| `EuropaCityMarker` | City indicators |
| `EuropaReserveIndicator` | Reserve level display |
| `EuropaElevationSwatch` | Elevation legend |
| `EuropaPipeSlope` | Pipe direction indicators |
| `EuropaFogOverlay` | Fog-of-war rendering |

## Import pattern

```tsx
import { EuropaButton, EuropaTypography } from '@europa/design/components';
```

## Button variants — choose the right one

| Variant | Use case | Background |
|---------|----------|------------|
| `primary` | Main call-to-action | Accent color |
| `secondary` | Alternate actions | Surface color |
| `ghost` | Inline/text-like actions, collapsible toggles | Transparent |
| `success` | Confirm/positive actions | Green |
| `warning` | Caution actions | Yellow |
| `error` | Destructive actions | Red |
| `info` | Informational actions | Blue |

**Example — collapsible section toggle (like the sidebar Debug section):**

```tsx
<EuropaButton
    variant="ghost"
    className="europa-sidebar__heading europa-sidebar__debug-toggle"
    onClick={(): void => setExpanded((prev) => !prev)}
    aria-expanded={expanded}
>
    Section Title
</EuropaButton>
```

The `ghost` variant provides `background-color: transparent` and removes UA button defaults — no `all: unset` hacks needed.

## CSS tokens

All tokens are CSS custom properties prefixed with `--europa-*`. Reference them in CSS:

```css
.my-component {
    background-color: var(--europa-color-surface);
    color: var(--europa-color-text-primary);
    padding: var(--europa-spacing-sm);
    border: var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-border);
    border-radius: var(--europa-radii-md);
    font-size: var(--europa-typography-size-sm);
}
```

### Key token groups

| Group | Prefix | Examples |
|-------|--------|----------|
| Colors | `--europa-color-*` | `surface`, `text-primary`, `accent`, `error` |
| Spacing | `--europa-spacing-*` | `xs`, `sm`, `md`, `lg`, `xl` |
| Typography | `--europa-typography-*` | `size-sm`, `size-md`, `font-stack` |
| Borders | `--europa-borders-*` | `width`, `style` |
| Radii | `--europa-radii-*` | `sm`, `md`, `lg`, `input` |
| Focus ring | `--europa-focus-ring-*` | `width`, `style`, `color`, `offset` |

**Full token reference**: See `DESIGN.md` §1 (sections 1.1–1.8) for every token with canonical values and accessibility pairings.

## Anti-patterns — do NOT do these

| ❌ Anti-pattern | ✅ Correct approach |
|----------------|---------------------|
| Raw `<button>` with CSS overrides | `EuropaButton variant="ghost"` |
| `all: unset` on buttons | Use `EuropaButton` — it handles UA reset |
| Hardcoded hex colors (`#111827`) | Use CSS tokens (`var(--europa-color-surface)`) |
| Inline styles for spacing | Use token-based classes or spacing utilities |
| `font-size: 14px` | `font-size: var(--europa-typography-size-sm)` |
| Custom focus outlines | `EuropaButton` applies `--europa-focus-ring-*` automatically |
| Raw `<h2>` for section headings in interactive areas | `EuropaButton variant="ghost"` when clickable, `<h2>` when static |

## Architecture notes

- **React components** (not web components) — all 20 components are React function components
- **Shadow DOM** for generic components (13), **Light DOM** for game primitives (7)
- **CSS custom properties** inherit through Shadow DOM boundaries
- **Single stylesheet**: `packages/design/dist/design.css` — all tokens in `:root`, catalog classes prefixed with `europa-*`
- **Import path**: `@europa/design/components` (barrel re-export, no side effects)

## Where to learn more

- **Full design contract**: `DESIGN.md` at repo root — tokens, component catalog, accessibility table, build rules
- **Component source**: `packages/design/src/components/` — each component is a single `.tsx` file
- **Token constants**: `packages/design/src/brand/tokens.ts` — TypeScript mirror of CSS tokens
- **Feature spec**: `specs/012-design-system/spec.md`
