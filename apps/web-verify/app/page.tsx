export const dynamic = 'force-dynamic';

interface HealthDetails {
  [key: string]: { status: string };
}

interface HealthResponse {
  status: string;
  details?: HealthDetails;
}

async function getHealthStatus(): Promise<HealthResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/health`);
    return (await res.json()) as HealthResponse;
  } catch {
    return { status: 'error' };
  }
}

export default async function Home() {
  const health = await getHealthStatus();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">Verify</h1>
      <p className="mt-4 text-lg text-gray-600">
        Product authenticity verification
      </p>
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-500">API Status</p>
        <p className="mt-1 text-2xl font-semibold">
          {health.status === 'ok' ? '✓ OK' : '✗ Down'}
        </p>
        {health.details && (
          <div className="mt-3 space-y-1 text-sm text-gray-500">
            {Object.entries(health.details).map(([key, val]) => (
              <p key={key}>
                {key}:{' '}
                <span
                  className={
                    val.status === 'up'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {val.status}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
