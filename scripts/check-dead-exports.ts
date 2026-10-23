#!/usr/bin/env node
/**
 * check-dead-exports.ts — Fail when an exported symbol has no production
 * reference (issue #140 acceptance criterion).
 *
 * A production reference is an import/use in:
 *   - packages/<pkg>/src/** (contracts excluded — see below)
 *   - packages/<pkg>/scripts/**
 *   - scripts/**
 *   - docs/manual/** (including .mdx)
 * Tests (tests/**, *.test.*, *.spec.*, E2E) are NOT production references.
 * Generated output (dist/, coverage, build artifacts) is never a caller.
 * A symbol used by production code in its own declaring file is not dead;
 * that counts as referenced even when the `export` keyword is redundant.
 *
 * contracts/ under a package's src/ is excluded from the audit: those are
 * authoritative contract mirrors guarded by each package's conformance
 * program (008 FR-029/FR-030). Re-exports of contract symbols from a
 * non-contract module ARE audited at the re-export site.
 *
 * Intentionally unreferenced public surface and documented test seams are
 * declared in scripts/dead-export-allowlist.json. Every entry needs a
 * non-empty reason; a stale entry fails the check. `"symbol": "*"` covers
 * every export reachable from that barrel — use it only for a deliberate
 * package entry point.
 *
 * Usage:
 *   tsx scripts/check-dead-exports.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = process.cwd();
const PACKAGES_DIR = 'packages';
const ALLOWLIST_PATH = 'scripts/dead-export-allowlist.json';
const SKIP_DIRS = new Set(['.git', '.astro', 'coverage', 'dist', 'node_modules', 'test-results', '__screenshots__']);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const DOC_EXTENSIONS = ['.md', '.mdx', '.astro'];

type SourceKind = 'ts' | 'doc';

interface SourceFileInfo {
    /** Repo-relative POSIX path. */
    readonly path: string;
    readonly kind: SourceKind;
    readonly text: string;
}

interface ExportEdge {
    readonly source: string;
    readonly sourceName: string;
}

interface ExportRecord {
    readonly path: string;
    readonly name: string;
    readonly alias?: ExportEdge;
}

interface ModuleFacts {
    readonly directExports: Map<string, ExportRecord>;
    readonly stars: string[];
    readonly namedImports: Array<{ name: string; module: string }>;
    readonly defaultImports: Array<{ module: string }>;
    readonly namespaceImports: Array<{ local: string; module: string }>;
    readonly namespaceAccesses: Map<string, Set<string>>;
    readonly dynamicImports: string[];
    /** Exports used by production code in their own declaring file. */
    readonly selfUsed: Set<string>;
}

interface AllowlistEntry {
    readonly package: string;
    readonly file: string;
    readonly symbol: string;
    readonly reason: string;
}

interface Allowlist {
    readonly entries: AllowlistEntry[];
    readonly barrelCoverage: Set<string>;
}

interface RawAllowlist {
    version?: unknown;
    entries?: unknown;
}

interface AllowlistCheck {
    readonly error?: string;
    readonly entry?: AllowlistEntry;
}

const posix = (path: string): string => path.split(sep).join('/');
const pairKey = (path: string, name: string): string => `${path}\u0000${name}`;

function walk(dir: string, out: SourceFileInfo[] = []): SourceFileInfo[] {
    if (!existsSync(dir)) {
        return out;
    }
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) {
            continue;
        }
        const full = join(dir, entry);
        const rel = posix(relative(REPO_ROOT, full));
        const info = statSync(full);
        if (info.isDirectory()) {
            walk(full, out);
            continue;
        }
        if (isTestPath(rel)) {
            continue;
        }
        if (SOURCE_EXTENSIONS.some((ext) => rel.endsWith(ext))) {
            out.push({ path: rel, kind: 'ts', text: readFileSync(full, 'utf-8') });
        } else if (DOC_EXTENSIONS.some((ext) => rel.endsWith(ext))) {
            out.push({ path: rel, kind: 'doc', text: readFileSync(full, 'utf-8') });
        }
    }
    return out;
}

