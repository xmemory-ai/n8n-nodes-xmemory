#!/usr/bin/env node
// Post-build check on the X-Xmemory-Client header this package's credentials send.
//
// The API attributes traffic by the leading token of that header, matched
// against a fixed list on the API side. If it drifts, this node's traffic is
// silently counted as unknown — nothing else here fails, because the header is
// still syntactically valid and every request still succeeds.
//
// This reads the header off the BUILT, constructed credential rather than
// pattern-matching the TypeScript source, so it sees the declared header a
// refactor would actually change: one moved out of `headers`, overwritten by a
// later key or a spread, declared twice under two spellings, or built from a
// shadowed import all show up, while any refactor that preserves the declared
// value passes untouched. It stops one layer above the socket -- n8n applies
// the `authenticate` block from its own runtime packages, which this repo does
// not depend on -- so it says nothing about the header arriving.
// CLIENT-HEADER-VERIFY.md is what establishes that.
//
// Not finding a credential to check is an error rather than a skip — a check
// that silently verifies nothing reports the same success as one that verified
// everything.
//
// It also owns this package's publish policy -- the `files` array and the version shape a release
// needs. Those two read the source `package.json` rather than the built credential, because they are
// about what `npm publish` will ship rather than about what a request carries; they live here because
// they fail a release, on the same run, in the same place. A failure here may therefore name a
// directory rather than a header.
//
// Run: `npm run build` (wired as its postbuild step).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// Three components, at most three digits each, no leading zeros; a prerelease
// or build suffix is fine because the API reads only the leading
// major.minor.patch. Leading zeros matter more than they look: npm normalizes
// `0.09.0` to `0.9.0` in the published manifest while the built header keeps
// the literal it was given, and nothing else would notice the two disagreeing.
const VERSION_SHAPE = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){2}(?:[-+][0-9A-Za-z.+-]+)?$/;

// Exact equality: no version of n8n or axios read at the time of writing claims
// this header name, so nothing should be merging into or overwriting what this
// package declares. Neither is pinned here, and the runbook is what confirms it
// on the wire.
const EXPECTED = `n8n-nodes-xmemory/${pkg.version} (n8n)`;
const HEADER = 'X-Xmemory-Client';

// What is wrong with a credential's header block, or `null` when nothing is.
//
// Header names are case-insensitive on the wire, so keys are matched that way rather than by the
// spelling this package happens to use. More than one match is rejected instead of resolved: HTTP
// stacks disagree about which copy wins — axios keeps the last assignment, a WHATWG `Headers` joins
// them, and the API's own lookup takes the first — so a credential carrying two spellings sends
// something no reader here can predict. Picking a winner would make this check agree with one stack
// and quietly disagree with the others.
//
// A separate function from the scan so the cases below can exercise it directly. The scan needs a
// built credential to have anything to look at, which means every outcome here would otherwise be
// reachable only by hand-editing a credential and rebuilding.
function headerProblem(headers) {
	const keys = Object.keys(headers).filter((h) => h.toLowerCase() === HEADER.toLowerCase());
	if (keys.length === 0) {
		return `sends no ${HEADER}, so its requests reach the API unattributed`;
	}
	if (keys.length > 1) {
		return (
			`declares ${HEADER} ${keys.length} times (${keys.join(', ')}); ` +
			`which one reaches the API depends on the HTTP stack, so exactly one is required`
		);
	}
	if (String(headers[keys[0]]) !== EXPECTED) {
		return `sends ${HEADER} "${headers[keys[0]]}"; expected "${EXPECTED}"`;
	}
	return null;
}

// The built subdirectories that must be published, and why naming `dist` instead is not a shortcut.
//
// `dist/package.json` is the one whose absence is silent and unrecoverable: the built credential does
// `require('../package.json')`, which resolves to it, so dropping it publishes a node that fails to load
// on install -- with a green build, and an npm version that cannot be taken back.
const REQUIRED_FILES = ['dist/credentials', 'dist/nodes', 'dist/package.json'];

// What is wrong with a `files` array, as a list; empty when nothing is.
//
// Both directions are checked. Naming `dist` wholesale ships whatever the build swept into it --
// `n8n-node build` copies non-code assets from the package root with an ignore list that does not match
// nested `node_modules`, and `prepack` rebuilds on `npm pack`, so a scratch directory reaches the
// published tarball rather than only the local one. Dropping an entry is the quieter failure and gets
// the same treatment.
function filesProblems(files) {
	const normalized = files.map((entry) => String(entry).replace(/\/+$/, ''));
	const problems = [];
	if (normalized.includes('dist')) {
		problems.push(
			'package.json files names "dist" wholesale, which publishes whatever the build swept into it; ' +
				'name the built subdirectories instead (see AGENTS.md)',
		);
	}
	for (const required of REQUIRED_FILES) {
		if (!normalized.includes(required)) {
			problems.push(
				`package.json files is missing "${required}"; the built credential resolves ` +
					`../package.json to dist/package.json and the node fails to load on install without it`,
			);
		}
	}
	return problems;
}

// What is wrong with the package version, or `null` when nothing is.
function versionProblem(version) {
	if (VERSION_SHAPE.test(version)) return null;
	return (
		`package.json version "${version}" cannot be read by the API's version parser; ` +
		`it needs three components of at most three digits each, without leading zeros`
	);
}

