// The Create Instance body's schema payload, read from the built node (`npm run build` first).
// node:test and node:assert only, so the package gains no dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { instanceSchemaBody, JSON_SCHEMA_DEPRECATION } = require('../dist/nodes/Xmemory/instanceSchema.js');

const XMD_AS_JSON = JSON.stringify({
	objects: { Ticket: { fields: { code: { type: 'str', required: true } }, primary_key: ['code'] } },
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

test('XMD written as JSON is sent as yml, as the parsed object, with no warning', () => {
	assert.deepEqual(body('json', XMD_AS_JSON), {
		schema: { yml: { value: JSON.parse(XMD_AS_JSON) } },
		warnings: [],
	});
});

test('XMD written as JSON reaches the schema with every value as JSON gave it', () => {
	// A float JSON writes with an exponent, and strings holding characters a YAML reader folds or refuses.
	const text =
		'{"objects": {"Gauge": {"fields": {"reading": {"type": "float", "default": 1e-7}, ' +
		'"note": {"type": "str", "default": "a\u0085b\u007fc"}}, "primary_key": ["note"]}}}';
	const fields = body('json', text).schema.yml.value.objects.Gauge.fields;
	assert.equal(fields.reading.default, 1e-7);
	assert.equal(fields.note.default, 'a\u0085b\u007fc');
});

test('a JSON Schema using objects as an annotation of its own keeps json_schema and warns once', () => {
	for (const document of [
		{ type: 'object', properties: { code: { type: 'string' } }, objects: { source: 'CRM' } },
		{ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', objects: {} },
		{ $defs: { code: { type: 'string' } }, objects: { source: 'CRM' } },
	]) {
		const text = JSON.stringify(document);
		assert.deepEqual(
			body('json', text),
			{ schema: { json_schema: { value: text } }, warnings: [JSON_SCHEMA_DEPRECATION] },
			text,
		);
	}
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
