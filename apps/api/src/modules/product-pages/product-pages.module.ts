import { Module } from '@nestjs/common';
import { ProductPagesController } from './product-pages.controller';
import { ProductPagesPublicController } from './product-pages-public.controller';
import { ProductPagesService } from './product-pages.service';
import { PageMediaService } from './page-media.service';
import { PagesS3Service } from './pages-s3.service';
import {
  PAGES_ENTITLEMENT_PORT,
  DefaultPagesEntitlementPort,
} from './pages-entitlement.port';

@Module({
  controllers: [ProductPagesController, ProductPagesPublicController],
  providers: [
    ProductPagesService,
    PageMediaService,
    PagesS3Service,
    { provide: PAGES_ENTITLEMENT_PORT, useClass: DefaultPagesEntitlementPort },
  ],
  exports: [ProductPagesService, PageMediaService],
})
export class ProductPagesModule {}
