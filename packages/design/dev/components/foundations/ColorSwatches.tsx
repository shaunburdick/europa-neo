/**
 * ColorSwatches — renders color tokens as swatch cards with WCAG contrast ratios.
 *
 * Each swatch displays the color name, hex value, CSS variable reference,
 * and WCAG contrast ratios against both white (#ffffff) and black (#000000)
 * backgrounds, with pass/fail indicators (4.5:1 AA threshold).
 *
 * All styling inherits from shell.css using `var(--europa-*)` tokens —
 * zero hardcoded hex/rgb in property values.
 *
 * @see dev/lib/token-utils.ts — buildColorCategories() data source
 * @see dev/lib/contrast.ts — contrastRatio(), contrastRatioNumeric()
 * @see dev/styles/shell.css — .dev-swatches, .dev-swatch rules
 */

import type React from 'react';
import { contrastRatio, contrastRatioNumeric } from '../../lib/contrast';
import { buildColorCategories, toKebabCase } from '../../lib/token-utils';

/** WCAG AA contrast ratio threshold for normal text. */
const WCAG_AA_THRESHOLD = 4.5;

/**
 * ColorSwatches section — displays all color tokens organized by category.
 *
 * Renders a grid of swatch cards per category, each showing:
 * - Color preview (inline backgroundColor from the token value)
 * - Token name
 * - Hex value
 * - CSS variable name (--europa-color-{kebab})
 * - Contrast ratio vs white with pass/fail
 * - Contrast ratio vs black with pass/fail
 *
 * @returns The colors section element with id="colors" for hash navigation.
 */
export function ColorSwatches(): React.ReactElement {
    const categories = buildColorCategories();

    return (
        <section id="colors" className="dev-section">
            <h2 className="dev-section__heading">Colors</h2>
            <p className="dev-section__description">Color tokens with WCAG contrast ratios</p>
            {categories.map((category) => (
                <div key={category.title} className="dev-swatches__category">
                    <h3 className="dev-swatches__category-title">{category.title}</h3>
                    <div className="dev-swatches">
                        {category.swatches.map((swatch) => {
                            const cssVar = `--europa-color-${toKebabCase(swatch.name)}`;
                            const vsWhiteRatio = contrastRatio(swatch.value, '#ffffff');
                            const vsWhiteNumeric = contrastRatioNumeric(swatch.value, '#ffffff');
                            const vsWhitePass = vsWhiteNumeric >= WCAG_AA_THRESHOLD;

                            const vsBlackRatio = contrastRatio(swatch.value, '#000000');
                            const vsBlackNumeric = contrastRatioNumeric(swatch.value, '#000000');
                            const vsBlackPass = vsBlackNumeric >= WCAG_AA_THRESHOLD;

                            return (
                                <div key={swatch.name} className="dev-swatch">
                                    <div className="dev-swatch__color" style={{ backgroundColor: swatch.value }} />
                                    <div className="dev-swatch__info">
                                        <div className="dev-swatch__name">{swatch.name}</div>
                                        <code className="dev-swatch__value">{swatch.value}</code>
                                        <code className="dev-swatch__value">{cssVar}</code>
                                        <div className="dev-swatch__value">
                                            vs white: {vsWhiteRatio} ({vsWhitePass ? 'Pass' : 'Fail'})
                                        </div>
                                        <div className="dev-swatch__value">
                                            vs black: {vsBlackRatio} ({vsBlackPass ? 'Pass' : 'Fail'})
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </section>
    );
}
