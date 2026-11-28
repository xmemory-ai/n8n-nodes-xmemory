import type { IDataObject } from 'n8n-workflow';

// The extraction setting a write sends. Fast is no longer offered by the API, so it sends nothing and
// the write uses the API's deep extraction; the option stays so saved workflows keep working.
export function extractionLogicField(extractionLogic: string): IDataObject {
	return extractionLogic === 'fast' ? {} : { extraction_logic: extractionLogic };
}