function isTestPath(rel: string): boolean {
    return rel.split('/').includes('tests') || /\.(test|spec)\.[^/]+$/.test(rel) || rel.includes('/e2e/');
}

function isPackageSource(rel: string): boolean {
    return /^packages\/[^/]+\/src\//.test(rel);
}

function isPackageContract(rel: string): boolean {
    return /^packages\/[^/]+\/src\/contracts\//.test(rel);
}

function isAuditedSource(rel: string): boolean {
    return isPackageSource(rel) && !isPackageContract(rel);
}

const allSources: SourceFileInfo[] = [];
for (const entry of readdirSync(join(REPO_ROOT, PACKAGES_DIR))) {
    walk(join(REPO_ROOT, PACKAGES_DIR, entry, 'src'), allSources);
    walk(join(REPO_ROOT, PACKAGES_DIR, entry, 'scripts'), allSources);
}
walk(join(REPO_ROOT, 'scripts'), allSources);
walk(join(REPO_ROOT, 'docs', 'manual'), allSources);

const sourcesByPath = new Map(allSources.map((source) => [source.path, source]));
/** Contract mirrors resolve as import targets but never count as references. */
const referenceSources = allSources.filter((source) => !isPackageContract(source.path));
const auditedSources = allSources.filter((source) => isAuditedSource(source.path));

/** Map workspace package names to their source entry points. */
const packageRoots = new Map<string, string>();
for (const entry of readdirSync(join(REPO_ROOT, PACKAGES_DIR))) {
    const manifestPath = join(REPO_ROOT, PACKAGES_DIR, entry, 'package.json');
    if (!existsSync(manifestPath)) {
        continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name?: string };
    if (typeof manifest.name === 'string') {
        packageRoots.set(manifest.name, join(PACKAGES_DIR, entry));
    }
}

/** Declared `package.json#exports` entry points, keyed by package name. */
const declaredEntryFiles = new Map<string, Set<string>>();
for (const [packageName, packageRoot] of packageRoots) {
    declaredEntryFiles.set(packageName, entryPointsForPackage(packageName, packageRoot));
}

function entryPointsForPackage(packageName: string, packageRoot: string): Set<string> {
    const files = new Set<string>();
    const manifestPath = join(REPO_ROOT, packageRoot, 'package.json');
    if (!existsSync(manifestPath)) {
        return files;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { exports?: unknown };
    if (typeof manifest.exports !== 'object' || manifest.exports === null) {
        return files;
    }
    for (const key of Object.keys(manifest.exports)) {
        if (key.includes('*')) {
            continue;
        }
        const specifier = key === '.' ? packageName : `${packageName}/${key.replace(/^\.\//, '')}`;
        const resolved = resolvePackageModule(specifier);
        if (resolved) {
            files.add(resolved);
        }
    }
    return files;
}

function sourceKind(path: string): ts.ScriptKind {
    if (path.endsWith('.tsx')) {
        return ts.ScriptKind.TSX;
    }
    if (path.endsWith('.ts')) {
        return ts.ScriptKind.TS;
    }
    return ts.ScriptKind.JS;
}

function emptyFacts(): ModuleFacts {
    return {
        directExports: new Map(),
        stars: [],
        namedImports: [],
        defaultImports: [],
        namespaceImports: [],
        namespaceAccesses: new Map(),
        dynamicImports: [],
        selfUsed: new Set(),
    };
}

function collectFacts(source: SourceFileInfo): ModuleFacts {
    const facts = emptyFacts();
    if (source.kind === 'doc') {
        collectDocImports(source, facts);
        return facts;
    }

    const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.ES2022, true, sourceKind(source.path));
    const declarationNameNodes = new Set<ts.Node>();
    const addDirect = (name: string, alias?: ExportEdge): void => {
        facts.directExports.set(name, { path: source.path, name, alias });
    };
    const addBindingNames = (name: ts.BindingName): void => {
        if (ts.isIdentifier(name)) {
            declarationNameNodes.add(name);
            addDirect(name.text);
            return;
        }
        for (const element of name.elements) {
            if (ts.isBindingElement(element)) {
                addBindingNames(element.name);
            }
        }
    };

    for (const statement of file.statements) {
        collectStatement(statement, facts, declarationNameNodes, addDirect, addBindingNames);
    }
    collectReferences(file, facts, declarationNameNodes);
    return facts;
}

