import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodeListSearchResult,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

type XmemoryCredentials = {
	baseUrl: string;
	token: string;
};

type XmemoryOperation = 'read' | 'write' | 'create_instance';

// xmemory wraps every endpoint response in an ApiResponse envelope:
// `{ids, items, errors, console_url}`. A successful call comes back as HTTP 2xx
// with an empty `errors` list and the operation payload in `items`; failures
// arrive as HTTP error status codes (and may also be described in `errors`).
type XmemoryApiError = {
	code?: string;
	message?: string;
	field?: string;
	resource_id?: string;
	details?: IDataObject;
};

type XmemoryApiResponse = IDataObject & {
	ids?: string[];
	items?: IDataObject[];
	errors?: XmemoryApiError[];
	console_url?: string | null;
};

// Turn a structured xmemory error into a human-legible message. The accounts API
// reports failures as `{errors:[{code, message, details?}]}`; for the non-retryable
// billing failures (HTTP 402 QUOTA_EXCEEDED / TRIAL_ENDED) and the velocity limit
// (HTTP 429 RATE_LIMITED) we append a short hint built from `code`/`details` so the
// workflow author sees *why* the call failed instead of a bare HTTP status. We only
// clarify these errors here and deliberately add no retry logic of our own.
function formatXmemoryError(error: XmemoryApiError | undefined, operation?: XmemoryOperation): string {
	const fallback = operation ? `Xmemory ${operation} request failed` : 'Xmemory request failed';
	if (error === undefined) {
		return fallback;
	}

	const base =
		(typeof error.message === 'string' && error.message) ||
		(typeof error.code === 'string' && error.code) ||
		fallback;
	const details = error.details ?? {};

	switch (error.code) {
		case 'QUOTA_EXCEEDED': {
			const period =
				details.kind === 'monthly_quota_exceeded'
					? 'monthly'
					: details.kind === 'daily_quota_exceeded'
						? 'daily'
						: undefined;
			const retryAfter =
				typeof details.retry_after_seconds === 'number' ? details.retry_after_seconds : undefined;
			const hint = [
				'quota exceeded',
				period !== undefined ? ` — ${period} limit` : '',
				retryAfter !== undefined ? `; retry after ${retryAfter}s` : '',
			].join('');
			return `${base} (${hint})`;
		}
		case 'TRIAL_ENDED':
			return `${base} (trial ended — subscribe to continue)`;
		case 'RATE_LIMITED':
			return `${base} (rate limited — too many requests, slow down before retrying)`;
		default:
			return base;
	}
}

// The HTTP helper throws on 4xx/5xx, and depending on the n8n version the parsed
// xmemory envelope can land in a few different places on the thrown error. Probe the
// known locations and return the structured errors if one carries a `code`.
function extractXmemoryErrors(error: unknown): XmemoryApiError[] | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const err = error as {
		errors?: unknown;
		body?: unknown;
		error?: unknown;
		response?: { body?: unknown; data?: unknown };
		cause?: { response?: { data?: unknown } };
		context?: { data?: unknown };
	};
	const candidates: unknown[] = [
		err,
		err.context?.data,
		err.response?.body,
		err.response?.data,
		err.cause?.response?.data,
		err.error,
		err.body,
	];

	for (const candidate of candidates) {
		if (typeof candidate !== 'object' || candidate === null) {
			continue;
		}
		const errors = (candidate as XmemoryApiResponse).errors;
		if (Array.isArray(errors) && errors.length > 0 && typeof errors[0]?.code === 'string') {
			return errors;
		}
	}

	return undefined;
}

function buildCreateInstanceBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const name = ctx.getNodeParameter('instanceName', itemIndex) as string;
	const schemaFormat = ctx.getNodeParameter('schemaFormat', itemIndex) as 'json' | 'yml';
	const schemaText = ctx.getNodeParameter('schemaText', itemIndex) as string;

	// Xmemory requires a valid XMD schema to create an instance; an empty schema is
	// rejected by the API ("Provide a valid XMD schema"). Fail early with a clear message
	// instead of forwarding an empty body that the server bounces with a 422.
	if (schemaText.trim() === '') {
		throw new NodeOperationError(
			ctx.getNode(),
			'Schema Text is required: Xmemory needs a valid XMD schema to create an instance.',
			{ itemIndex },
		);
	}

	return {
		name,
		instance_schema:
			schemaFormat === 'json'
				? { json_schema: { value: schemaText } }
				: { yml: { value: schemaText } },
	};
}

