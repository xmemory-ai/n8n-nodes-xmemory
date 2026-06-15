import {
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
} from 'n8n-workflow';

type XmemoryCredentials = {
	baseUrl: string;
	token: string;
};

type XmemoryOperation = 'read' | 'write' | 'create_instance';

type XmemoryStatusResponse = IDataObject & {
	status?: string;
	error_message?: string;
	trace_id?: string;
};

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

	const objects = entries.map((entry) => {
		const obj: IDataObject = { type: (entry.type as string) ?? '' };
		const xuid = ((entry.xuid as string) ?? '').trim();
		if (xuid !== '') {
			obj.xuid = xuid;
			return obj;
		}
		const keyFields = (entry.keyFields as IDataObject | undefined) ?? {};
		const fieldEntries = (keyFields.field as IDataObject[] | undefined) ?? [];
		const key: IDataObject = {};
		for (const field of fieldEntries) {
			key[field.name as string] = field.value;
		}
		// Identify by primary key; an object with neither xuid nor key is left as
		// just `type` so the server returns the documented 400 validation error.
		if (Object.keys(key).length > 0) {
			obj.key = key;
		}
		return obj;
	});

	const includeRelations = ctx.getNodeParameter('scopeIncludeRelations', itemIndex, false) as boolean;
	return { objects, include_relations: includeRelations };
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
						displayName: 'Xuid',
						name: 'xuid',
						type: 'string',
						default: '',
						description: 'Identify the object by its xuid. Leave empty to use Key Fields instead.',
					},
					{
						displayName: 'Key Fields',
						name: 'keyFields',
						type: 'fixedCollection',
						typeOptions: {
							multipleValues: true,
						},
						default: {},
						description:
							'Identify the object by its user-defined primary key (one entry per PK field). Ignored when Xuid is set.',
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
		displayName: 'Include Relations',
		name: 'scopeIncludeRelations',
		type: 'boolean',
		default: false,
		description:
			'Whether to also expose relations among the in-scope objects (only used when Scope Objects are set)',
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
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as XmemoryOperation;
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
				)) as XmemoryStatusResponse;

				if (response.status === 'error') {
					throw new NodeOperationError(
						this.getNode(),
						response.error_message || `Xmemory ${operation} request failed`,
						{ itemIndex },
					);
				}

				returnData.push({
					json: response,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							status: 'error',
							error: (error as Error).message,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (error instanceof NodeOperationError) {
					throw error;
				}

				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}