function collectStatement(
    statement: ts.Statement,
    facts: ModuleFacts,
    declarationNameNodes: Set<ts.Node>,
    addDirect: (name: string, alias?: ExportEdge) => void,
    addBindingNames: (name: ts.BindingName) => void,
): void {
    if (ts.isImportDeclaration(statement)) {
        collectImport(statement, facts);
        return;
    }
    if (ts.isExportDeclaration(statement)) {
        collectExportDeclaration(statement, facts, addDirect);
        return;
    }
    if (ts.isExportAssignment(statement)) {
        addDirect('default');
        return;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        return;
    }
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        addDirect('default');
        return;
    }
    if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
            addBindingNames(declaration.name);
        }
        return;
    }
    const name = exportedDeclarationName(statement);
    if (name) {
        declarationNameNodes.add(name);
        addDirect(name.text);
    }
}

function exportedDeclarationName(statement: ts.Statement): ts.Identifier | undefined {
    if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)
    ) {
        return statement.name;
    }
    return undefined;
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
    return node && ts.isStringLiteral(node) ? node.text : undefined;
}

function collectExportDeclaration(
    statement: ts.ExportDeclaration,
    facts: ModuleFacts,
    addDirect: (name: string, alias?: ExportEdge) => void,
): void {
    const sourceText = stringLiteralText(statement.moduleSpecifier);
    const clause = statement.exportClause;
    if (!clause) {
        if (sourceText) {
            facts.stars.push(sourceText);
        }
        return;
    }
    if (ts.isNamespaceExport(clause)) {
        addDirect(clause.name.text, sourceText ? { source: sourceText, sourceName: '*' } : undefined);
        return;
    }
    if (!ts.isNamedExports(clause)) {
        return;
    }
    for (const element of clause.elements) {
        const name = element.name.text;
        const sourceName = element.propertyName?.text ?? name;
        addDirect(name, sourceText ? { source: sourceText, sourceName } : undefined);
    }
}

function collectReferences(file: ts.SourceFile, facts: ModuleFacts, declarationNameNodes: Set<ts.Node>): void {
    const identifierUses = new Map<string, number>();
    const namespaceLocals = new Set(facts.namespaceImports.map((entry) => entry.local));
    const visit = (node: ts.Node): void => {
        if (isReferenceIdentifier(node, declarationNameNodes)) {
            identifierUses.set(node.text, (identifierUses.get(node.text) ?? 0) + 1);
        }
        const namespaceAccess = namespaceAccessName(node, namespaceLocals);
        if (namespaceAccess) {
            const accesses = facts.namespaceAccesses.get(namespaceAccess.namespace) ?? new Set<string>();
            accesses.add(namespaceAccess.name);
            facts.namespaceAccesses.set(namespaceAccess.namespace, accesses);
        }
        const dynamicImport = dynamicImportSpecifier(node);
        if (dynamicImport) {
            facts.dynamicImports.push(dynamicImport);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    for (const name of facts.directExports.keys()) {
        if ((identifierUses.get(name) ?? 0) > 0) {
            facts.selfUsed.add(name);
        }
    }
}

function isReferenceIdentifier(node: ts.Node, declarationNameNodes: Set<ts.Node>): node is ts.Identifier {
    if (!ts.isIdentifier(node) || declarationNameNodes.has(node) || isInsideExportDeclaration(node)) {
        return false;
    }
    const { parent } = node;
    if (!parent) {
        return false;
    }
    if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) {
        return false;
    }
    return !isDeclarationNamePosition(node);
}

function isInsideExportDeclaration(node: ts.Node): boolean {
    for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
        if (ts.isExportDeclaration(current)) {
            return true;
        }
    }
    return false;
}