function buildReadScope(ctx: IExecuteFunctions, itemIndex: number): IDataObject | undefined {
	const scopeObjectsParam = ctx.getNodeParameter('scopeObjects', itemIndex, {}) as IDataObject;
	const entries = (scopeObjectsParam.object as IDataObject[] | undefined) ?? [];
	if (entries.length === 0) {
		return undefined;
	}

	// Each object is serialized to the API's identity wire shape:
	// `{type, key: {key: {...}}}` (by the object's user-defined primary key).
	const objects = entries.map((entry) => {
		const type = (entry.type as string) ?? '';
		const keyFields = (entry.keyFields as IDataObject | undefined) ?? {};
		const fieldEntries = (keyFields.field as IDataObject[] | undefined) ?? [];
		const key: IDataObject = {};
		for (const field of fieldEntries) {
			key[field.name as string] = field.value;
		}
		// An object with no key fields omits `key` so the server returns the
		// documented 400 validation error.
		return Object.keys(key).length > 0 ? { type, key: { key } } : { type };
	});

	const relationsScope = ctx.getNodeParameter('relationsScope', itemIndex, 'no_relations') as string;
	return { objects, relations_scope: relationsScope };
}

function buildReadBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const query = ctx.getNodeParameter('query', itemIndex) as string;
	const mode = ctx.getNodeParameter('mode', itemIndex) as string;
	const traceId = ctx.getNodeParameter('traceId', itemIndex) as string;

	const body: IDataObject = { query, mode };

	const scope = buildReadScope(ctx, itemIndex);
	if (scope !== undefined) {
		body.scope = scope;
	}

	if (traceId.trim() !== '') {
		body.trace_id = traceId;
	}

	return body;
}

function buildWriteBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const text = ctx.getNodeParameter('text', itemIndex) as string;
	const extractionLogic = ctx.getNodeParameter('extractionLogic', itemIndex) as string;
	const traceId = ctx.getNodeParameter('traceId', itemIndex) as string;
	const diffEngine = ctx.getNodeParameter('diffEngine', itemIndex) as boolean;

	const body: IDataObject = {
		text,
		extraction_logic: extractionLogic,
		use_diff_engine: diffEngine,
	};

	if (traceId.trim() !== '') {
		body.trace_id = traceId;
	}

	return body;
}

const operationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Read',
			value: 'read',
			description: 'Query memory from an instance',
			action: 'Read from instance',
		},
		{
			name: 'Write',
			value: 'write',
			description: 'Write text into an instance',
			action: 'Write to instance',
		},
		{
			name: 'Create Instance',
			value: 'create_instance',
			description: 'Create a new Xmemory instance from schema',
			action: 'Create instance',
		},
	],
	default: 'read',
};

const instanceIdProperty: INodeProperties = {
	displayName: 'Instance ID',
	name: 'instanceId',
	type: 'string',
	default: '',
	required: true,
	description: 'ID of the Xmemory instance',
};

const readFields: INodeProperties[] = [
	{
		...instanceIdProperty,
		displayOptions: {
			show: {
				operation: ['read'],
			},
		},
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		default: '',
		required: true,
		description: 'Natural language query for the memory reader',
		displayOptions: {
			show: {
				operation: ['read'],
			},
		},
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'single-answer',
		description: 'Reader response mode',
		options: [
			{
				name: 'Single Answer',
				value: 'single-answer',
			},
			{
				name: 'Raw Tables',
				value: 'raw-tables',
			},
			{
				name: 'XResponse',
				value: 'xresponse',
			},
		],
		displayOptions: {
			show: {
				operation: ['read'],
			},
		},
	},
	{
		displayName: 'Scope Objects',
		name: 'scopeObjects',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		description:
			'Restrict the read to these concrete objects. Leave empty for an unscoped read over the whole instance.',
		displayOptions: {
			show: {
				operation: ['read'],
			},
		},
		options: [
			{
				name: 'object',
				displayName: 'Object',
				values: [
					{
						displayName: 'Type',
						name: 'type',
						type: 'string',
						default: '',
						required: true,
						description: 'Object type: PascalCase class name or snake_case table name',
					},
					{
						displayName: 'Key Fields',
						name: 'keyFields',
						type: 'fixedCollection',
						typeOptions: {
							multipleValues: true,
						},
						default: {},
						required: true,
						description:
							'Identify the object by its user-defined primary key (one entry per PK field)',
						options: [
							{
								name: 'field',
								displayName: 'Field',
								values: [
									{
										displayName: 'Name',
										name: 'name',
										type: 'string',
										default: '',
									},
									{
										displayName: 'Value',
										name: 'value',
										type: 'string',
										default: '',
									},
								],
							},
						],
					},
				],
			},
		],
	},
	{
		displayName: 'Relations Scope',
		name: 'relationsScope',
		type: 'options',
		default: 'no_relations',
		options: [
			{
				name: 'No Relations',
				value: 'no_relations',
				description: 'Expose the in-scope objects only',
			},
			{
				name: 'All Relations',
				value: 'all_relations',
				description: 'Also expose the relations among the in-scope objects',
			},
		],
		description: 'Which relations a scoped read may traverse (only used when Scope Objects are set)',
		displayOptions: {
			show: {
				operation: ['read'],
			},
		},
	},
	{
		displayName: 'Trace ID',
		name: 'traceId',
		type: 'string',
		default: '',
		description: 'Optional trace ID for request tracing',
		displayOptions: {
			show: {
				operation: ['read'],
			},
		},
	},
];

