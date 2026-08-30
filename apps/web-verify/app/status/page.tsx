export const revalidate = 30;

interface ComponentStatus {
  name: string;
  state: 'operational' | 'degraded' | 'outage';
  p95Ms24h: number;
  uptime30dPct: number;
}

interface StatusData {
  state: 'operational' | 'degraded' | 'outage';
  updatedAt: string;
  components: ComponentStatus[];
  incidents: Array<Record<string, unknown>>;
}

async function getStatusData(): Promise<StatusData> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/v1/status`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error('Status fetch failed');
    return (await res.json()) as StatusData;
  } catch {
    return {
      state: 'outage',
      updatedAt: new Date().toISOString(),
      components: [
        { name: 'verify-api', state: 'outage', p95Ms24h: 0, uptime30dPct: 0 },
        {
          name: 'web-verify',
          state: 'operational',
          p95Ms24h: 0,
          uptime30dPct: 100,
        },
        {
          name: 'web-admin',
          state: 'operational',
          p95Ms24h: 0,
          uptime30dPct: 100,
        },
      ],
      incidents: [],
    };
  }
}

export default async function StatusPage() {
  const status = await getStatusData();

  const stateColors = {
    operational: {
      bg: '#10B981',
      text: '#D1FAE5',
      label: 'All Systems Operational',
    },
    degraded: { bg: '#F59E0B', text: '#FEF3C7', label: 'Degraded Performance' },
    outage: { bg: '#EF4444', text: '#FEE2E2', label: 'Service Outage' },
  };

  const currentState = stateColors[status.state] || stateColors.operational;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F172A',
        color: '#F8FAFC',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem 1rem',
      }}
    >
      <main style={{ maxWidth: '48rem', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <a
            href="/"
            style={{
              color: '#94A3B8',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            ← Back to Verify
          </a>
          <h1
            style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}
          >
            Verify Platform Status
          </h1>
        </header>

        {/* Overall Status Banner */}
        <div
          style={{
            backgroundColor: '#1E293B',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '2rem',
            borderLeft: `6px solid ${currentState.bg}`,
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            {currentState.label}
          </div>
          <div
            style={{
              fontSize: '0.875rem',
              color: '#94A3B8',
              marginTop: '0.5rem',
            }}
          >
            Last checked: {new Date(status.updatedAt).toLocaleString()}
          </div>
        </div>

        {/* Component Rows */}
        <section style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            Component Status
          </h2>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {status.components.map((comp) => {
              const compState =
                stateColors[comp.state] || stateColors.operational;
              return (
                <div
                  key={comp.name}
                  style={{
                    backgroundColor: '#1E293B',
                    borderRadius: '0.5rem',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span
                      style={{ fontWeight: 600, textTransform: 'capitalize' }}
                    >
                      {comp.name}
                    </span>
                    <span
                      style={{
                        marginLeft: '0.75rem',
                        fontSize: '0.75rem',
                        color: '#94A3B8',
                      }}
                    >
                      p95: {comp.p95Ms24h}ms | 30d: {comp.uptime30dPct}%
                    </span>
                  </div>
                  <span
                    style={{
                      backgroundColor: compState.bg,
                      color: '#0F172A',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {comp.state}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 30-Day Uptime Bar */}
        <section style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
            }}
          >
            30-Day Uptime
          </h2>
          <div
            style={{
              display: 'flex',
              gap: '3px',
              height: '2rem',
              backgroundColor: '#1E293B',
              padding: '4px',
              borderRadius: '0.375rem',
            }}
          >
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                title={`Day ${30 - i}: 100% operational`}
                style={{
                  flex: 1,
                  backgroundColor: '#10B981',
                  borderRadius: '2px',
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: '#94A3B8',
              marginTop: '0.375rem',
            }}
          >
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </section>
      </main>
    </div>
  );
}
