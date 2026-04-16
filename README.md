# n8n-nodes-xmemory

**xmemory** is a memory interface with natural-language inputs and outputs, backed by schema under the hood.

Community n8n node for [xmemory](https://xmemory.ai) `read`, `write`, and `create instance` operations. [This overview](https://xmemory.ai/integration-overview/) gives detailed description of xmemory.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Installation

Check out [installation guide](https://xmemory.ai/n8n) and register your interest at [xmemory website](https://xmemory.ai) to get an API key.

## Operations

- `Create Instance`: Calls `POST /clusters/{cluster_id}/instances`. Requires **Cluster ID**, **Instance Name**, and an optional schema (JSON or YAML).
- `Write`: Calls `POST /instances/{instance_id}/write`. Writes text into memory using the instance schema. `Fast`, `regular`, and `deep` extraction modes are supported. Optionally pass a **Trace ID** and toggle **Diff Engine**.
- `Read`: Calls `POST /instances/{instance_id}/read`. Queries memory using a free-form natural-language query. Supported modes: `single-answer` (short summary), `raw-tables` (structured SQL-like representation), `xresponse` (schema-based structured response). Optionally pass a **Trace ID**.

## Credentials

- `Base URL`: xmemory API base URL, for example `https://api.xmemory.ai`.
- `Bearer Token`: Bearer token used to authenticate against the xmemory API. Register you interest at [https://xmemory.ai], we will reach out to discuss your scenario and issue an API key.

## Resources

- [tutorial for xmemory usage from n8n](https://xmemory.ai/n8n/)
- [xmemory documentation](https://xmemory.ai/integration-overview/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Compatibility

This package targets the current community-node API version (`n8nNodesApiVersion: 1`). Validate against the n8n version you run in your environment.