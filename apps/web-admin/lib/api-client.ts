import { useAuthStore } from './auth-store';

interface ApiErrorBody {
  code?: string;
  // Nest's default exception filter puts a custom payload passed to an
  // exception constructor (e.g. `new ConflictException({code, unmet})`)
  // under `message` as an object, not a string — so this has to accept both.
  message?: string | Record<string, unknown>;
  details?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }>,
    /** The raw structured `message` payload when the API sent an object
     * instead of a string (e.g. `{ code: 'enforce_sso_preconditions_unmet', unmet: [...] }`). */
    public payload?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function normalizeErrorBody(body: ApiErrorBody): {
  code: string;
  message: string;
  payload?: Record<string, unknown>;
} {
  if (body.message && typeof body.message === 'object') {
    const payload = body.message;
    const code = (payload.code as string | undefined) ?? body.code ?? 'UNKNOWN';
    return { code, message: code, payload };
  }
  return {
    code: body.code ?? 'UNKNOWN',
    message: (body.message as string | undefined) ?? 'Request failed',
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** A void-returning handler (e.g. most DELETE routes) sends a 200/204 with no body — `res.json()` throws on that. */
async function parseJsonBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });
      if (!res.ok) {
        useAuthStore.getState().clear();
        return null;
      }
      const data = (await res.json()) as { accessToken: string };
      useAuthStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      useAuthStore.getState().clear();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    query?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const url = new URL(path, API_BASE);
  if (options?.query)
    Object.entries(options.query).forEach(([k, v]) =>
      url.searchParams.set(k, v),
    );
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: options?.signal,
      });
      if (!retry.ok) {
        const err: ApiErrorBody = await retry.json().catch(() => ({}));
        const normalized = normalizeErrorBody(err);
        throw new ApiError(
          retry.status,
          normalized.code,
          normalized.message || retry.statusText,
          err.details,
          normalized.payload,
        );
      }
      return parseJsonBody<T>(retry);
    }
    throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
  }
  if (!res.ok) {
    const err: ApiErrorBody = await res.json().catch(() => ({}));
    const normalized = normalizeErrorBody(err);
    throw new ApiError(
      res.status,
      normalized.code,
      normalized.message || res.statusText,
      err.details,
      normalized.payload,
    );
  }
  return parseJsonBody<T>(res);
}

export const apiClient = {
  get: <T>(
    path: string,
    opts?: { query?: Record<string, string>; signal?: AbortSignal },
  ) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>('POST', path, { body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>('PATCH', path, { body, ...opts }),
  put: <T>(path: string, body?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>('PUT', path, { body, ...opts }),
  delete: <T>(path: string, opts?: { signal?: AbortSignal }) =>
    request<T>('DELETE', path, opts),
};
