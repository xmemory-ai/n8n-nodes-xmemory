// The Create Instance body's schema payload, read from the built node (`npm run build` first).
// node:test and node:assert only, so the package gains no dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { instanceSchemaBody, JSON_SCHEMA_DEPRECATION } = require('../dist/nodes/Xmemory/instanceSchema.js');

const XMD_AS_JSON = JSON.stringify({
	objects: { Ticket: { fields: { code: { type: 'str', primary_key: true } } } },
});
const JSON_SCHEMA = JSON.stringify({
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: { code: { type: 'string' } },
});

function body(format, text) {
	const warnings = [];
	const schema = instanceSchemaBody(format, text, (message) => warnings.push(message));
	return { schema, warnings };
}

test('XMD written as JSON is sent as yml, with no warning', () => {
	assert.deepEqual(body('json', XMD_AS_JSON), { schema: { yml: { value: XMD_AS_JSON } }, warnings: [] });
});

test('a JSON Schema keeps json_schema and warns once', () => {
	assert.deepEqual(body('json', JSON_SCHEMA), {
		schema: { json_schema: { value: JSON_SCHEMA } },
		warnings: [JSON_SCHEMA_DEPRECATION],
	});
	assert.equal(
		JSON_SCHEMA_DEPRECATION,
		'JSON Schema input is deprecated: send an XMD schema (Schema Format: YAML) instead.',
	);
});

test('text that does not parse as JSON keeps json_schema and warns once', () => {
	const text = 'objects:\n  Ticket: {}\n';
	assert.deepEqual(body('json', text), {
		schema: { json_schema: { value: text } },
		warnings: [JSON_SCHEMA_DEPRECATION],
	});
});

test('JSON whose top level is not an object with its own objects key is not XMD', () => {
	for (const text of ['[{"objects": {}}]', 'null', '"objects"', '{"definitions": {"objects": {}}}']) {
		assert.deepEqual(body('json', text).schema, { json_schema: { value: text } }, text);
	}
});

test('YAML is sent as yml unchanged, whatever it holds', () => {
	for (const text of ['objects:\n  Ticket: {}\n', JSON_SCHEMA]) {
		assert.deepEqual(body('yml', text), { schema: { yml: { value: text } }, warnings: [] }, text);
	}
});
