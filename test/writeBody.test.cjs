// The extraction setting a write sends, read from the built node (`npm run build` first).
// node:test and node:assert only, so the package gains no dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractionLogicField } = require('../dist/nodes/Xmemory/writeBody.js');

test('Fast sends no extraction setting, so the write uses the API default', () => {
	assert.deepEqual(extractionLogicField('fast'), {});
});

test('Deep is sent as given', () => {
	assert.deepEqual(extractionLogicField('deep'), { extraction_logic: 'deep' });
});
