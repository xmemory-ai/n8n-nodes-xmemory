import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';
export declare class XmemoryApi implements ICredentialType {
    name: string;
    displayName: string;
    icon: "file:../nodes/Xmemory/xmemory.svg";
    documentationUrl: string;
    properties: INodeProperties[];
    authenticate: IAuthenticateGeneric;
    test: ICredentialTestRequest;
}