function isDeclarationNamePosition(node: ts.Identifier): boolean {
    const { parent } = node;
    if (!parent) {
        return true;
    }
    return (
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isEnumMember(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node)
    );
}

function namespaceAccessName(
    node: ts.Node,
    namespaceLocals: Set<string>,
): { namespace: string; name: string } | undefined {
    if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) {
        return undefined;
    }
    if (!namespaceLocals.has(node.expression.text)) {
        return undefined;
    }
    return { namespace: node.expression.text, name: node.name.text };
}

function dynamicImportSpecifier(node: ts.Node): string | undefined {
    if (!ts.isCallExpression(node) || node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
        return undefined;
    }
    if (node.arguments.length !== 1) {
        return undefined;
    }
    const [argument] = node.arguments;
    return argument && ts.isStringLiteral(argument) ? argument.text : undefined;
}

function collectImport(statement: ts.ImportDeclaration, facts: ModuleFacts): void {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        return;
    }
    const { moduleSpecifier } = statement;
    const module = moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) {
        return;
    }
    if (clause.name) {
        facts.defaultImports.push({ module });
    }
    if (!clause.namedBindings) {
        return;
    }
    if (ts.isNamespaceImport(clause.namedBindings)) {
        facts.namespaceImports.push({ local: clause.namedBindings.name.text, module });
        return;
    }
    for (const element of clause.namedBindings.elements) {
        facts.namedImports.push({
            name: (element.propertyName ?? element.name).text,
            module,
        });
    }
}

const DOC_IMPORT =
    /import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;

function collectDocImports(source: SourceFileInfo, facts: ModuleFacts): void {
    for (const match of source.text.matchAll(DOC_IMPORT)) {
        collectDocImport(match, facts);
    }
}

function collectDocImport(match: RegExpMatchArray, facts: ModuleFacts): void {
    const [, defaultName, namespaceName, named, module] = match;
    if (!module) {
        return;
    }
    if (defaultName) {
        facts.defaultImports.push({ module });
    }
    if (namespaceName) {
        facts.namespaceImports.push({ local: namespaceName, module });
    }
    for (const name of docNamedImports(named)) {
        facts.namedImports.push({ name, module });
    }
}

function docNamedImports(named: string | undefined): string[] {
    if (!named) {
        return [];
    }
    const names: string[] = [];
    for (const part of named.split(',')) {
        const cleaned = part.trim().replace(/^type\s+/, '');
        if (!cleaned) {
            continue;
        }
        const [name] = cleaned.split(/\s+as\s+/);
        if (name) {
            names.push(name.trim());
        }
    }
    return names;
}

const factsCache = new Map<string, ModuleFacts>();

function factsFor(path: string): ModuleFacts | undefined {
    const cached = factsCache.get(path);
    if (cached) {
        return cached;
    }
    const source = sourcesByPath.get(path);
    if (!source) {
        return undefined;
    }
    const facts = collectFacts(source);
    factsCache.set(path, facts);
    return facts;
}

