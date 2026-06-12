import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class XmemoryApi implements ICredentialType {
	name = 'xmemoryApi';

	displayName = 'Xmemory API';

	icon = 'file:../nodes/Xmemory/xmemory-favicon.svg' as const;

	documentationUrl = 'https://github.com/xmemory-ai';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.xmemory.ai',
			placeholder: 'https://api.xmemory.ai',
			required: true,
			description: 'Base URL of the Xmemory API',
		},
		{
			displayName: 'API Key',
			name: 'token',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'API key used for Xmemory API authentication',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.token}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/runtime',
			method: 'GET',
		},
	};
}