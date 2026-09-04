import type React from 'react';
import { EuropaTypography } from '../../../src/components';

export function TypographyComponentDemo(): React.ReactElement {
    return (
        <section id="typography-component" className="dev-section">
            <h2 className="dev-section__heading">Typography</h2>
            <p className="dev-section__description">Text styling variants for headings, body, and labels.</p>
            <EuropaTypography variant="heading">Heading</EuropaTypography>
            <EuropaTypography variant="subheading">Subheading</EuropaTypography>
            <EuropaTypography variant="body">Body text</EuropaTypography>
            <EuropaTypography variant="label">Label text</EuropaTypography>
            <EuropaTypography variant="caption">Caption text</EuropaTypography>
        </section>
    );
}
