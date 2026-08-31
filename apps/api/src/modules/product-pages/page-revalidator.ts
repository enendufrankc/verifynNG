import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export interface RevalidateTarget {
  tenantSlug: string;
  productSlug: string;
  tenantId?: string;
  productId?: string;
}

/**
 * Calls web-verify's `POST /p/revalidate` so a publish/rollback/unpublish is
 * visible within seconds (AC4/AC5) instead of waiting on the 300s ISR
 * fallback. Never throws — a revalidation failure must not fail the write
 * that triggered it; the 300s fallback still catches it eventually.
 */
@Injectable()
export class PageRevalidator {
  private readonly logger = new Logger(PageRevalidator.name);

  constructor(private readonly config: ConfigService) {}

  async revalidate(target: RevalidateTarget): Promise<void> {
    const secret = this.config.get<string>('PAGE_REVALIDATE_SECRET')!;
    const baseUrl = this.config.get<string>('PAGES_PUBLIC_BASE_URL')!;
    const ts = Date.now();
    const sig = createHmac('sha256', secret)
      .update(`${target.tenantSlug}.${target.productSlug}.${ts}`)
      .digest('hex');

    try {
      const res = await fetch(`${baseUrl}/p/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, ts, sig }),
      });
      if (!res.ok) {
        this.logger.warn(
          `revalidate ${target.tenantSlug}/${target.productSlug} returned ${res.status}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `revalidate ${target.tenantSlug}/${target.productSlug} failed: ${(err as Error).message}`,
      );
    }
  }
}
