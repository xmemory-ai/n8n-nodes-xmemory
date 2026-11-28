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

// A JSON Schema's composition keywords, each beside object types shaped as XMD's: the keyword decides.
const COMPOSITION = {
	allOf: [{ type: 'object' }],
	anyOf: [{ type: 'object' }],
	oneOf: [{ type: 'object' }],
	not: { type: 'array' },
	$ref: '#/$defs/ticket',
	if: { required: ['code'] },
	then: { required: ['code'] },
	else: { required: ['code'] },
};
const XMD_OBJECTS = JSON.parse(XMD_AS_JSON).objects;

test('a JSON Schema using objects as an annotation of its own keeps json_schema and warns once', () => {
	for (const document of [
		{ type: 'object', properties: { code: { type: 'string' } }, objects: { source: 'CRM' } },
		{ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', objects: {} },
		{ $defs: { code: { type: 'string' } }, objects: { source: 'CRM' } },
		...Object.entries(COMPOSITION).map(([keyword, value]) => ({ [keyword]: value, objects: XMD_OBJECTS })),
		{ objects: { source: 'CRM' } },
		{ objects: { Ticket: { code: 'an object without fields' } } },
		{ objects: {} },
	]) {
		const text = JSON.stringify(document);
		assert.deepEqual(
			body('json', text),
			{ schema: { json_schema: { value: text } }, warnings: [JSON_SCHEMA_DEPRECATION] },
			text,
		);
	}
});

test('XMD signed by its xmd_version, or by one object type with fields, is sent as yml with no warning', () => {
	// An object still missing its `fields` gets XMD's own error for that object, not the JSON Schema converter's.
	for (const document of [
		{ xmd_version: 'v1', objects: {} },
		{ objects: { ...XMD_OBJECTS, Queue: { description: 'Fields to come.' } } },
	]) {
		assert.deepEqual(body('json', JSON.stringify(document)), { schema: { yml: { value: document } }, warnings: [] });
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
