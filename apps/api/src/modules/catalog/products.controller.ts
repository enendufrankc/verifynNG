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

@Controller('tenants/:tenantId/products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.productsService.list(tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(tenantId, dto);
  }

  @Get(':productId')
  get(@TenantId() tenantId: string, @Param('productId') productId: string) {
    return this.productsService.get(tenantId, productId);
  }

  @Patch(':productId')
  update(
    @TenantId() tenantId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, productId, dto);
  }

  @Post(':productId/archive')
  archive(@TenantId() tenantId: string, @Param('productId') productId: string) {
    return this.productsService.archive(tenantId, productId);
  }
}
