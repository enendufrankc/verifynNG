import type { APIRequestContext } from '@playwright/test';

/**
 * TODO(E04): Uses E04's MintService. Currently a stub.
 */
export async function mintBatch(
  _request: APIRequestContext,
  _options: { count: number },
): Promise<{ batchId: string; unitIds: string[] }> {
  // TODO(E04): call POST /v1/batches or similar
  return { batchId: 'stub-batch-id', unitIds: [] };
}
