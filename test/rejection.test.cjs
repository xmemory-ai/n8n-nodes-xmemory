// A rejected or warned write's details, read from the built node (`npm run build` first).
// node:test and node:assert only, so the package gains no dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rejectionDetails, warningMessages } = require('../dist/nodes/Xmemory/rejection.js');

// Example details only: the node passes on whatever object the API sends.
const REJECTION = { summary: 'Example details.', items: [{ field: 'stage', note: 'example' }] };

test('a rejection is passed on as the API sent it', () => {
	const error = { code: 'VALIDATION_ERROR', message: 'Rejected.', details: { rejection: REJECTION } };
	assert.deepEqual(rejectionDetails(error), REJECTION);
});

test('an error without a rejection gives none', () => {
	for (const error of [undefined, {}, { details: {} }, { details: { rejection: null } }, { details: { rejection: [] } }]) {
		assert.equal(rejectionDetails(error), undefined, JSON.stringify(error));
	}
});

test("a stored write's warnings give their messages, in order", () => {
	const warnings = [
		{ code: 'EXAMPLE_WARNING', message: 'First.', details: { rejection: REJECTION } },
		{ code: 'EXAMPLE_WARNING', message: 'Second.' },
		{ code: 'EXAMPLE_WARNING' },
	];
	assert.deepEqual(warningMessages(warnings), ['First.', 'Second.']);
});

test('no warnings, or a malformed list, give no messages', () => {
	for (const warnings of [undefined, null, [], {}, 'warning']) {
		assert.deepEqual(warningMessages(warnings), [], JSON.stringify(warnings));
	}
});
