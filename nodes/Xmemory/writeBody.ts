import type { IDataObject } from 'n8n-workflow';

// The extraction setting a write sends: deep, whichever Extraction Logic choice the workflow saved. Fast is no
// longer offered, and a saved Fast choice sends deep too, so every write gets deep extraction from an API of any
// version, one that still runs Fast for a write that sends no setting included. The option stays so saved workflows
// keep working.
export function extractionLogicField(): IDataObject {
	return { extraction_logic: 'deep' };
}
