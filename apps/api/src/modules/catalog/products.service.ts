import {
  Injectable,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { PrismaClient, Product, Prisma } from '@prisma/client';
import { EventsService } from '../../common/events.service';

/**
 * Validate a GTIN check digit (GS1 mod-10).
 * Accepts GTIN-8, GTIN-12, GTIN-13, GTIN-14.
 * Returns true if valid, false otherwise.
 */
export function validateGtin(gtin: string): boolean {
  const digits = gtin;
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return false;
  const len = digits.length;
  let sum = 0;
  for (let i = 0; i < len - 1; i++) {
    const d = parseInt(digits[i], 10);
    const weight = (len - 1 - i) % 2 === 0 ? 1 : 3;
    sum += d * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[len - 1], 10);
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private events: EventsService,
  ) {}

  async list(tenantId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, productId: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(
    tenantId: string,
    dto: {
      sku: string;
      name: string;
      gtin?: string;
      description?: string;
      category?: string;
    },
  ): Promise<Product> {
    const sku = dto.sku.trim();
    const name = dto.name.trim();
    const gtin = dto.gtin || undefined;

    if (gtin) {
      if (!validateGtin(gtin)) {
        throw new ConflictException({
          statusCode: 409,
          message: 'gtin_check_digit',
        });
      }
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          tenantId,
          sku,
          name,
          gtin,
          description: dto.description,
          category: dto.category,
        },
      });
      await this.events.emit('product.created', {
        tenantId,
        productId: product.id,
        sku: product.sku,
        gtin: product.gtin ?? undefined,
        at: new Date(),
      });
      return product;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = e.meta?.target as string[] | undefined;
        if (target?.includes('sku'))
          throw new ConflictException('duplicate_sku');
        if (target?.includes('gtin'))
          throw new ConflictException('duplicate_gtin');
      }
      throw e;
    }
  }

  async update(
    tenantId: string,
    productId: string,
    dto: {
      sku?: string;
      name?: string;
      gtin?: string;
      description?: string;
      category?: string;
    },
  ): Promise<Product> {
    await this.get(tenantId, productId);
    const data: Record<string, unknown> = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.gtin !== undefined) {
      const gtin = dto.gtin;
      if (gtin === '') {
        data.gtin = null;
      } else {
        if (!validateGtin(gtin)) {
          throw new ConflictException({
            statusCode: 409,
            message: 'gtin_check_digit',
          });
        }
        data.gtin = gtin;
      }
    }

    try {
      const product = await this.prisma.product.update({
        where: { id: productId },
        data,
      });
      await this.events.emit('product.updated', {
        tenantId,
        productId,
        changed: Object.keys(data),
        at: new Date(),
      });
      return product;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = e.meta?.target as string[] | undefined;
        if (target?.includes('sku'))
          throw new ConflictException('duplicate_sku');
        if (target?.includes('gtin'))
          throw new ConflictException('duplicate_gtin');
      }
      throw e;
    }
  }

  async archive(tenantId: string, productId: string): Promise<Product> {
    await this.get(tenantId, productId);
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { archivedAt: new Date() },
    });
    await this.events.emit('product.updated', {
      tenantId,
      productId,
      changed: ['archivedAt'],
      at: new Date(),
    });
    return product;
  }
}
