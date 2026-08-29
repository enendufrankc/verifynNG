import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { OemsController } from './oems.controller';
import { ProductsService } from './products.service';
import { OemsService } from './oems.service';

@Module({
  controllers: [ProductsController, OemsController],
  providers: [ProductsService, OemsService],
  exports: [ProductsService, OemsService],
})
export class CatalogModule {}
