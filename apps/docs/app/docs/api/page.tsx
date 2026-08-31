import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'API' };

export default function ApiDocsPage() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

  return (
    <article className="prose">
      <h1>API</h1>
      <p>
        The full HTTP API reference (every route, request/response schema) is
        served live by the API itself, generated from the same decorators that
        validate requests — it can never drift from what the API actually
        accepts.
      </p>
      <p>
        <a href={`${apiBaseUrl}/api/docs`} target="_blank" rel="noreferrer">
          Open the interactive API reference →
        </a>
      </p>
      <h2>SDK quick start</h2>
      <p>
        There is no generated SDK yet. Until one exists, call the API directly:
      </p>
      <pre>
        <code>{`curl ${apiBaseUrl}/v1/verify/<code>`}</code>
      </pre>
      <p>
        Public routes (like <code>/v1/verify/:code</code> and{' '}
        <code>/v1/public/support</code>) need no authentication. Tenant and
        platform routes need a bearer token from <code>/auth/login</code> — see
        the interactive reference above for the exact request/response shape of
        every route.
      </p>
    </article>
  );
}
