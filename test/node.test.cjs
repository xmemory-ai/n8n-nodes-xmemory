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

const NODE = { id: 'n1', name: 'Xmemory', type: 'n8n-nodes-xmemory.xmemory', typeVersion: 1, position: [0, 0], parameters: {} };
// Example details only: the node passes on whatever object the API sends.
const REJECTION = { summary: 'Example details.', items: [{ field: 'stage', note: 'example' }] };
const REFUSED = { code: 'VALIDATION_ERROR', message: 'Rejected.', details: { rejection: REJECTION } };

// A run of the node over one item: `params` are its parameters, `answer` what the transport does with the request.
async function run(params, answer, { continueOnFail = false } = {}) {
	const requests = [];
	const hints = [];
	const ctx = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _item, fallback) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ baseUrl: 'https://api.example.test/' }),
		getNode: () => NODE,
		continueOnFail: () => continueOnFail,
		addExecutionHints: (...added) => hints.push(...added.map((hint) => hint.message)),
		helpers: {
			httpRequestWithAuthentication: async function (_credentials, options) {
				requests.push(options);
				return answer(options);
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
	const error = new NodeApiError(NODE, { message: 'Request failed with status code 400', httpCode: '400' });
	error.context.data = body;
	return error;
}

const WRITE = { operation: 'write', instanceId: 'i1', text: 'A teal gadget.', extractionLogic: 'fast', traceId: '' };

test('a write refused over HTTP throws the legible message with the rejection, on the same error', async () => {
	const { thrown } = await run(WRITE, () => {
		throw refusedOverHttp({ errors: [REFUSED] });
	});
	assert.ok(thrown instanceof NodeApiError);
	assert.match(thrown.message, /Rejected\./);
	assert.match(thrown.description, /Example details\./);
	assert.equal(thrown.context.itemIndex, 0);
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

test('a Fast write sends no extraction setting', async () => {
	const { requests } = await run(WRITE, () => ({ items: [{ write_id: 'w1' }] }));
	assert.equal(requests.length, 1);
	assert.equal('extraction_logic' in requests[0].body, false);
});

test("a stored write's warnings become hints", async () => {
	const { hints } = await run(WRITE, () => ({
		items: [{ write_id: 'w1' }],
		warnings: [{ code: 'EXAMPLE_WARNING', message: 'A note on the write.' }],
	}));
	assert.deepEqual(hints, ['A note on the write.']);
});

const CREATE = { operation: 'create_instance', clusterId: 'c1', instanceName: 'Tickets', schemaFormat: 'json' };

test('Create Instance sends XMD written as JSON as the parsed object', async () => {
	const schema = { objects: { Ticket: { fields: { code: { type: 'str', required: true } }, primary_key: ['code'] } } };
	const { requests, hints } = await run({ ...CREATE, schemaText: JSON.stringify(schema) }, () => ({
		items: [{ id: 'inst-1' }],
	}));
	assert.deepEqual(requests[0].body.instance_schema, { yml: { value: schema } });
	assert.deepEqual(hints, []);
});

test("Create Instance's deprecation hint reaches the error when the API refuses the schema", async () => {
	const legacy = JSON.stringify({ type: 'object', properties: { code: { type: 'string' } } });
	const { thrown, hints } = await run({ ...CREATE, schemaText: legacy }, () => {
		throw refusedOverHttp({ errors: [{ code: 'INVALID_INPUT', message: 'The schema is not valid.' }] });
	});
	assert.equal(hints.length, 1);
	assert.ok(thrown.description.includes(hints[0]), thrown.description);
});