// Every outcome of the matcher, checked before it is trusted on the real credential. Without this the
// duplicate-rejection branch can be deleted with `lint`, `build` and `check:codex` all still green,
// because this package declares no test script and the real credential only ever exercises one path.
const SELF_TEST = [
	['the expected header alone', { [HEADER]: EXPECTED }, null],
	['other headers alongside it', { Authorization: 'Bearer x', [HEADER]: EXPECTED }, null],
	['no header at all', { Authorization: 'Bearer x' }, /sends no /],
	['a lower-cased spelling on its own', { 'x-xmemory-client': EXPECTED }, null],
	[
		'two spellings of the same name',
		{ [HEADER]: EXPECTED, 'x-xmemory-client': 'other/1.0' },
		/declares .* 2 times/,
	],
	['the right name, the wrong value', { [HEADER]: 'other/1.0' }, /expected /],
	['a non-string value', { [HEADER]: 42 }, /expected /],
	['an empty block', {}, /sends no /],
];

for (const [label, headers, expected] of SELF_TEST) {
	const got = headerProblem(headers);
	const ok = expected === null ? got === null : got !== null && expected.test(got);
	if (!ok) {
		console.error(
			`✖  self-test: ${label} — expected ${expected ?? 'no problem'}, got ${got ?? 'no problem'}`,
		);
		process.exit(1);
	}
}

// The same treatment for the two packaging rules. Without these, deleting either branch -- or loosening
// VERSION_SHAPE -- leaves `build`, `lint` and `check:codex` all green, because the only input they ever
// see on the real path is this repo's own package.json, which satisfies both.
const VERSION_SELF_TEST = [
	['the current shape', '0.9.0', null],
	['a prerelease suffix', '0.9.0-rc.1', null],
	['a two-component version', '0.9', /cannot be read/],
	['a fourth component', '0.9.0.1', /cannot be read/],
	['a leading zero', '01.0.0', /cannot be read/],
	['four digits in a component', '1000.0.0', /cannot be read/],
	['not a version at all', 'latest', /cannot be read/],
];

for (const [label, version, expected] of VERSION_SELF_TEST) {
	const got = versionProblem(version);
	const ok = expected === null ? got === null : got !== null && expected.test(got);
	if (!ok) {
		console.error(
			`✖  self-test: version ${label} — expected ${expected ?? 'no problem'}, got ${got ?? 'no problem'}`,
		);
		process.exit(1);
	}
}

const FILES_SELF_TEST = [
	['the enumerated subdirectories', ['dist/credentials', 'dist/nodes', 'dist/package.json'], 0],
	['trailing slashes on each', ['dist/credentials/', 'dist/nodes/', 'dist/package.json'], 0],
	['dist wholesale', ['dist'], 4],
	['dist wholesale with a trailing slash', ['dist/'], 4],
	['dist/package.json dropped', ['dist/credentials', 'dist/nodes'], 1],
	['dist/credentials dropped', ['dist/nodes', 'dist/package.json'], 1],
	['an empty list', [], 3],
];

for (const [label, files, expectedCount] of FILES_SELF_TEST) {
	const got = filesProblems(files);
	if (got.length !== expectedCount) {
		console.error(
			`✖  self-test: files ${label} — expected ${expectedCount} problem(s), got ${got.length}`,
		);
		process.exit(1);
	}
}

// An n8n credential class always carries these; anything else the module
// exports (a helper, a constant) is not something to check.
const isCredential = (o) => typeof o?.name === 'string' && Array.isArray(o?.properties);

const errors = [];

const badVersion = versionProblem(pkg.version);
if (badVersion) {
	errors.push(badVersion);
}

errors.push(...filesProblems(pkg.files ?? []));

const credentialPaths = pkg.n8n?.credentials ?? [];
if (credentialPaths.length === 0) {
	errors.push('package.json declares no n8n.credentials, so nothing carries the header');
}

for (const credPath of credentialPaths) {
	let exported;
	try {
		exported = await import(pathToFileURL(join(ROOT, credPath)).href);
	} catch (error) {
		errors.push(`${credPath}: could not be loaded — ${error.message}`);
		continue;
	}

	let examined = 0;

	for (const [name, exportedValue] of Object.entries(exported)) {
		if (typeof exportedValue !== 'function') continue;

		let credential;
		try {
			credential = new exportedValue();
		} catch {
			continue; // a plain function or arrow export, not a credential
		}
		if (!isCredential(credential)) continue;

		examined++;
		const where = `${credPath} (${name})`;
		const { authenticate } = credential;

		if (authenticate === undefined) {
			errors.push(`${where}: has no authenticate block, so its requests carry no ${HEADER}`);
			continue;
		}
		if (typeof authenticate === 'function') {
			errors.push(
				`${where}: builds its authenticate block in a function, whose headers this check ` +
					`cannot read — assert the ${HEADER} inside that function instead`,
			);
			continue;
		}

		const problem = headerProblem(authenticate.properties?.headers ?? {});
		if (problem) errors.push(`${where}: ${problem}`);
	}

	if (examined === 0) {
		errors.push(`${credPath}: exports no credential class, so nothing here verified its ${HEADER}`);
	}
}

if (errors.length > 0) {
	for (const e of errors) console.error(`✖  ${e}`);
	console.error(`\nclient-header check failed with ${errors.length} error(s).`);
	process.exit(1);
}
console.log('✓  client-header check passed');
