// The built node run end to end, its HTTP transport stubbed (`npm run build` first).
// node:test and node:assert only, so the package gains no dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// n8n-workflow loads isolated-vm, a native module without a build for every Node a contributor runs, for its
// expression sandbox. These runs evaluate no expression, so a stand-in keeps the tests runnable on any Node.
const isolatedVm = require.resolve('isolated-vm');
const standIn = new Module(isolatedVm);
standIn.filename = isolatedVm;
standIn.loaded = true;
standIn.exports = {};
require.cache[isolatedVm] = standIn;

const { NodeApiError } = require('n8n-workflow');
const { Xmemory } = require('../dist/nodes/Xmemory/Xmemory.node.js');
const { JSON_SCHEMA_DEPRECATION } = require('../dist/nodes/Xmemory/instanceSchema.js');

const NODE = { id: 'n1', name: 'Xmemory', type: 'n8n-nodes-xmemory.xmemory', typeVersion: 1, position: [0, 0], parameters: {} };
// Example details only: the node passes on whatever object the API sends.
const REJECTION = { summary: 'Example details.', items: [{ field: 'stage', note: 'example' }] };
const REFUSED = { code: 'VALIDATION_ERROR', message: 'Rejected.', details: { rejection: REJECTION } };

// A run of the node over `items` items: `params` are its parameters, `answer` what the transport does with each
// request, given the request and its item's index.
async function run(params, answer, { continueOnFail = false, items = 1 } = {}) {
	const requests = [];
	const hints = [];
	const ctx = {
		getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
		getNodeParameter: (name, _item, fallback) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ baseUrl: 'https://api.example.test/' }),
		getNode: () => NODE,
		continueOnFail: () => continueOnFail,
		addExecutionHints: (...added) => hints.push(...added.map((hint) => hint.message)),
		helpers: {
			httpRequestWithAuthentication: async function (_credentials, options) {
				requests.push(options);
				return answer(options, requests.length - 1);
			},
		},
	};
	let output;
	let thrown;
	try {
		output = await new Xmemory().execute.call(ctx);
	} catch (error) {
		thrown = error;
	}
	return { output, thrown, requests, hints };
}

// The HTTP helper's own error for an HTTP 400 answer: a NodeApiError holding the answer's body.
function refusedOverHttp(body) {
	const error = new NodeApiError(
		NODE,
		{ message: 'Request failed with status code 400', httpCode: '400' },
		{ httpCode: '400' },
	);
	error.context.data = body;
	return error;
}

const WRITE = { operation: 'write', instanceId: 'i1', text: 'A teal gadget.', extractionLogic: 'fast', traceId: '' };

test('a write refused over HTTP throws the legible message with the rejection, on the same error', async () => {
	// The second item's write is refused: the error the node throws is the HTTP helper's own, of that item.
	let refused;
	const { thrown } = await run(
		WRITE,
		(_options, index) => {
			if (index === 0) {
				return { items: [{ write_id: 'w1' }] };
			}
			refused = refusedOverHttp({ errors: [REFUSED] });
			throw refused;
		},
		{ items: 2 },
	);
	assert.equal(thrown, refused);
	assert.equal(thrown.httpCode, '400');
	assert.match(thrown.message, /Rejected\./);
	assert.equal(thrown.description, JSON.stringify(REJECTION, null, 2));
	assert.equal(thrown.context.itemIndex, 1);
});

test('a write refused inside a 200 envelope stops with the legible message and the whole rejection', async () => {
	const { thrown } = await run(WRITE, () => ({ errors: [REFUSED] }));
	assert.match(thrown.message, /Rejected\./);
	assert.equal(thrown.description, JSON.stringify(REJECTION, null, 2));
});

test('Continue On Fail keeps the rejection of a write refused inside a 200 envelope', async () => {
	const { output } = await run(WRITE, () => ({ errors: [REFUSED] }), { continueOnFail: true });
	const [[item]] = output;
	assert.equal(item.json.status, 'error');
	assert.deepEqual(item.json.rejection, REJECTION);
});

