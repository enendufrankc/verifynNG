/**
 * T13 load proof: mints `count` units against a running compose stack over
 * HTTP and reports wall time + throughput.
 *
 * Usage:
 *   pnpm --filter @verifynng/api mint-bench -- --count=1000000
 *   API_BASE_URL=http://localhost:4412 pnpm --filter @verifynng/api mint-bench
 *
 * Requires the tenant seeded by `pnpm db:seed` (tenant "ivoryglow", product
 * "ig004", OEM "Guiba OEM (China)") to already exist.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const TENANT_SLUG = process.env.MINT_BENCH_TENANT ?? 'ivoryglow';
const PRODUCT_SKU = process.env.MINT_BENCH_SKU ?? 'ig004';
const OEM_NAME = process.env.MINT_BENCH_OEM ?? 'Guiba OEM (China)';
const POLL_INTERVAL_MS = 2000;

interface Product {
  id: string;
  sku: string;
}

interface Oem {
  id: string;
  name: string;
}

interface BatchRow {
  id: string;
  status: string;
  count: number;
  mintedCount: number;
}

interface JobModeResponse {
  batch: BatchRow;
  jobId: string;
}

interface JobStatus {
  state: string;
  progress: number | Record<string, unknown>;
  failedReason?: string;
}

function isJobModeResponse(
  body: BatchRow | JobModeResponse,
): body is JobModeResponse {
  // The job-mode response wraps the batch as `{ batch, jobId }`; the sync
  // (or idempotent-sync) response is the raw Batch row, which also has a
  // `jobId` column (nullable) — so check for the wrapper shape, not `jobId`.
  return 'batch' in body;
}

function parseCount(): number {
  const arg = process.argv.find((a) => a.startsWith('--count='));
  const count = arg ? parseInt(arg.split('=')[1], 10) : 1_000_000;
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`invalid --count: ${arg}`);
  }
  return count;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status >= 400) {
    throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob(jobId: string): Promise<void> {
  for (;;) {
    const job = await getJson<JobStatus>(
      `/tenants/${TENANT_SLUG}/jobs/${jobId}`,
    );
    const progress =
      typeof job.progress === 'number' ? `${job.progress}%` : '…';
    process.stdout.write(`\r  job ${jobId}: ${job.state} (${progress})   `);
    if (job.state === 'completed') {
      process.stdout.write('\n');
      return;
    }
    if (job.state === 'failed') {
      process.stdout.write('\n');
      throw new Error(`mint job failed: ${job.failedReason}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function main(): Promise<void> {
  const count = parseCount();

  const products = await getJson<Product[]>(`/tenants/${TENANT_SLUG}/products`);
  const product = products.find((p) => p.sku === PRODUCT_SKU);
  if (!product) {
    throw new Error(
      `product ${PRODUCT_SKU} not found for tenant ${TENANT_SLUG} — run "pnpm db:seed" first`,
    );
  }

  const oems = await getJson<Oem[]>(`/tenants/${TENANT_SLUG}/oems`);
  const oem = oems.find((o) => o.name === OEM_NAME);
  if (!oem) {
    throw new Error(
      `OEM "${OEM_NAME}" not found for tenant ${TENANT_SLUG} — run "pnpm db:seed" first`,
    );
  }

  const idempotencyKey = `mint-bench-${Date.now()}`;
  console.log(
    `Minting ${count.toLocaleString()} units for ${product.sku} / ${oem.name} (key ${idempotencyKey})...`,
  );

  const start = Date.now();
  const result = await postJson<BatchRow | JobModeResponse>(
    `/tenants/${TENANT_SLUG}/batches`,
    { productId: product.id, oemId: oem.id, count, idempotencyKey },
  );

  const batchId = isJobModeResponse(result) ? result.batch.id : result.id;
  if (isJobModeResponse(result)) {
    await pollJob(result.jobId);
  }

  const wallTimeMs = Date.now() - start;
  const finalBatch = await getJson<BatchRow>(
    `/tenants/${TENANT_SLUG}/batches/${batchId}`,
  );

  const rowsPerSec = count / (wallTimeMs / 1000);
  console.log('');
  console.log(`Batch:        ${batchId}`);
  console.log(`Status:       ${finalBatch.status}`);
  console.log(`Minted:       ${finalBatch.mintedCount} / ${finalBatch.count}`);
  console.log(`Wall time:    ${(wallTimeMs / 1000).toFixed(1)}s`);
  console.log(`Throughput:   ${rowsPerSec.toFixed(0)} rows/sec`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
