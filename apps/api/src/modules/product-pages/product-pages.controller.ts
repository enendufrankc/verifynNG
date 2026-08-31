import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles, TenantId } from '../../common/tenant';
import { Audited } from '../audit/audited.decorator';
import type { AuthenticatedRequest } from '../../common/authenticated-request';
import { ProductPagesService } from './product-pages.service';
import { CreateProductPageDto } from './dto/create-product-page.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { PublishDto } from './dto/publish.dto';
import { RollbackDto } from './dto/rollback.dto';

@Controller('v1/product-pages')
export class ProductPagesController {
  constructor(
    private readonly pages: ProductPagesService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string) {
    return this.pages.list(tenantId);
  }

  @Post()
  @Roles('operator')
  @HttpCode(HttpStatus.CREATED)
  create(
    @TenantId() tenantId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateProductPageDto,
  ) {
    return this.pages.create(tenantId, req.user!.userId!, dto);
  }

  @Get(':id')
  @Roles('viewer')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.pages.get(tenantId, id);
  }

  @Put(':id/draft')
  @Roles('operator')
  saveDraft(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.pages.saveDraft(tenantId, id, dto, ifMatch);
  }

  @Post(':id/publish')
  @Roles('operator')
  @Audited('product_page.published', {
    target: (req) => ({ type: 'product_page', id: String(req.params.id) }),
  })
  publish(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: PublishDto,
  ) {
    return this.pages.publish(tenantId, id, req.user!.userId!, dto.changeNote);
  }

  @Post(':id/rollback')
  @Roles('operator')
  @Audited('product_page.rolled_back', {
    target: (req) => ({ type: 'product_page', id: String(req.params.id) }),
  })
  rollback(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: RollbackDto,
  ) {
    return this.pages.rollback(tenantId, id, req.user!.userId!, dto.versionId);
  }

  @Get(':id/versions')
  @Roles('viewer')
  listVersions(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.pages.listVersions(tenantId, id);
  }

  @Get(':id/preview-token')
  @Roles('viewer')
  previewToken(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.pages.issuePreviewToken(
      tenantId,
      id,
      this.config.get<string>('PAGE_REVALIDATE_SECRET')!,
    );
  }

  @Delete(':id')
  @Roles('owner')
  @Audited('product_page.deleted', {
    target: (req) => ({ type: 'product_page', id: String(req.params.id) }),
  })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.pages.unpublish(tenantId, id);
  }
}
