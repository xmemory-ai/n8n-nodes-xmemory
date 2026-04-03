import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type INodeExecutionData,
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
	const schemaFormat = ctx.getNodeParameter('schemaFormat', itemIndex) as 'json' | 'yml';
	const schemaText = ctx.getNodeParameter('schemaText', itemIndex) as string;

	if (schemaText.trim() === '') {
		return {};
	}

	if (schemaFormat === 'json') {
		return {
			json_schema: schemaText,
		};
	}

	return {
		yml_schema: schemaText,
	};
}

function buildReadBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const instanceId = ctx.getNodeParameter('instanceId', itemIndex) as string;
	const query = ctx.getNodeParameter('query', itemIndex) as string;
	const mode = ctx.getNodeParameter('mode', itemIndex) as string;
	const traceId = ctx.getNodeParameter('traceId', itemIndex) as string;

	const body: IDataObject = {
		instance_id: instanceId,
		query,
		mode,
	};

	if (traceId.trim() !== '') {
		body.trace_id = traceId;
	}

	return body;
}

function buildWriteBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const instanceId = ctx.getNodeParameter('instanceId', itemIndex) as string;
	const text = ctx.getNodeParameter('text', itemIndex) as string;
	const extractionLogic = ctx.getNodeParameter('extractionLogic', itemIndex) as string;
	const traceId = ctx.getNodeParameter('traceId', itemIndex) as string;
	const diffEngine = ctx.getNodeParameter('diffEngine', itemIndex) as boolean;

	const body: IDataObject = {
		instance_id: instanceId,
		text,
		extraction_logic: extractionLogic,
		diff_engine: diffEngine,
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
	description: 'Xmemory instance ID',
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
		default: 'deep',
		description: 'Extraction quality/performance mode',
		options: [
			{
				name: 'Deep',
				value: 'deep',
			},
			{
				name: 'Regular',
				value: 'regular',
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
		displayName: 'Schema Format',
		name: 'schemaFormat',
		type: 'options',
		default: 'json',
		description: 'Schema payload format sent to Xmemory',
		options: [
			{
				name: 'JSON',
				value: 'json',
			},
			{
				name: 'YML',
				value: 'yml',
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
		description: 'JSON/YML schema content. Leave empty to create an instance with an empty schema.',
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
		description: 'Memory operations via xmemory API',
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
					endpoint = '/write';
					body = buildWriteBody(this, itemIndex);
				} else if (operation === 'read') {
					endpoint = '/read';
					body = buildReadBody(this, itemIndex);
				} else {
					endpoint = '/instance/create';
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