function candidatePaths(base: string): string[] {
    return [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.mjs`,
        `${base}.cjs`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
    ];
}

function resolveFile(base: string): string | undefined {
    for (const candidate of candidatePaths(base)) {
        if (sourcesByPath.has(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function resolveModule(importer: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) {
        return resolvePackageModule(specifier);
    }
    const base = posix(relative(REPO_ROOT, resolve(dirname(join(REPO_ROOT, importer)), specifier)));
    const direct = resolveFile(base);
    if (direct) {
        return direct;
    }
    // Source imports commonly spell the emitted .js extension.
    const stripped = base.replace(/\.(js|mjs|cjs)$/, '');
    return stripped === base ? undefined : resolveFile(stripped);
}

function resolvePackageModule(specifier: string): string | undefined {
    for (const [packageName, packageRoot] of packageRoots) {
        if (specifier !== packageName && !specifier.startsWith(`${packageName}/`)) {
            continue;
        }
        const subpath = specifier === packageName ? '' : specifier.slice(packageName.length + 1);
        const sourceBase =
            subpath === '' || subpath === 'tokens'
                ? join(packageRoot, 'src', 'index')
                : join(packageRoot, 'src', subpath);
        const resolved = resolveFile(posix(sourceBase));
        if (resolved) {
            return resolved;
        }
    }
    return undefined;
}

const exportedNamesCache = new Map<string, Set<string>>();

function exportedNames(path: string, visiting = new Set<string>()): Set<string> {
    const cached = exportedNamesCache.get(path);
    if (cached) {
        return cached;
    }
    if (visiting.has(path)) {
        return new Set();
    }
    visiting.add(path);
    const names = new Set<string>();
    const facts = factsFor(path);
    if (facts) {
        for (const name of facts.directExports.keys()) {
            names.add(name);
        }
        addStarExports(path, names, visiting);
    }
    visiting.delete(path);
    exportedNamesCache.set(path, names);
    return names;
}

function addStarExports(path: string, names: Set<string>, visiting: Set<string>): void {
    for (const star of factsFor(path)?.stars ?? []) {
        const target = resolveModule(path, star);
        if (!target) {
            continue;
        }
        for (const name of exportedNames(target, visiting)) {
            if (name !== 'default') {
                names.add(name);
            }
        }
    }
}

const resolvedPairsCache = new Map<string, ExportRecord[]>();

/** Every declaration pair an import of `name` from `path` reaches. */
function resolveExportPairs(path: string, name: string, visiting = new Set<string>()): ExportRecord[] {
    const key = pairKey(path, name);
    const cached = resolvedPairsCache.get(key);
    if (cached) {
        return cached;
    }
    if (visiting.has(key)) {
        return [];
    }
    visiting.add(key);
    const facts = factsFor(path);
    const direct = facts?.directExports.get(name);
    let pairs: ExportRecord[] = [];
    if (direct) {
        pairs = resolveDirectPair(path, direct, visiting);
    } else if (facts) {
        pairs = resolveStarPairs(path, name, visiting);
    }
    visiting.delete(key);
    resolvedPairsCache.set(key, pairs);
    return pairs;
}

function resolveDirectPair(path: string, direct: ExportRecord, visiting: Set<string>): ExportRecord[] {
    const pairs = [direct];
    if (!direct.alias || direct.alias.sourceName === '*') {
        return pairs;
    }
    const target = resolveModule(path, direct.alias.source);
    if (target) {
        pairs.push(...resolveExportPairs(target, direct.alias.sourceName, visiting));
    }
    return pairs;
}

function resolveStarPairs(path: string, name: string, visiting: Set<string>): ExportRecord[] {
    const pairs: ExportRecord[] = [];
    for (const star of factsFor(path)?.stars ?? []) {
        const target = resolveModule(path, star);
        if (target && exportedNames(target).has(name)) {
            pairs.push(...resolveExportPairs(target, name, visiting));
        }
    }
    return pairs;
}

function fail(messages: string[]): never {
    process.stderr.write('check-dead-exports: FAIL\n');
    for (const message of messages) {
        process.stderr.write(`  ${message}\n`);
    }
    process.stderr.write(
        'Exports must have a production caller (see the script header for the reference scope),\n' +
            'be deleted, or be declared in scripts/dead-export-allowlist.json with a reason.\n',
    );
    process.exit(1);
}

function validateAllowlist(): Allowlist {
    const absolute = join(REPO_ROOT, ALLOWLIST_PATH);
    if (!existsSync(absolute)) {
        fail([`${ALLOWLIST_PATH} is missing (expected schema { version: 1, entries: [] }).`]);
    }
    let raw: RawAllowlist;
    try {
        raw = JSON.parse(readFileSync(absolute, 'utf-8')) as RawAllowlist;
    } catch (error) {
        return fail([`${ALLOWLIST_PATH} is not valid JSON: ${String(error)}`]);
    }
    if (raw.version !== 1) {
        fail([`${ALLOWLIST_PATH}: "version" must be 1.`]);
    }
    if (!Array.isArray(raw.entries)) {
        fail([`${ALLOWLIST_PATH}: "entries" must be an array.`]);
    }

    const errors: string[] = [];
    const entries: AllowlistEntry[] = [];
    const seen = new Set<string>();
    raw.entries.forEach((value, index) => {
        const check = validateAllowlistEntry(value, index, seen);
        if (check.error) {
            errors.push(check.error);
        } else if (check.entry) {
            entries.push(check.entry);
        }
    });
    if (errors.length > 0) {
        fail(errors);
    }
    return { entries, barrelCoverage: buildBarrelCoverage(entries) };
}

function validateAllowlistEntry(value: unknown, index: number, seen: Set<string>): AllowlistCheck {
    const entry = value as Partial<AllowlistEntry>;
    const label = `${ALLOWLIST_PATH}: entries[${index}]`;
    if (typeof entry.package !== 'string' || entry.package.trim() === '') {
        return { error: `${label}: "package" must be a non-empty string.` };
    }
    if (typeof entry.file !== 'string' || entry.file.trim() === '') {
        return { error: `${label}: "file" must be a non-empty repo-relative path.` };
    }
    if (typeof entry.symbol !== 'string' || entry.symbol.trim() === '') {
        return { error: `${label}: "symbol" must be a non-empty string ("*" for a whole barrel).` };
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        return { error: `${label}: "reason" must be non-empty — unexplained entries are forbidden.` };
    }
    const file = posix(entry.file.trim());
    if (!existsSync(join(REPO_ROOT, file))) {
        return { error: `${label}: "${file}" does not exist.` };
    }
    const packageMatch = /^packages\/([^/]+)\//.exec(file);
    if (!packageMatch) {
        return { error: `${label}: "${file}" is not under packages/<package>/.` };
    }
    const expectedPackage = `@europa/${packageMatch[1]}`;
    if (entry.package !== expectedPackage) {
        return { error: `${label}: package "${entry.package}" does not own "${file}" (expected ${expectedPackage}).` };
    }
    const key = pairKey(file, entry.symbol);
    if (seen.has(key)) {
        return { error: `${label}: duplicate entry for ${file} :: ${entry.symbol}.` };
    }
    seen.add(key);
    return { entry: { package: entry.package, file, symbol: entry.symbol, reason: entry.reason.trim() } };
}

function buildBarrelCoverage(entries: AllowlistEntry[]): Set<string> {
    const coverage = new Set<string>();
    for (const entry of entries) {
        if (entry.symbol !== '*') {
            continue;
        }
        if (!declaredEntryFiles.get(entry.package)?.has(entry.file)) {
            fail([
                `${ALLOWLIST_PATH}: "${entry.file}" is not a declared ${entry.package} package.json#exports entry point — ` +
                    `"*" is valid only on a declared entry file; give the symbol a per-symbol reason instead.`,
            ]);
        }
        const facts = factsFor(entry.file);
        if (!facts || facts.directExports.size === 0) {
            fail([`${ALLOWLIST_PATH}: stale barrel entry "${entry.file}" — it declares no exports.`]);
        }
        for (const name of exportedNames(entry.file)) {
            for (const pair of resolveExportPairs(entry.file, name)) {
                coverage.add(pairKey(pair.path, pair.name));
            }
        }
    }
    return coverage;
}

