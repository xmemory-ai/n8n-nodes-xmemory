# n8n-nodes-xmemory

**xmemory** is a memory interface with natural-language inputs and outputs, backed by schema under the hood.

Community n8n node for [xmemory](https://xmemory.ai) `read`, `write`, and `create instance` operations. [This overview](https://xmemory.ai/integration-overview/) gives detailed description of xmemory.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Installation

Check out [installation guide](https://xmemory.ai/n8n) and register your interest at [xmemory website](https://xmemory.ai) to get an API key.

## Operations

- `Create Instance`: Calls `POST /clusters/{cluster_id}/instances`. Pick a **Cluster** (from the list by name, or by ID), and provide an **Instance Name** and a valid XMD **Schema** (JSON or YAML). Xmemory requires a schema to create an instance.
- `Write`: Calls `POST /instances/{instance_id}/write`. Writes text into memory using the instance schema. `Fast` (default) and `deep` extraction modes are supported. Optionally pass a **Trace ID** and toggle **Diff Engine**.
- `Read`: Calls `POST /instances/{instance_id}/read`. Queries memory using a free-form natural-language query. Supported modes: `single-answer` (short summary), `raw-tables` (structured SQL-like representation), `xresponse` (schema-based structured response). Optionally restrict the read to specific objects via **Scope Objects** (identified by their user-defined primary key) together with a **Relations Scope** (`no_relations` or `all_relations`), and pass a **Trace ID**.

Every operation returns the xmemory API payload directly: the response envelope (`{ids, items, errors, console_url}`) is unwrapped, so downstream nodes receive the operation result (read result, `write_id`, created instance, …). Errors are raised as node errors.

## Credentials

- `Base URL`: xmemory API base URL, for example `https://api.xmemory.ai`.
- `API Key`: API key used to authenticate against the xmemory API (sent as `Authorization: Bearer <key>`). Register your interest at [xmemory.ai](https://xmemory.ai); we will reach out to discuss your scenario and issue an API key.

## Resources

- [tutorial for xmemory usage from n8n](https://xmemory.ai/n8n/)
- [xmemory documentation](https://xmemory.ai/integration-overview/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Compatibility

This package targets the current community-node API version (`n8nNodesApiVersion: 1`). Validate against the n8n version you run in your environment.

## Releasing

Releases are manual and version-driven:

1. Bump the `version` in `package.json` via a pull request and merge it to `main`.
2. Run the **Publish** workflow (`Actions` → `Publish` → `Run workflow`, or `gh workflow run publish.yml`).

The workflow publishes the current `package.json` version to npm and then pushes a matching git tag (`X.Y.Z`). If a tag for that version already exists, the run fails — bump the version first.
