"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XmemoryApi = void 0;
class XmemoryApi {
    constructor() {
        this.name = 'xmemoryApi';
        this.displayName = 'Xmemory API';
        this.icon = 'file:../nodes/Xmemory/xmemory.svg';
        this.documentationUrl = 'https://github.com/xmemory-ai';
        this.properties = [
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
                displayName: 'Bearer Token',
                name: 'token',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                required: true,
                description: 'Bearer token used for Xmemory API authentication',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '=Bearer {{$credentials.token}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.baseUrl}}',
                url: '/config',
                method: 'GET',
            },
        };
    }
}
exports.XmemoryApi = XmemoryApi;
//# sourceMappingURL=XmemoryApi.credentials.js.map