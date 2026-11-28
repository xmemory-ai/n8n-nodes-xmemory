import type { IDataObject } from 'n8n-workflow';

// A rejected write's error may carry `details.rejection`. Its fields are left untyped, so the node
// passes on whatever the API sends.
export function rejectionDetails(entry: { details?: IDataObject } | undefined): IDataObject | undefined {
	const rejection = entry?.details?.rejection;
	return typeof rejection === 'object' && rejection !== null && !Array.isArray(rejection)
		? (rejection as IDataObject)
		: undefined;
}

// The messages of the warnings a stored write came back with, in their order.
export function warningMessages(warnings: unknown): string[] {
	if (!Array.isArray(warnings)) {
		return [];
	}
	return warnings.flatMap((warning) => {
		const message = typeof warning === 'object' && warning !== null ? (warning as IDataObject).message : undefined;
		return typeof message === 'string' && message !== '' ? [message] : [];
	});
}
