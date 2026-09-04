/**
 * TypographyScale — renders the type scale section of the dev page.
 *
 * Displays every typography size token as a visual sample with its
 * CSS variable name and computed pixel value. Each sample renders
 * using its declared `var(--europa-typography-size-*)` token so
 * the output is entirely driven by the canonical token table.
 *
 * Section id is `"typography"` for deep-link hash navigation.
 *
 * @see dev/lib/token-utils.ts — buildTypeSamples()
 * @see dev/styles/shell.css — .dev-type-scale, .dev-type-sample
 */

import type React from 'react';
import { buildTypeSamples } from '../../lib/token-utils';

/**
 * Typography scale section component.
 *
 * @returns A `<section>` element containing the full type scale.
 */
export function TypographyScale(): React.ReactElement {
    const samples = buildTypeSamples();

    return (
        <section id="typography" className="dev-section">
            <h2 className="dev-section__heading">Typography</h2>
            <p className="dev-section__desc">Type scale and font stack</p>
            <div className="dev-type-scale">
                {samples.map((sample) => (
                    <div key={sample.token} className="dev-type-sample">
                        <span
                            style={{
                                fontSize: `var(--europa-typography-size-${sample.token})`,
                            }}
                        >
                            {sample.sample}
                        </span>
                        <code>--europa-typography-size-{sample.token}</code>
                        <span>{sample.value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