const allowlist = validateAllowlist();
const allowlisted = new Set(allowlist.barrelCoverage);
for (const entry of allowlist.entries) {
    if (entry.symbol !== '*') {
        allowlisted.add(pairKey(entry.file, entry.symbol));
    }
}

// Validate non-barrel entries against the audited export set (stale entries
// are fatal: a stale justification is a lie about the current tree).
const auditedExports: ExportRecord[] = [];
for (const source of auditedSources) {
    const facts = factsFor(source.path);
    if (!facts) {
        continue;
    }
    for (const record of facts.directExports.values()) {
        auditedExports.push(record);
    }
}
const audited = new Set(auditedExports.map((record) => pairKey(record.path, record.name)));

const staleEntries = allowlist.entries
    .filter((entry) => entry.symbol !== '*' && !audited.has(pairKey(entry.file, entry.symbol)))
    .map((entry) => `${ALLOWLIST_PATH}: stale entry "${entry.file}" :: "${entry.symbol}" — symbol no longer exists.`);
if (staleEntries.length > 0) {
    fail(staleEntries);
}

const referenced = new Set<string>();
const mark = (records: ExportRecord[]): void => {
    for (const record of records) {
        referenced.add(pairKey(record.path, record.name));
    }
};
const markNameEverywhere = (name: string): void => {
    for (const record of auditedExports) {
        if (record.name === name) {
            referenced.add(pairKey(record.path, record.name));
        }
    }
};
/** Only an unresolved workspace import can name one of our exports. */
const markUnresolved = (module: string, name: string): void => {
    if (module.startsWith('@europa/')) {
        markNameEverywhere(name);
    }
};

