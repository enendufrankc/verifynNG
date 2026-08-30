import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('tenants/:tenantId/products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string) {
    return this.productsService.list(tenantId);
  }

  @Post()
  @Roles('operator')
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(tenantId, dto);
  }

  @Get(':productId')
  @Roles('viewer')
  get(@TenantId() tenantId: string, @Param('productId') productId: string) {
    return this.productsService.get(tenantId, productId);
  }

  @Patch(':productId')
  @Roles('operator')
  update(
    @TenantId() tenantId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, productId, dto);
  }

  @Post(':productId/archive')
  @Roles('owner')
  archive(@TenantId() tenantId: string, @Param('productId') productId: string) {
    return this.productsService.archive(tenantId, productId);
  }
}
