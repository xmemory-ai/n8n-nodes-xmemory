#!/usr/bin/env node
// Pre-submission validation for the n8n community node.
//
// Catches the classes of issue the n8n verification reviewer flags that
// `n8n-node lint` does NOT cover (the codex *.node.json file is not a lint
// target, and no bundled rule inspects error wrapping):
//   - codex `node` identifier format:  <package-name>.<nodeName>
//   - codex `categories` outside n8n's allowed set (silently dropped by the UI)
//   - package.json n8n.{nodes,credentials} paths with no matching source file
//   - HTTP/API errors wrapped in NodeOperationError instead of NodeApiError
//
// Run: `npm run check:codex` (also wired into CI, before lint/build).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// n8n Cloud's allowed codex categories. Unrecognised values are silently
// dropped by the UI. Keep in sync with n8n's "Node codex files" docs.
const ALLOWED_CATEGORIES = new Set([
	'Data & Storage',
	'Finance & Accounting',
	'Marketing & Content',
	'Productivity',
	'Miscellaneous',
	'Sales',
	'Development',
	'Analytics',
	'Communication',
	'Utility',
]);

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p);

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const pkgName = pkg.name;
const n8n = pkg.n8n ?? {};

// Map a built dist JS path (as declared in package.json.n8n) back to its
// TypeScript source: `dist/nodes/X/Y.node.js` -> `nodes/X/Y.node.ts`.
const distToSrc = (p) => p.replace(/^dist\//, '').replace(/\.js$/, '.ts');

// --- credentials: every declared path must map to a real source file ---
for (const credDist of n8n.credentials ?? []) {
	const src = distToSrc(credDist);
	if (!existsSync(join(ROOT, src))) {
		fail(`package.json n8n.credentials → "${credDist}" has no source file at ${src}`);
	}
}

// --- nodes: source exists; codex file exists and is valid ---
for (const nodeDist of n8n.nodes ?? []) {
	const src = distToSrc(nodeDist); // nodes/Xmemory/Xmemory.node.ts
	const srcPath = join(ROOT, src);
	if (!existsSync(srcPath)) {
		fail(`package.json n8n.nodes → "${nodeDist}" has no source file at ${src}`);
		continue;
	}

	const nodeSrc = readFileSync(srcPath, 'utf8');

	// The node's registered name is the `name` field that sits next to
	// `displayName` at the top of the INodeTypeDescription. The codex `node`
	// identifier must be `<package-name>.<name>` (n8n lowercases the first
	// letter, and the convention is for `name` to already be lowercase-first).
	// Scope the search to the description object so we don't match a property
	// field's `displayName`/`name` pair (e.g. the "operation" selector).
	const descMatch = nodeSrc.match(/description:\s*INodeTypeDescription\s*=\s*\{/);
	const descScope = descMatch ? nodeSrc.slice(descMatch.index) : nodeSrc;
	const nameMatch = descScope.match(
		/displayName:\s*['"][^'"]+['"]\s*,\s*name:\s*['"]([^'"]+)['"]/,
	);
	const nodeName = nameMatch?.[1];
	if (!nodeName) {
		warn(`${src}: could not locate the node's \`name\` field; skipping codex "node" check`);
	}

	// The codex file lives next to the source: X.node.ts -> X.node.json
	const codexPath = srcPath.replace(/\.ts$/, '.json');
	if (!existsSync(codexPath)) {
		fail(`${src}: missing codex file ${basename(codexPath)} next to the node`);
		continue;
	}

	let codex;
	try {
		codex = JSON.parse(readFileSync(codexPath, 'utf8'));
	} catch (e) {
		fail(`${rel(codexPath)}: invalid JSON — ${e.message}`);
		continue;
	}

	if (nodeName) {
		const expected = `${pkgName}.${nodeName}`;
		if (codex.node !== expected) {
			fail(
				`${rel(codexPath)}: "node" is "${codex.node}"; expected fully-qualified "${expected}"`,
			);
		}
	}

	for (const cat of codex.categories ?? []) {
		if (!ALLOWED_CATEGORIES.has(cat)) {
			fail(
				`${rel(codexPath)}: category "${cat}" is not allowed ` +
					`(allowed: ${[...ALLOWED_CATEGORIES].join(', ')})`,
			);
		}
	}
}

// --- HTTP/API errors should use NodeApiError, not NodeOperationError ---
// Heuristic: a NodeOperationError whose message argument is a caught error
// object (bare `error`/`err`/`e`, optionally `... as Error|JsonObject`) is
// almost certainly wrapping an HTTP failure, which drops the status code and
// response body from n8n's error UI. Genuine config errors pass a string
// message and are left alone. Opt a specific call out with a trailing
// `// codex-check: allow-node-operation-error` comment (same or previous line).
function walkTs(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) out.push(...walkTs(p));
		else if (p.endsWith('.ts')) out.push(p);
	}
	return out;
}

// Extract top-level argument strings of a call, given the index of its '('.
function topLevelArgs(src, openParenIdx) {
	let depth = 0;
	let start = openParenIdx + 1;
	const args = [];
	for (let i = openParenIdx; i < src.length; i++) {
		const c = src[i];
		if (c === '(' || c === '[' || c === '{') depth++;
		else if (c === ')' || c === ']' || c === '}') {
			depth--;
			if (depth === 0) {
				args.push(src.slice(start, i));
				break;
			}
		} else if (c === ',' && depth === 1) {
			args.push(src.slice(start, i));
			start = i + 1;
		}
	}
	return args.map((a) => a.trim());
}

for (const dir of ['nodes', 'credentials']) {
	const abs = join(ROOT, dir);
	if (!existsSync(abs)) continue;
	for (const file of walkTs(abs)) {
		const src = readFileSync(file, 'utf8');
		const lines = src.split('\n');
		const re = /new\s+NodeOperationError\s*\(/g;
		let m;
		while ((m = re.exec(src))) {
			const openParen = src.indexOf('(', m.index);
			const msgArg = topLevelArgs(src, openParen)[1] ?? '';
			const wrapsError =
				/^(error|err|e)\b/.test(msgArg) || /\b(error|err|e)\s+as\s+\w/.test(msgArg);
			if (!wrapsError) continue;

			const lineIdx = src.slice(0, m.index).split('\n').length - 1; // 0-based
			const near = `${lines[lineIdx] ?? ''}\n${lines[lineIdx - 1] ?? ''}`;
			if (near.includes('codex-check: allow-node-operation-error')) continue;

			fail(
				`${rel(file)}:${lineIdx + 1}: NodeOperationError wraps a caught error ("${msgArg}") — ` +
					`use NodeApiError so the HTTP status/body reach n8n's error UI ` +
					`(or add "// codex-check: allow-node-operation-error" if this is not an HTTP error)`,
			);
		}
	}
}

// --- report ---
for (const w of warnings) console.warn(`⚠︎  ${w}`);
if (errors.length > 0) {
	for (const e of errors) console.error(`✖  ${e}`);
	console.error(`\ncodex check failed with ${errors.length} error(s).`);
	process.exit(1);
}
console.log('✓  codex check passed');
