import type { IDataObject } from 'n8n-workflow';

export type SchemaFormat = 'json' | 'yml';

export const JSON_SCHEMA_DEPRECATION =
	'JSON Schema input is deprecated: send an XMD schema (Schema Format: YAML) instead.';

// Keywords at the root of a JSON Schema, any of which marks a document as one, whatever else it holds: a
// JSON Schema may use `objects` as an annotation of its own.
const JSON_SCHEMA_ROOT_KEYWORDS = ['$schema', '$id', 'type', 'properties', '$defs', 'definitions'];

// XMD written as JSON: the text parses as a JSON object with an own `objects` key and none of JSON
// Schema's root keywords. It is returned parsed, so it can be sent as the object it is.
export function xmdWrittenAsJson(text: string): IDataObject | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return undefined;
	}
	const own = (key: string) => Object.prototype.hasOwnProperty.call(parsed, key);
	if (!own('objects') || JSON_SCHEMA_ROOT_KEYWORDS.some(own)) {
		return undefined;
	}
	return parsed as IDataObject;
}

// The `instance_schema` body for a new instance. YAML goes as `yml` text. Under the JSON format, XMD
// written as JSON goes as `yml` too, as the parsed object, so every value reaches the schema as JSON gave
// it; any other text (a JSON Schema, or text that does not parse) keeps the `json_schema` route as
// before, and `warn` is called once with the deprecation notice for the workflow author.
export function instanceSchemaBody(
	format: SchemaFormat,
	text: string,
	warn: (message: string) => void,
): IDataObject {
	if (format === 'yml') {
		return { yml: { value: text } };
	}
	const xmd = xmdWrittenAsJson(text);
	if (xmd !== undefined) {
		return { yml: { value: xmd } };
	}
	warn(JSON_SCHEMA_DEPRECATION);
	return { json_schema: { value: text } };
}
