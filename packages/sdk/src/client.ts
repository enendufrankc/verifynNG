import createOpenApiClient from 'openapi-fetch';
import { randomUUID } from 'node:crypto';
import type { components, paths } from './types.gen.js';
import { VerifyNGApiError, type ApiErrorBody } from './errors.js';
import { paginateAll, type CursorPage } from './pagination.js';

export type Batch = components['schemas']['BatchResponseDto'];
export type Unit = components['schemas']['UnitResponseDto'];
export type ScanEvent = components['schemas']['ScanEventResponseDto'];
export type Report = components['schemas']['ReportResponseDto'];
export type Me = components['schemas']['MeResponseDto'];

export interface CreateClientOptions {
  /** A `vk_live_…` or `vk_test_…` key created in the console. */
  apiKey: string;
  /** e.g. `http://localhost:4000` in compose. */
  baseUrl: string;
  /** Override the underlying fetch implementation (tests, non-global-fetch runtimes). */
  fetch?: typeof globalThis.fetch;
}

export interface ListBatchesQuery {
  cursor?: string;
  limit?: number;
  productId?: string;
  status?: string;
}

export interface ListBatchUnitsQuery {
  cursor?: string;
  limit?: number;
  state?: string;
}

export interface ListScansQuery {
  cursor?: string;
  limit?: number;
  batchId?: string;
  unitId?: string;
  verdict?: string;
  from?: string;
  to?: string;
}

export interface ListReportsQuery {
  cursor?: string;
  limit?: number;
  status?: string;
}

export interface CreateBatchInput {
  productId: string;
  oemId: string;
  count: number;
  note?: string;
}

async function unwrap<T>(result: {
  data?: T;
  error?: ApiErrorBody | { error: ApiErrorBody };
  response: Response;
}): Promise<T> {
  if (result.data !== undefined) return result.data;
  const body = result.error as { error?: ApiErrorBody } | undefined;
  const errorBody = body?.error ?? {
    type: 'internal',
    message: 'Unknown error',
    docs: '',
  };
  throw new VerifyNGApiError(result.response.status, errorBody);
}

function toQuery<T extends object | undefined>(query: T) {
  if (!query) return undefined;
  const entries = Object.entries(query).filter(([, v]) => v !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function createClient(options: CreateClientOptions) {
  const api = createOpenApiClient<paths>({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
  });

  // Auto-Idempotency-Key covers any future POST route the resource helpers
  // below don't yet model explicitly; routes with a required Idempotency-Key
  // *parameter* (batches.create) also pass it through `params.header` so
  // openapi-fetch's generated types are satisfied.
  api.use({
    onRequest({ request }) {
      request.headers.set('Authorization', `Bearer ${options.apiKey}`);
      if (
        request.method === 'POST' &&
        !request.headers.has('Idempotency-Key')
      ) {
        request.headers.set('Idempotency-Key', randomUUID());
      }
      return request;
    },
  });

  const batches = {
    async list(query?: ListBatchesQuery): Promise<CursorPage<Batch>> {
      return unwrap(
        await api.GET('/api/v1/batches', {
          params: { query: toQuery(query) },
        }),
      );
    },
    listAll(query?: Omit<ListBatchesQuery, 'cursor'>) {
      return paginateAll<Batch>((cursor) => batches.list({ ...query, cursor }));
    },
    async get(id: string): Promise<Batch> {
      return unwrap(
        await api.GET('/api/v1/batches/{id}', { params: { path: { id } } }),
      );
    },
    async create(
      body: CreateBatchInput,
      idempotencyKey: string = randomUUID(),
    ): Promise<components['schemas']['CreateBatchResponseDto']> {
      return unwrap(
        await api.POST('/api/v1/batches', {
          params: { header: { 'Idempotency-Key': idempotencyKey } },
          body,
        }),
      );
    },
    async units(
      id: string,
      query?: ListBatchUnitsQuery,
    ): Promise<CursorPage<Unit>> {
      return unwrap(
        await api.GET('/api/v1/batches/{id}/units', {
          params: { path: { id }, query: toQuery(query) },
        }),
      );
    },
  };

  const units = {
    async get(id: string): Promise<Unit> {
      return unwrap(
        await api.GET('/api/v1/units/{id}', { params: { path: { id } } }),
      );
    },
    async flag(id: string, body: { reason: string }): Promise<Unit> {
      return unwrap(
        await api.POST('/api/v1/units/{id}/flag', {
          params: { path: { id } },
          body,
        }),
      );
    },
    async decommission(id: string, body: { reason: string }): Promise<Unit> {
      return unwrap(
        await api.POST('/api/v1/units/{id}/decommission', {
          params: { path: { id } },
          body,
        }),
      );
    },
    async restore(id: string, body: { reason: string }): Promise<Unit> {
      return unwrap(
        await api.POST('/api/v1/units/{id}/restore', {
          params: { path: { id } },
          body,
        }),
      );
    },
  };

  const scans = {
    async list(query?: ListScansQuery): Promise<CursorPage<ScanEvent>> {
      return unwrap(
        await api.GET('/api/v1/scans', { params: { query: toQuery(query) } }),
      );
    },
    listAll(query?: Omit<ListScansQuery, 'cursor'>) {
      return paginateAll<ScanEvent>((cursor) =>
        scans.list({ ...query, cursor }),
      );
    },
  };

  const reports = {
    async list(query?: ListReportsQuery): Promise<CursorPage<Report>> {
      return unwrap(
        await api.GET('/api/v1/reports', {
          params: { query: toQuery(query) },
        }),
      );
    },
    listAll(query?: Omit<ListReportsQuery, 'cursor'>) {
      return paginateAll<Report>((cursor) =>
        reports.list({ ...query, cursor }),
      );
    },
    async get(id: string): Promise<Report> {
      return unwrap(
        await api.GET('/api/v1/reports/{id}', { params: { path: { id } } }),
      );
    },
  };

  return {
    api,
    me: async (): Promise<Me> => unwrap(await api.GET('/api/v1/me', {})),
    batches,
    units,
    scans,
    reports,
  };
}

export type VerifyNGClient = ReturnType<typeof createClient>;