const writeFields: INodeProperties[] = [
	{
		...instanceIdProperty,
		displayOptions: {
			show: {
				operation: ['write'],
			},
		},
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: {
			rows: 5,
		},
		default: '',
		required: true,
		description: 'Text content to extract and write into memory',
		displayOptions: {
			show: {
				operation: ['write'],
			},
		},
	},
	{
		displayName: 'Extraction Logic',
		name: 'extractionLogic',
		type: 'options',
		default: 'fast',
		description: 'Extraction quality/performance mode',
		options: [
			{
				name: 'Deep',
				value: 'deep',
			},
			{
				name: 'Fast',
				value: 'fast',
			},
		],
		displayOptions: {
			show: {
				operation: ['write'],
			},
		},
	},
	{
		displayName: 'Trace ID',
		name: 'traceId',
		type: 'string',
		default: '',
		description: 'Optional trace ID for request tracing',
		displayOptions: {
			show: {
				operation: ['write'],
			},
		},
	},
	{
		displayName: 'Diff Engine',
		name: 'diffEngine',
		type: 'boolean',
		default: true,
		description: 'Whether to use diff engine for write requests',
		displayOptions: {
			show: {
				operation: ['write'],
			},
		},
	},
];

const createInstanceFields: INodeProperties[] = [
	{
		displayName: 'Cluster',
		name: 'clusterId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'Cluster to create the instance in. Pick from the list (shows cluster names) or paste a cluster ID.',
		displayOptions: {
			show: {
				operation: ['create_instance'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchClusters',
					searchable: false,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 123e4567-e89b-12d3-a456-426614174000',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
							errorMessage: 'Enter a valid cluster ID (UUID)',
						},
					},
				],
			},
		],
	},
	{
		displayName: 'Instance Name',
		name: 'instanceName',
		type: 'string',
		default: '',
		required: true,
		description: 'Name for the new Xmemory instance',
		displayOptions: {
			show: {
				operation: ['create_instance'],
			},
		},
	},
	{
		displayName: 'Schema Format',
		name: 'schemaFormat',
		type: 'options',
		default: 'yml',
		description: 'Schema payload format sent to Xmemory',
		options: [
			{
				name: 'YAML',
				value: 'yml',
			},
			{
				name: 'JSON',
				value: 'json',
			},
		],
		displayOptions: {
			show: {
				operation: ['create_instance'],
			},
		},
	},
	{
		displayName: 'Schema Text',
		name: 'schemaText',
		type: 'string',
		typeOptions: {
			rows: 10,
		},
		default: '',
		required: true,
		description: 'XMD schema content in the selected format. Xmemory requires a valid schema to create an instance.',
		displayOptions: {
			show: {
				operation: ['create_instance'],
			},
		},
	},
];

