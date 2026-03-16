# n8n-nodes-xmemory

Community n8n node for xmemory `read`, `write`, and `create instance` operations.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

- `Read`: Calls `POST /read` with `instance_id`, `query`, optional `read_id`, and `mode`.
- `Write`: Calls `POST /write` with `instance_id`, `text`, optional `extract_write_id`, and `extraction_logic`.
- `Create Instance`: Calls `POST /instance/create` with optional `json_schema` or `yml_schema`.

## Credentials

- `Base URL`: xmemory API base URL, for example `https://api.xmemory.ai`.
- `Bearer Token`: Bearer token used to authenticate against the xmemory API.

## Compatibility

This package targets the current community-node API version (`n8nNodesApiVersion: 1`). Validate against the n8n version you run in your environment.

## Usage

Create an `xmemory API` credential, then add the `xmemory` node to your workflow and choose one of the supported operations.

For `Create Instance`, set `Schema Format` to match the payload you provide in `Schema Text`.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [xmemory documentation](https://xmemory.ai/docs)

## Version history

- `0.1.0`: Initial xmemory community node with `read`, `write`, and `create instance` operations.
