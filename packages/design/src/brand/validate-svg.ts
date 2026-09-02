/**
 * Structural safety checks for authored SVG masters.
 *
 * This dependency-free scanner intentionally fails closed for malformed XML
 * and browser-active content. Gradients, filters, clip paths, and local
 * fragment references remain valid under the approved Option B treatment.
 */

export interface SvgValidationResult {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

const XML_NAME = '[A-Za-z_][A-Za-z0-9_.:-]*';
/** Elements permitted in a self-contained, non-active brand SVG. */
const SAFE_ELEMENTS = new Set([
    'circle',
    'clippath',
    'defs',
    'desc',
    'ellipse',
    'fegaussianblur',
    'femerge',
    'femergenode',
    'filter',
    'g',
    'line',
    'lineargradient',
    'path',
    'radialgradient',
    'rect',
    'stop',
    'svg',
    'title',
]);
const URL_REFERENCE = /(?:data:|https?:|ftp:|file:|javascript:|blob:|\/\/)/i;

const findTagEnd = (source: string, start: number): number => {
    let quote: '"' | "'" | undefined;
    for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (quote !== undefined) {
            if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === '>') {
            return index;
        }
    }
    return -1;
};

const inspectAttributes = (body: string, errors: string[]): void => {
    const attributeSource = body.replace(/\s*\/?\s*$/, '');
    const pattern = new RegExp(`^\\s*(${XML_NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    const names = new Set<string>();
    let remaining = attributeSource;
    while (remaining.trim() !== '') {
        const match = remaining.match(pattern);
        if (match === null) {
            errors.push('malformed attribute syntax');
            return;
        }
        const matchedName = match[1];
        if (matchedName === undefined) {
            errors.push('malformed attribute name');
            return;
        }
        const name = matchedName.toLowerCase();
        const value = match[2] ?? match[3] ?? '';
        if (names.has(name)) errors.push(`duplicate attribute: ${matchedName}`);
        names.add(name);
        if (/^on[a-z]/i.test(name)) errors.push(`event-handler attribute: ${matchedName}`);
        if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
            errors.push(`external or embedded reference in ${matchedName}`);
        }
        if (name !== 'xmlns' && name !== 'xmlns:xlink' && (URL_REFERENCE.test(value) || /url\(\s*(?!#)/i.test(value))) {
            errors.push(`external or network reference in ${matchedName}`);
        }
        if (/(?:font-family|font-face|@import|@font)/i.test(`${name}=${value}`)) {
            errors.push(`font reference in ${matchedName}`);
        }
        remaining = remaining.slice(match[0].length);
    }
};

/** Validate one SVG document against the brand master safety contract. */
export const validateSvg = (source: string): SvgValidationResult => {
    if (source.trim() === '') return { valid: false, errors: ['SVG is empty'] };
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) {
        return { valid: false, errors: ['doctype, entity, or stylesheet declarations are forbidden'] };
    }
    if (/&(?!#\d+;|#x[\da-f]+;|amp;|lt;|gt;|quot;|apos;)/i.test(source)) {
        return { valid: false, errors: ['malformed entity reference'] };
    }

    const errors: string[] = [];
    const stack: string[] = [];
    let position = 0;
    let rootSeen = false;
    let rootClosed = false;
    while (position < source.length) {
        const opening = source.indexOf('<', position);
        const text = opening === -1 ? source.slice(position) : source.slice(position, opening);
        if (stack.length === 0 && text.trim() !== '') errors.push('text outside the SVG root');
        if (opening === -1) break;
        if (source.startsWith('<!--', opening)) {
            const end = source.indexOf('-->', opening + 4);
            if (end === -1) errors.push('unterminated comment');
            else if (source.slice(opening + 4, end).includes('--')) errors.push('invalid double hyphen in comment');
            position = end === -1 ? source.length : end + 3;
            continue;
        }
        if (source.startsWith('<![CDATA[', opening)) {
            const end = source.indexOf(']]>', opening + 9);
            if (end === -1) errors.push('unterminated CDATA section');
            position = end === -1 ? source.length : end + 3;
            continue;
        }
        if (source.startsWith('<?', opening)) {
            const end = source.indexOf('?>', opening + 2);
            if (end === -1) errors.push('unterminated processing instruction');
            position = end === -1 ? source.length : end + 2;
            continue;
        }
        const end = findTagEnd(source, opening + 1);
        if (end === -1) {
            errors.push('unterminated element');
            break;
        }
        const raw = source.slice(opening + 1, end).trim();
        const closing = raw.startsWith('/');
        const selfClosing = /\/\s*$/.test(raw);
        const tagBody = raw
            .replace(/^\//, '')
            .replace(/\/\s*$/, '')
            .trim();
        const match = tagBody.match(new RegExp(`^(${XML_NAME})([\\s\\S]*)$`));
        if (match === null) {
            errors.push('malformed element tag');
            position = end + 1;
            continue;
        }
        const name = match[1];
        if (name === undefined) {
            errors.push('malformed element name');
            position = end + 1;
            continue;
        }
        if (!SAFE_ELEMENTS.has(name.toLowerCase())) errors.push(`forbidden element: ${name}`);
        if (!closing) inspectAttributes(match[2] ?? '', errors);
        if (closing) {
            if (stack.pop() !== name) errors.push(`mismatched closing element: ${name}`);
            if (name.toLowerCase() === 'svg') rootClosed = true;
        } else {
            if (!rootSeen) {
                if (name.toLowerCase() !== 'svg') errors.push('SVG root element is required');
                rootSeen = true;
            } else if (rootClosed) errors.push('content appears after the SVG root');
            if (!selfClosing) stack.push(name);
            else if (name.toLowerCase() === 'svg') rootClosed = true;
        }
        position = end + 1;
    }
    if (!rootSeen) errors.push('SVG root element is required');
    if (stack.length > 0) errors.push(`unclosed element: ${stack[stack.length - 1]}`);
    if (!rootClosed) errors.push('SVG root is not closed');

    const root = source.match(/<svg\b([^>]*)>/i)?.[1];
    const viewBox = root?.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
    const values = viewBox
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
    if (values === undefined || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
        errors.push('viewBox must contain four finite numbers');
    } else if ((values[2] ?? 0) <= 0 || (values[3] ?? 0) <= 0) {
        errors.push('viewBox width and height must be positive');
    }
    return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
};

/** Throw a descriptive error when an SVG master violates the brand contract. */
export const assertValidSvg = (source: string, name = 'SVG'): void => {
    const result = validateSvg(source);
    if (!result.valid) throw new Error(`${name} failed structural validation: ${result.errors.join('; ')}`);
};
