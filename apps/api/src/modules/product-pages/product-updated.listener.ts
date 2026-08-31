import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProductPagesService } from './product-pages.service';

interface ProductUpdatedPayload {
  tenantId: string;
  productId: string;
}

/**
 * Revalidates a product's published page when E04 changes the product it
 * reads at request time (e.g. name) — otherwise the page would keep serving
 * stale content until the 300s ISR fallback.
 */
@Injectable()
export class ProductUpdatedListener {
  private readonly logger = new Logger(ProductUpdatedListener.name);

  constructor(private readonly pages: ProductPagesService) {}

  @OnEvent('product.updated')
  async onProductUpdated(payload: ProductUpdatedPayload): Promise<void> {
    if (!payload?.tenantId || !payload?.productId) return;
    try {
      await this.pages.revalidateByProductId(
        payload.tenantId,
        payload.productId,
      );
    } catch (err) {
      this.logger.warn(
        `revalidateByProductId failed for ${payload.productId}: ${(err as Error).message}`,
      );
    }
  }
}
