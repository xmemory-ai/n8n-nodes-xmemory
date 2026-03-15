"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Xmemory = void 0;
const n8n_workflow_1 = require("n8n-workflow");
function buildCreateInstanceBody(ctx, itemIndex) {
    const schemaFormat = ctx.getNodeParameter('schemaFormat', itemIndex);
    const schemaText = ctx.getNodeParameter('schemaText', itemIndex);
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
function buildReadBody(ctx, itemIndex) {
    const instanceId = ctx.getNodeParameter('instanceId', itemIndex);
    const query = ctx.getNodeParameter('query', itemIndex);
    const mode = ctx.getNodeParameter('mode', itemIndex);
    const readId = ctx.getNodeParameter('readId', itemIndex);
    const body = {
        instance_id: instanceId,
        query,
        mode,
    };
    if (readId.trim() !== '') {
        body.read_id = readId;
    }
    return body;
}
function buildWriteBody(ctx, itemIndex) {
    const instanceId = ctx.getNodeParameter('instanceId', itemIndex);
    const text = ctx.getNodeParameter('text', itemIndex);
    const extractionLogic = ctx.getNodeParameter('extractionLogic', itemIndex);
    const extractWriteId = ctx.getNodeParameter('extractWriteId', itemIndex);
    const body = {
        instance_id: instanceId,
        text,
        extraction_logic: extractionLogic,
    };
    if (extractWriteId.trim() !== '') {
        body.extract_write_id = extractWriteId;
    }
    return body;
}
const operationProperty = {
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
const instanceIdProperty = {
    displayName: 'Instance ID',
    name: 'instanceId',
    type: 'string',
    default: '',
    required: true,
    description: 'Xmemory instance ID',
};
const readFields = [
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
        displayName: 'Read ID',
        name: 'readId',
        type: 'string',
        default: '',
        description: 'Optional read ID for tracing',
        displayOptions: {
            show: {
                operation: ['read'],
            },
        },
    },
];
const writeFields = [
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
        displayName: 'Extract/Write ID',
        name: 'extractWriteId',
        type: 'string',
        default: '',
        description: 'Optional extract/write ID for tracing',
        displayOptions: {
            show: {
                operation: ['write'],
            },
        },
    },
];
const createInstanceFields = [
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
class Xmemory {
    constructor() {
        this.description = {
            displayName: 'Xmemory',
            name: 'xmemory',
            icon: 'file:xmemory.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Read, write, and create instance operations for the Xmemory API',
            defaults: {
                name: 'Xmemory',
            },
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            usableAsTool: true,
            credentials: [
                {
                    name: 'xmemoryApi',
                    required: true,
                },
            ],
            properties: [operationProperty, ...readFields, ...writeFields, ...createInstanceFields],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const operation = this.getNodeParameter('operation', itemIndex);
                const credentials = (await this.getCredentials('xmemoryApi'));
                const baseUrl = credentials.baseUrl.replace(/\/$/, '');
                let endpoint;
                let body;
                if (operation === 'write') {
                    endpoint = '/write';
                    body = buildWriteBody(this, itemIndex);
                }
                else if (operation === 'read') {
                    endpoint = '/read';
                    body = buildReadBody(this, itemIndex);
                }
                else {
                    endpoint = '/instance/create';
                    body = buildCreateInstanceBody(this, itemIndex);
                }
                const requestOptions = {
                    method: 'POST',
                    url: `${baseUrl}${endpoint}`,
                    body,
                    json: true,
                };
                const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'xmemoryApi', requestOptions));
                if (response.status === 'error') {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), response.error_message || `Xmemory ${operation} request failed`, { itemIndex });
                }
                returnData.push({
                    json: response,
                    pairedItem: { item: itemIndex },
                });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            status: 'error',
                            error: error.message,
                        },
                        pairedItem: { item: itemIndex },
                    });
                    continue;
                }
                if (error instanceof n8n_workflow_1.NodeOperationError) {
                    throw error;
                }
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, { itemIndex });
            }
        }
        return [returnData];
    }
}
exports.Xmemory = Xmemory;
//# sourceMappingURL=Xmemory.node.js.map