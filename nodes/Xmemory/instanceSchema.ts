import type { IDataObject } from 'n8n-workflow';

export type SchemaFormat = 'json' | 'yml';

export const JSON_SCHEMA_DEPRECATION =
	'JSON Schema input is deprecated: send an XMD schema (Schema Format: YAML) instead.';

// The root keys an XMD schema has, and the API's XMD model takes no other: a document with any other root key, a JSON
// Schema's keywords among them, is no XMD schema.
const XMD_ROOT_KEYS = new Set(['xmd_version', 'title', 'description', 'objects', 'relations']);

function isPlainObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

// `objects` shaped as XMD's object types: a mapping of mappings, at least one with `fields`. One is
// enough, so a schema with an object missing its `fields` reaches XMD's own error for that object.
function isXmdObjects(objects: unknown): boolean {
	if (!isPlainObject(objects)) {
		return false;
	}
	const types = Object.values(objects);
	return types.every(isPlainObject) && types.some((type) => hasOwn(type as object, 'fields'));
}

// XMD written as JSON: the text parses as a JSON object whose every key is one an XMD schema has, with an own
// `xmd_version` key or `objects` shaped as XMD's object types. It is returned parsed, so it can be sent as the object
// it is.
export function xmdWrittenAsJson(text: string): IDataObject | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!isPlainObject(parsed)) {
		return undefined;
	}
	const document = parsed;
	if (!Object.keys(document).every((key) => XMD_ROOT_KEYS.has(key))) {
		return undefined;
	}
	const objects = hasOwn(document, 'objects') ? document.objects : undefined;
	return hasOwn(document, 'xmd_version') || isXmdObjects(objects) ? document : undefined;
}

// The text each object parsed from XMD written as JSON was read from, so that a request can carry the text itself
// (`requestBody`).
const SOURCE_TEXT = new WeakMap<object, string>();

// `body` as the JSON a request sends. When its `instance_schema` carries XMD written as JSON, that schema's own text is
// written at `instance_schema`'s place, after the body's other fields, so that every number reaches the API by its own
// token (`1.0` stays a float and an integer past 2^53 stays exact, which JavaScript's own numbers would not keep), and
// no other field can take its place. Any other body is `JSON.stringify`'s.
export function requestBody(body: IDataObject): string {
	const schema = hasOwn(body, 'instance_schema') ? body.instance_schema : undefined;
	const yml = isPlainObject(schema) && hasOwn(schema, 'yml') ? schema.yml : undefined;
	const value = isPlainObject(yml) && hasOwn(yml, 'value') ? yml.value : undefined;
	const source = isPlainObject(value) ? SOURCE_TEXT.get(value) : undefined;
	if (source === undefined) {
		return JSON.stringify(body);
	}
	const rest: IDataObject = { ...body };
	delete rest.instance_schema;
	const written = `{"yml":{"value":${source.trim()}}}`;
	const head = JSON.stringify(rest);
	return head === '{}' ? `{"instance_schema":${written}}` : `${head.slice(0, -1)},"instance_schema":${written}}`;
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
		SOURCE_TEXT.set(xmd, text);
		return { yml: { value: xmd } };
	}
	warn(JSON_SCHEMA_DEPRECATION);
	return { json_schema: { value: text } };
}
