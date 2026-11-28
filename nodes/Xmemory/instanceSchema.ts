import type { IDataObject } from 'n8n-workflow';

export type SchemaFormat = 'json' | 'yml';

export const JSON_SCHEMA_DEPRECATION =
	'JSON Schema input is deprecated: send an XMD schema (Schema Format: YAML) instead.';

// XMD written as JSON is still XMD: the text parses as JSON, and its top level is an object with an
// own `objects` key. JSON is valid YAML, so such text is sent as `yml`, which xmemory reads as XMD.
export function isXmdWrittenAsJson(text: string): boolean {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return false;
	}
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		!Array.isArray(parsed) &&
		Object.prototype.hasOwnProperty.call(parsed, 'objects')
	);
}

// The `instance_schema` body for a new instance. Under the JSON format, text that is not XMD written
// as JSON (a JSON Schema, or text that does not parse) keeps the `json_schema` route as before, and
// `warn` is called once with the deprecation notice for the workflow author.
export function instanceSchemaBody(
	format: SchemaFormat,
	text: string,
	warn: (message: string) => void,
): IDataObject {
	if (format === 'yml' || isXmdWrittenAsJson(text)) {
		return { yml: { value: text } };
	}
	warn(JSON_SCHEMA_DEPRECATION);
	return { json_schema: { value: text } };
}
