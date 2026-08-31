import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  type ProductPage,
  type ProductPageVersion,
  type Tenant,
} from '@prisma/client';
import { z } from 'zod';
import {
  blockSchema,
  normalizeSlug,
  seoSchema,
  themeOverrideSchema,
} from '@verifynng/page-schema';
import { EventsService } from '../../common/events.service';
import {
  PAGES_ENTITLEMENT_PORT,
  type PagesEntitlementPort,
} from './pages-entitlement.port';
import { signPreviewToken, verifyPreviewToken } from './preview-token';

const draftSchema = z.object({
  theme: themeOverrideSchema,
  blocks: z.array(blockSchema),
  seo: seoSchema,
});

interface PublishedResult {
  page: ProductPage;
  version: ProductPageVersion;
  tenant: Tenant;
}

interface DraftPreviewResult {
  page: ProductPage;
  tenant: Tenant;
}

@Injectable()
export class ProductPagesService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly events: EventsService,
    @Inject(PAGES_ENTITLEMENT_PORT)
    private readonly entitlement: PagesEntitlementPort,
  ) {}

  async list(tenantId: string): Promise<ProductPage[]> {
    return this.prisma.productPage.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string): Promise<ProductPage> {
    return this.getOwned(tenantId, id);
  }

  async create(
    tenantId: string,
    actorId: string,
    dto: { productId: string; slug: string },
  ): Promise<ProductPage> {
    const slug = normalizeSlug(dto.slug);
    if (!slug) throw new BadRequestException('slug_required');

    try {
      return await this.prisma.productPage.create({
        data: {
          tenantId,
          productId: dto.productId,
          slug,
          draftTheme: {},
          draftBlocks: [],
          draftSeo: {},
          createdById: actorId,
        },
      });
    } catch (e) {
      throw this.mapUniqueViolation(e);
    }
  }

  async saveDraft(
    tenantId: string,
    id: string,
    dto: { theme: unknown; blocks: unknown; seo: unknown },
    ifMatch?: string,
  ): Promise<ProductPage> {
    await this.getOwned(tenantId, id);

    const parsed = draftSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_page_schema',
        issues: parsed.error.issues,
      });
    }

    const where: Prisma.ProductPageWhereInput = { id, tenantId };
    if (ifMatch !== undefined) {
      const ifMatchDate = new Date(ifMatch);
      if (Number.isNaN(ifMatchDate.getTime())) {
        throw new BadRequestException('invalid_if_match');
      }
      where.draftUpdatedAt = ifMatchDate;
    }

    const result = await this.prisma.productPage.updateMany({
      where,
      data: {
        draftTheme: parsed.data.theme,
        draftBlocks: parsed.data.blocks,
        draftSeo: parsed.data.seo,
      },
    });
    if (result.count === 0) throw new ConflictException('draft_conflict');

    return this.getOwned(tenantId, id);
  }

  async publish(
    tenantId: string,
    id: string,
    actorId: string,
    changeNote?: string,
  ): Promise<ProductPageVersion> {
    const page = await this.getOwned(tenantId, id);

    const canPublish = await this.entitlement.canPublish(tenantId);
    if (!canPublish) throw new ForbiddenException('pages_not_entitled');

    const version = await this.createVersionAndPublish(
      tenantId,
      page,
      {
        schemaVersion: page.schemaVersion,
        theme: page.draftTheme as Prisma.InputJsonValue,
        blocks: page.draftBlocks as Prisma.InputJsonValue,
        seo: page.draftSeo as Prisma.InputJsonValue,
      },
      actorId,
      changeNote,
    );

    await this.emitPublished(tenantId, page, version, actorId);
    return version;
  }

  async rollback(
    tenantId: string,
    id: string,
    actorId: string,
    versionId: string,
  ): Promise<ProductPageVersion> {
    const page = await this.getOwned(tenantId, id);
    const target = await this.prisma.productPageVersion.findFirst({
      where: { id: versionId, productPageId: id, tenantId },
    });
    if (!target) throw new NotFoundException('version_not_found');

    const version = await this.createVersionAndPublish(
      tenantId,
      page,
      {
        schemaVersion: target.schemaVersion,
        theme: target.theme as Prisma.InputJsonValue,
        blocks: target.blocks as Prisma.InputJsonValue,
        seo: target.seo as Prisma.InputJsonValue,
      },
      actorId,
      `Rolled back to v${target.version}`,
      { alsoOverwriteDraft: true },
    );

    await this.emitPublished(tenantId, page, version, actorId);
    return version;
  }

  async listVersions(
    tenantId: string,
    id: string,
  ): Promise<ProductPageVersion[]> {
    await this.getOwned(tenantId, id);
    return this.prisma.productPageVersion.findMany({
      where: { productPageId: id, tenantId },
      orderBy: { version: 'desc' },
    });
  }

  async unpublish(tenantId: string, id: string): Promise<{ ok: true }> {
    const page = await this.getOwned(tenantId, id);
    await this.prisma.productPage.update({
      where: { id },
      data: { status: 'unpublished' },
    });
    await this.events.emit('product_page.unpublished', {
      tenantId,
      productPageId: id,
      productId: page.productId,
      at: new Date(),
    });
    return { ok: true };
  }

  async issuePreviewToken(
    tenantId: string,
    id: string,
    secret: string,
  ): Promise<{ token: string; expiresInSec: number }> {
    await this.getOwned(tenantId, id);
    return {
      token: signPreviewToken(id, secret),
      expiresInSec: 15 * 60,
    };
  }

  // ─── Public read side ─────────────────────────────────────────────────

  async resolveTenantBySlug(tenantSlug: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) throw new NotFoundException('tenant_not_found');
    if (tenant.status === 'offboarded') {
      throw new GoneException('tenant_offboarded');
    }
    // Suspended/restricted tenants keep their pages live — consumer-facing
    // surfaces must not break for a billing lapse.
    return tenant;
  }

  async getPublished(
    tenantSlug: string,
    productSlug: string,
  ): Promise<PublishedResult> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    const page = await this.prisma.productPage.findFirst({
      where: { tenantId: tenant.id, slug: productSlug },
    });
    if (!page || page.status === 'draft') {
      throw new NotFoundException('page_not_found');
    }
    if (page.status === 'unpublished' || !page.publishedVersionId) {
      throw new GoneException('page_unpublished');
    }
    const version = await this.prisma.productPageVersion.findUnique({
      where: { id: page.publishedVersionId },
    });
    if (!version) throw new NotFoundException('page_not_found');
    return { page, version, tenant };
  }

  async getForTier1(
    tenantSlug: string,
    productId: string,
  ): Promise<PublishedResult | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    const page = await this.prisma.productPage.findFirst({
      where: { tenantId: tenant.id, productId },
    });
    if (!page || page.status !== 'published' || !page.publishedVersionId) {
      return null;
    }
    const version = await this.prisma.productPageVersion.findUnique({
      where: { id: page.publishedVersionId },
    });
    if (!version) return null;
    return { page, version, tenant };
  }

  async getDraftPreview(
    tenantSlug: string,
    productSlug: string,
    token: string,
    secret: string,
  ): Promise<DraftPreviewResult> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    const page = await this.prisma.productPage.findFirst({
      where: { tenantId: tenant.id, slug: productSlug },
    });
    if (!page) throw new NotFoundException('page_not_found');
    if (!verifyPreviewToken(token, page.id, secret)) {
      throw new NotFoundException('page_not_found');
    }
    return { page, tenant };
  }

  async sitemap(
    tenantSlug: string,
  ): Promise<{ slug: string; lastmod: Date | null }[]> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    const pages = await this.prisma.productPage.findMany({
      where: { tenantId: tenant.id, status: 'published' },
      select: { slug: true, publishedAt: true },
    });
    return pages.map((p) => ({ slug: p.slug, lastmod: p.publishedAt }));
  }

  serializePublished(result: PublishedResult) {
    const { page, version, tenant } = result;
    return {
      schemaVersion: version.schemaVersion,
      theme: version.theme,
      blocks: version.blocks,
      seo: version.seo,
      meta: {
        productId: page.productId,
        tenantSlug: tenant.slug,
        productSlug: page.slug,
        status: page.status,
        version: version.version,
        publishedAt: page.publishedAt,
      },
    };
  }

  serializeDraftPreview(result: DraftPreviewResult) {
    const { page, tenant } = result;
    return {
      schemaVersion: page.schemaVersion,
      theme: page.draftTheme,
      blocks: page.draftBlocks,
      seo: page.draftSeo,
      meta: {
        productId: page.productId,
        tenantSlug: tenant.slug,
        productSlug: page.slug,
        status: page.status,
        draftUpdatedAt: page.draftUpdatedAt,
      },
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async getOwned(tenantId: string, id: string): Promise<ProductPage> {
    const page = await this.prisma.productPage.findFirst({
      where: { id, tenantId },
    });
    if (!page) throw new NotFoundException('product_page_not_found');
    return page;
  }

  private async createVersionAndPublish(
    tenantId: string,
    page: ProductPage,
    content: {
      schemaVersion: number;
      theme: Prisma.InputJsonValue;
      blocks: Prisma.InputJsonValue;
      seo: Prisma.InputJsonValue;
    },
    actorId: string,
    changeNote: string | undefined,
    opts: { alsoOverwriteDraft?: boolean } = {},
  ): Promise<ProductPageVersion> {
    const nextVersionNumber =
      (await this.prisma.productPageVersion.count({
        where: { productPageId: page.id },
      })) + 1;

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.productPageVersion.create({
        data: {
          tenantId,
          productPageId: page.id,
          version: nextVersionNumber,
          schemaVersion: content.schemaVersion,
          theme: content.theme,
          blocks: content.blocks,
          seo: content.seo,
          changeNote,
          publishedById: actorId,
        },
      });

      await tx.productPage.update({
        where: { id: page.id },
        data: {
          status: 'published',
          publishedVersionId: version.id,
          publishedAt: version.publishedAt,
          ...(opts.alsoOverwriteDraft
            ? {
                draftTheme: content.theme,
                draftBlocks: content.blocks,
                draftSeo: content.seo,
              }
            : {}),
        },
      });

      return version;
    });
  }

  private async emitPublished(
    tenantId: string,
    page: ProductPage,
    version: ProductPageVersion,
    actorId: string,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    await this.events.emit('product_page.published', {
      tenantId,
      productPageId: page.id,
      productId: page.productId,
      versionId: version.id,
      tenantSlug: tenant?.slug,
      productSlug: page.slug,
      publishedAt: version.publishedAt,
      publishedById: actorId,
    });
  }

  private mapUniqueViolation(e: unknown): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const target = e.meta?.target as string[] | undefined;
      if (target?.includes('productId')) {
        return new ConflictException('page_exists_for_product');
      }
      if (target?.some((t) => t.includes('slug'))) {
        return new ConflictException('duplicate_slug');
      }
    }
    return e as Error;
  }
}
