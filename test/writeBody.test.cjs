// The extraction setting a write sends, read from the built node (`npm run build` first).
// node:test and node:assert only, so the package gains no dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractionLogicField } = require('../dist/nodes/Xmemory/writeBody.js');

test('every write sends deep extraction, so an API that runs Fast for a write sending none still runs Deep', () => {
	assert.deepEqual(extractionLogicField(), { extraction_logic: 'deep' });
});
