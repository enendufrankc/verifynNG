import { Writable } from 'stream';

interface LokiEntry {
  tsNs: string;
  line: string;
  level: string;
}

/**
 * Pino destination that tees every log line to stdout (so `docker compose
 * logs api` keeps working) and batches it to Loki's push API so lines are
 * queryable in Grafana and correlated to traces via the `traceId` field.
 * Push failures are swallowed — Loki being down must never crash the API.
 */
export class LokiStream extends Writable {
  private buffer: LokiEntry[] = [];
  private readonly flushTimer: NodeJS.Timeout;

  constructor(
    private readonly lokiUrl: string,
    private readonly serviceName: string,
    flushIntervalMs = 2000,
  ) {
    super();
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => undefined);
    }, flushIntervalMs);
    this.flushTimer.unref();
  }

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ) {
    const line = chunk.toString();
    process.stdout.write(line.endsWith('\n') ? line : `${line}\n`);

    try {
      const parsed = JSON.parse(line) as { time?: number; level?: string };
      const tsNs = String(BigInt(parsed.time ?? Date.now()) * 1_000_000n);
      this.buffer.push({
        tsNs,
        line,
        level: parsed.level || 'info',
      });
    } catch {
      // non-JSON line — skip shipping to Loki, stdout already has it
    }

    callback();
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0, this.buffer.length);

    const groups = new Map<string, LokiEntry[]>();
    for (const entry of entries) {
      const key = entry.level;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const streams = Array.from(groups.entries()).map(([level, es]) => ({
      stream: { service: this.serviceName, level },
      values: es.map((e) => [e.tsNs, e.line]),
    }));

    await fetch(`${this.lokiUrl}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streams }),
    }).catch(() => undefined);
  }
}
