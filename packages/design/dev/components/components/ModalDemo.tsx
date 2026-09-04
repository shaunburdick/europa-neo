import type React from 'react';
import { useState } from 'react';
import { EuropaButton, EuropaModal } from '../../../src/components';

export function ModalDemo(): React.ReactElement {
    const [open, setOpen] = useState(false);

    return (
        <section id="modal" className="dev-section">
            <h2 className="dev-section__heading">Modal</h2>
            <EuropaButton onClick={() => setOpen(true)}>Open Modal</EuropaButton>
            <EuropaModal open={open} onClose={() => setOpen(false)} title="Demo Modal">
                <p>Modal content goes here.</p>
                <EuropaButton onClick={() => setOpen(false)}>Close</EuropaButton>
            </EuropaModal>
        </section>
    );
}