test('Continue On Fail keeps the rejection of a write refused over HTTP', async () => {
	const { output } = await run(
		WRITE,
		() => {
			throw refusedOverHttp({ errors: [REFUSED] });
		},
		{ continueOnFail: true },
	);
	assert.deepEqual(output[0][0].json.rejection, REJECTION);
});

for (const choice of ['fast', 'deep']) {
	test(`a write whose saved Extraction Logic is ${choice} sends deep extraction`, async () => {
		const { requests, thrown, output } = await run({ ...WRITE, extractionLogic: choice }, () => ({
			items: [{ write_id: 'w1' }],
		}));
		assert.equal(requests.length, 1);
		assert.equal(requests[0].body.extraction_logic, 'deep');
		// The write succeeds: nothing thrown once its request is sent, and its id in the output.
		assert.equal(thrown, undefined);
		assert.equal(output[0][0].json.write_id, 'w1');
	});
}

test("a stored write's warnings become hints, each in its order, beside the write's output", async () => {
	const { hints, output, thrown } = await run(WRITE, () => ({
		items: [{ write_id: 'w1' }],
		warnings: [
			{ code: 'EXAMPLE_WARNING', message: 'A first note on the write.' },
			{ code: 'EXAMPLE_WARNING', message: 'A second note on the write.' },
		],
	}));
	assert.deepEqual(hints, ['A first note on the write.', 'A second note on the write.']);
	assert.equal(thrown, undefined);
	assert.deepEqual(output, [[{ json: { write_id: 'w1' }, pairedItem: { item: 0 } }]]);
});

const CREATE = { operation: 'create_instance', clusterId: 'c1', instanceName: 'Tickets', schemaFormat: 'json' };

test('Create Instance sends XMD written as JSON as the parsed object', async () => {
	const schema = { objects: { Ticket: { fields: { code: { type: 'str', required: true } }, primary_key: ['code'] } } };
	const { requests, hints, thrown, output } = await run({ ...CREATE, schemaText: JSON.stringify(schema) }, () => ({
		items: [{ id: 'inst-1' }],
	}));
	assert.deepEqual(JSON.parse(requests[0].body).instance_schema, { yml: { value: schema } });
	assert.equal(requests[0].headers['Content-Type'], 'application/json');
	assert.deepEqual(hints, []);
	assert.equal(thrown, undefined);
	assert.equal(output[0][0].json.id, 'inst-1');
});

test('Create Instance sends each number of XMD written as JSON by its own token', async () => {
	const text =
		'{"objects": {"Gauge": {"fields": {"weight": {"type": "float", "default": 1.0}, ' +
		'"serial": {"type": "int", "default": 9007199254740993}}, "primary_key": ["serial"]}}}';
	const { requests, thrown, output } = await run({ ...CREATE, schemaText: text }, () => ({ items: [{ id: 'inst-1' }] }));
	assert.ok(requests[0].body.includes('"weight": {"type": "float", "default": 1.0}'), requests[0].body);
	assert.ok(requests[0].body.includes('"default": 9007199254740993}'), requests[0].body);
	assert.equal(thrown, undefined);
	assert.equal(output[0][0].json.id, 'inst-1');
});

test("Create Instance's deprecation hint reaches the error when the API refuses the schema", async () => {
	const legacy = JSON.stringify({ type: 'object', properties: { code: { type: 'string' } } });
	const { thrown, hints } = await run({ ...CREATE, schemaText: legacy }, () => {
		throw refusedOverHttp({ errors: [{ code: 'INVALID_INPUT', message: 'The schema is not valid.' }] });
	});
	assert.equal(hints.length, 1);
	assert.ok(thrown.description.includes(hints[0]), thrown.description);
});

test("Create Instance's deprecation hint reaches the item Continue On Fail emits when the API refuses the schema", async () => {
	const legacy = JSON.stringify({ type: 'object', properties: { code: { type: 'string' } } });
	const { output } = await run(
		{ ...CREATE, schemaText: legacy },
		() => {
			throw refusedOverHttp({ errors: [{ code: 'INVALID_INPUT', message: 'The schema is not valid.' }] });
		},
		{ continueOnFail: true },
	);
	assert.deepEqual(output[0][0].json.hints, [JSON_SCHEMA_DEPRECATION]);
});