for (const source of referenceSources) {
    const facts = factsFor(source.path);
    if (!facts) {
        continue;
    }
    for (const entry of facts.namedImports) {
        const target = resolveModule(source.path, entry.module);
        if (target) {
            mark(resolveExportPairs(target, entry.name));
        } else {
            markUnresolved(entry.module, entry.name);
        }
    }
    for (const entry of facts.defaultImports) {
        const target = resolveModule(source.path, entry.module);
        if (target) {
            mark(resolveExportPairs(target, 'default'));
        } else {
            markUnresolved(entry.module, 'default');
        }
    }
    for (const entry of facts.namespaceImports) {
        const target = resolveModule(source.path, entry.module);
        for (const name of facts.namespaceAccesses.get(entry.local) ?? []) {
            if (target) {
                mark(resolveExportPairs(target, name));
            } else {
                markUnresolved(entry.module, name);
            }
        }
    }
    for (const specifier of facts.dynamicImports) {
        const target = resolveModule(source.path, specifier);
        if (!target) {
            continue;
        }
        for (const name of exportedNames(target)) {
            mark(resolveExportPairs(target, name));
        }
    }
}

const offences = auditedExports
    .filter((record) => {
        const key = pairKey(record.path, record.name);
        return !referenced.has(key) && !factsFor(record.path)?.selfUsed.has(record.name) && !allowlisted.has(key);
    })
    .sort((left, right) =>
        left.path === right.path ? left.name.localeCompare(right.name) : left.path.localeCompare(right.path),
    );

if (offences.length > 0) {
    fail(offences.map((record) => `${record.path}: "${record.name}" has no production reference.`));
}

const referencedAudited = auditedExports.filter((record) => referenced.has(pairKey(record.path, record.name))).length;
const selfUsedAudited = auditedExports.filter((record) => {
    const key = pairKey(record.path, record.name);
    return !referenced.has(key) && factsFor(record.path)?.selfUsed.has(record.name);
}).length;
const allowlistedOnly = auditedExports.length - referencedAudited - selfUsedAudited;

process.stdout.write(
    `check-dead-exports: OK — ${auditedExports.length} audited exports across ${new Set(auditedExports.map((record) => record.path)).size} modules; ` +
        `${referencedAudited} referenced across files, ${selfUsedAudited} used in their declaring file, ${allowlistedOnly} allowlisted, 0 dead.\n`,
);
