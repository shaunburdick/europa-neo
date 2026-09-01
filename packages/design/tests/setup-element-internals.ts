/**
 * Polyfill for ElementInternals in happy-dom test environments.
 *
 * happy-dom v20 does not implement HTMLElement.attachInternals() or
 * the static formAssociated flag. This polyfill stubs both so that
 * form-associated web components can be instantiated in tests.
 *
 * The `form` property is a dynamic getter: it walks the DOM at read
 * time so that elements appended to a form *after* construction still
 * report the correct associated form.
 */

// Only polyfill if attachInternals is missing (happy-dom environment)
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.attachInternals) {
    HTMLElement.prototype.attachInternals = function attachInternals(): ElementInternals {
        const host = this as Element;

        const validity = {
            valid: true,
            valueMissing: false,
            typeMismatch: false,
            patternMismatch: false,
            tooLong: false,
            tooShort: false,
            rangeUnderflow: false,
            rangeOverflow: false,
            stepMismatch: false,
            badInput: false,
            customError: false,
        };

        const internals = {
            labels: [],
            validity,
            setFormValue: () => {},
            setValidity: () => {},
            checkValidity: () => true,
            reportValidity: () => true,
            setFormData: () => {},
        } as unknown as ElementInternals;

        // Dynamic form getter — resolves the closest <form> ancestor
        // at read time so the reference stays current after DOM moves.
        Object.defineProperty(internals, 'form', {
            get(): HTMLFormElement | null {
                const ancestor = host.closest('form');
                return ancestor instanceof HTMLFormElement ? ancestor : null;
            },
            configurable: true,
        });

        return internals;
    };
}