export class Xmemory implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Xmemory',
		name: 'xmemory',
		icon: 'file:xmemory-favicon.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Memory operations via Xmemory API',
		defaults: {
			name: 'Xmemory',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'xmemoryApi',
				required: true,
			},
		],
		properties: [operationProperty, ...readFields, ...writeFields, ...createInstanceFields],
	};

	methods = {
		listSearch: {
			// Backs the cluster resourceLocator "From List" mode: shows each cluster's name
			// to the user while the selected value is the cluster id used in the request URL.
			async searchClusters(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				const credentials = (await this.getCredentials('xmemoryApi')) as XmemoryCredentials;
				const baseUrl = credentials.baseUrl.replace(/\/$/, '');

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'xmemoryApi',
					{ method: 'GET', url: `${baseUrl}/clusters`, json: true },
				)) as { items?: Array<{ id: string; name?: string }> };

				return {
					results: (response.items ?? []).map((cluster) => ({
						name: cluster.name || cluster.id,
						value: cluster.id,
					})),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			// Hoisted so the catch block can name the operation when formatting errors.
			let operation: XmemoryOperation | undefined;
			try {
				operation = this.getNodeParameter('operation', itemIndex) as XmemoryOperation;
				const credentials = (await this.getCredentials('xmemoryApi')) as XmemoryCredentials;

				const baseUrl = credentials.baseUrl.replace(/\/$/, '');
				let endpoint: string;
				let body: IDataObject;

				if (operation === 'write') {
					const instanceId = this.getNodeParameter('instanceId', itemIndex) as string;
					endpoint = `/instances/${instanceId}/write`;
					body = buildWriteBody(this, itemIndex);
				} else if (operation === 'read') {
					const instanceId = this.getNodeParameter('instanceId', itemIndex) as string;
					endpoint = `/instances/${instanceId}/read`;
					body = buildReadBody(this, itemIndex);
				} else {
					// clusterId is a resourceLocator; extractValue resolves both modes
					// ("From List" and "By ID") down to the cluster id string.
					const clusterId = this.getNodeParameter('clusterId', itemIndex, '', {
						extractValue: true,
					}) as string;
					// Guard against an empty id: without this the request would be sent to
					// `/clusters//instances`, which the API answers with a confusing 404.
					if (clusterId.trim() === '') {
						throw new NodeOperationError(
							this.getNode(),
							'No cluster selected. Choose a cluster from the list or provide a cluster ID.',
							{ itemIndex },
						);
					}
					endpoint = `/clusters/${clusterId}/instances`;
					body = buildCreateInstanceBody(this, itemIndex);
				}

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${baseUrl}${endpoint}`,
					body,
					json: true,
				};

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'xmemoryApi',
					requestOptions,
				)) as XmemoryApiResponse;

				// Surface any problem reported inside the envelope. HTTP error statuses are
				// already thrown by httpRequestWithAuthentication and handled in the catch
				// below; this covers an envelope that carries `errors` alongside a 2xx status.
				const errors = response.errors ?? [];
				if (errors.length > 0) {
					throw new NodeOperationError(this.getNode(), formatXmemoryError(errors[0], operation), {
						itemIndex,
					});
				}

				// Unwrap the envelope so downstream nodes receive the operation payload
				// (ReadResponse / WriteResponse / InstanceResponse) directly. read, write
				// and create_instance each return exactly one item; fall back to the whole
				// envelope if `items` is unexpectedly empty so nothing is dropped silently.
				const payloadItems = response.items ?? [];
				if (payloadItems.length === 0) {
					returnData.push({ json: response, pairedItem: { item: itemIndex } });
				} else {
					for (const item of payloadItems) {
						// The deep-link `console_url` lives on the envelope; fold it into any
						// item that doesn't already carry one (e.g. create_instance).
						const json: IDataObject =
							item.console_url == null && response.console_url != null
								? { ...item, console_url: response.console_url }
								: item;
						returnData.push({ json, pairedItem: { item: itemIndex } });
					}
				}
			} catch (error) {
				// Prefer the legible, structured xmemory message when the failure carries one.
				const structuredErrors = extractXmemoryErrors(error);
				const message =
					structuredErrors !== undefined
						? formatXmemoryError(structuredErrors[0], operation)
						: (error as Error).message;

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							status: 'error',
							error: message,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (error instanceof NodeOperationError) {
					throw error;
				}

				// When the upstream HTTP error carries a structured xmemory envelope (e.g. a 402
				// QUOTA_EXCEEDED / TRIAL_ENDED, or a 429 RATE_LIMITED), surface the legible message
				// instead of the bare HTTP error while keeping the HTTP status/body via NodeApiError.
				// These are non-retryable by contract; we only clarify them and add no retry logic.
				if (structuredErrors !== undefined) {
					throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex, message });
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
			}
		}

		return [returnData];
	}
}