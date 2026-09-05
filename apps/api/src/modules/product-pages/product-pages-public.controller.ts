import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../../common/tenant';
import { ProductPagesService } from './product-pages.service';

const PUBLISHED_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=86400';

@Controller('v1/public/pages')
@Public()
export class ProductPagesPublicController {
  constructor(
    private readonly pages: ProductPagesService,
    private readonly config: ConfigService,
  ) {}

  // Declared before the two-segment `:tenantSlug/:productSlug` route below so
  // the literal "sitemap" segment wins over it for that shape.
  @Get(':tenantSlug/sitemap')
  sitemap(@Param('tenantSlug') tenantSlug: string) {
    return this.pages.sitemap(tenantSlug);
  }

  @Get('tier1/:tenantSlug/:productId')
  async tier1(
    @Param('tenantSlug') tenantSlug: string,
    @Param('productId') productId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.pages.getForTier1(tenantSlug, productId);
    if (!result) throw new NotFoundException('page_not_found');
    res.setHeader('Cache-Control', PUBLISHED_CACHE_CONTROL);
    return this.pages.serializePublished(result);
  }

  @Get(':tenantSlug/:productSlug')
  async getPage(
    @Param('tenantSlug') tenantSlug: string,
    @Param('productSlug') productSlug: string,
    @Res({ passthrough: true }) res: Response,
    @Query('preview') preview?: string,
  ) {
    if (preview) {
      const secret = this.config.get<string>('PAGE_REVALIDATE_SECRET')!;
      const result = await this.pages.getDraftPreview(
        tenantSlug,
        productSlug,
        preview,
        secret,
      );
      res.setHeader('Cache-Control', 'no-store');
      return this.pages.serializeDraftPreview(result);
    }

    const result = await this.pages.getPublished(tenantSlug, productSlug);
    res.setHeader('Cache-Control', PUBLISHED_CACHE_CONTROL);
    return this.pages.serializePublished(result);
  }
}
