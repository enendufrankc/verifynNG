import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:10751';
    try {
      const res = await fetch(`${s3Endpoint}/minio/health/live`, {
        signal: AbortSignal.timeout(3000),
      });
      const isOk = res.ok || res.status === 403 || res.status === 200;
      return this.getStatus(key, isOk);
    } catch {
      // Fallback: check basic S3 port reachability
      try {
        const url = new URL(s3Endpoint);
        const res = await fetch(url.origin, {
          signal: AbortSignal.timeout(2000),
        });
        return this.getStatus(key, res.status < 500);
      } catch {
        return this.getStatus(key, false, {
          message: 'MinIO storage unreachable',
        });
      }
    }
  }
}
