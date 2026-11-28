import type { IDataObject } from 'n8n-workflow';

export type SchemaFormat = 'json' | 'yml';

export const JSON_SCHEMA_DEPRECATION =
	'JSON Schema input is deprecated: send an XMD schema (Schema Format: YAML) instead.';

// Keywords at the root of a JSON Schema, any of which marks a document as one, whatever else it holds: a
// JSON Schema may use `objects` as an annotation of its own.
const JSON_SCHEMA_ROOT_KEYWORDS = [
	'$schema',
	'$id',
	'type',
	'properties',
	'$defs',
	'definitions',
	'allOf',
	'anyOf',
	'oneOf',
	'not',
	'$ref',
	'if',
	'then',
	'else',
];

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

// XMD written as JSON: the text parses as a JSON object with an own `xmd_version` key, or `objects`
// shaped as XMD's object types, and none of JSON Schema's root keywords. It is returned parsed, so it
// can be sent as the object it is.
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
	if (JSON_SCHEMA_ROOT_KEYWORDS.some((key) => hasOwn(document, key))) {
		return undefined;
	}
	const objects = hasOwn(document, 'objects') ? document.objects : undefined;
	return hasOwn(document, 'xmd_version') || isXmdObjects(objects) ? document : undefined;
}

// The text each object parsed from XMD written as JSON was read from, so that a request can carry the text itself
// (`requestBody`).
const SOURCE_TEXT = new WeakMap<object, string>();

// `body` as the JSON a request sends, each object parsed from XMD written as JSON written as the text it was read
// from, so that every number reaches the API by its own token: `1.0` stays a float and an integer past 2^53 stays
// exact, which JavaScript's own numbers would not keep.
export function requestBody(body: IDataObject): string {
	const texts: string[] = [];
	// A string no JSON text holds unescaped, written in each such object's place and then replaced by its text.
	const placeholder = (index: number) => `\u0000xmd-json-${index}\u0000`;
	const written = JSON.stringify(body, function (this: Record<string, unknown>, key: string, value: unknown) {
		const original = this[key];
		const source = typeof original === 'object' && original !== null ? SOURCE_TEXT.get(original) : undefined;
		if (source === undefined) {
			return value;
		}
		texts.push(source.trim());
		return placeholder(texts.length - 1);
	});
	return texts.reduce((text, source, index) => text.replace(JSON.stringify(placeholder(index)), () => source), written);
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
