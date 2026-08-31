import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { ConfigService } from '@nestjs/config';
import { EventsService } from '../../common/events.service';
import { ProductPagesService } from './product-pages.service';
import type { PagesEntitlementPort } from './pages-entitlement.port';
import { verifyPreviewToken } from './preview-token';
import { PageRevalidator } from './page-revalidator';

const SECRET = 'test-preview-secret';

describe('ProductPagesService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let events: EventsService;
  let tenantId: string;
  let tenantSlug: string;
  let productId: string;

  beforeAll(async () => {
    const result = await createTestDatabase('product-pages-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    tenantSlug = 'product-pages-integration-tenant';
    const tenant = await prisma.tenant.create({
      data: { slug: tenantSlug, name: 'Product Pages Integration Tenant' },
    });
    tenantId = tenant.id;

    const product = await prisma.product.create({
      data: { tenantId, sku: 'SKU-1', name: 'Turmeric & Curcumin' },
    });
    productId = product.id;

    events = new EventsService(new EventEmitter2());
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  function newService(entitled = true): ProductPagesService {
    const entitlement: PagesEntitlementPort = {
      canPublish: async () => entitled,
    };
    const revalidator = new PageRevalidator(
      new ConfigService({
        PAGE_REVALIDATE_SECRET: SECRET,
        // Deliberately unreachable — PageRevalidator swallows failures, so
        // these tests exercise the "revalidate call attempted, didn't blow
        // up the write" path without needing web-verify running.
        WEB_VERIFY_INTERNAL_URL: 'http://127.0.0.1:1',
      }),
    );
    return new ProductPagesService(prisma, events, revalidator, entitlement);
  }

  it('creates a draft page and enforces tenant-unique slug', async () => {
    const service = newService();
    const page = await service.create(tenantId, 'user-1', {
      productId,
      slug: 'Turmeric & Curcumin',
    });

    expect(page.status).toBe('draft');
    expect(page.slug).toBe('turmeric-curcumin');

    const otherProduct = await prisma.product.create({
      data: { tenantId, sku: 'SKU-2', name: 'Vitamin C' },
    });
    await expect(
      service.create(tenantId, 'user-1', {
        productId: otherProduct.id,
        slug: 'Turmeric & Curcumin',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a second page for the same product', async () => {
    const service = newService();
    await expect(
      service.create(tenantId, 'user-1', { productId, slug: 'another-slug' }),
    ).rejects.toThrow(ConflictException);
  });

  it('draft save rejects a malformed block and accepts a valid one', async () => {
    const service = newService();
    const page = await service.create(tenantId, 'user-1', {
      productId: (
        await prisma.product.create({
          data: { tenantId, sku: 'SKU-3', name: 'Retinol' },
        })
      ).id,
      slug: 'retinol',
    });

    await expect(
      service.saveDraft(tenantId, page.id, {
        theme: {},
        blocks: [{ id: 'b1', type: 'hero' }],
        seo: {},
      }),
    ).rejects.toThrow();

    const updated = await service.saveDraft(tenantId, page.id, {
      theme: { palette: { primary: '#C08A2D' } },
      blocks: [
        {
          id: 'b1',
          type: 'story',
          heading: 'Our story',
          paragraphs: ['Since 2020.'],
        },
      ],
      seo: { title: 'Retinol' },
    });

    expect(updated.draftBlocks).toEqual([
      {
        id: 'b1',
        type: 'story',
        heading: 'Our story',
        paragraphs: ['Since 2020.'],
      },
    ]);
  });

  it('rejects a stale If-Match with a conflict', async () => {
    const service = newService();
    const page = await service.create(tenantId, 'user-1', {
      productId: (
        await prisma.product.create({
          data: { tenantId, sku: 'SKU-4', name: 'Kojic Soap' },
        })
      ).id,
      slug: 'kojic-soap',
    });
    const staleIfMatch = page.draftUpdatedAt.toISOString();

    await service.saveDraft(tenantId, page.id, {
      theme: {},
      blocks: [],
      seo: { title: 'v1' },
    });

    await expect(
      service.saveDraft(
        tenantId,
        page.id,
        { theme: {}, blocks: [], seo: { title: 'v2' } },
        staleIfMatch,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('denies publish when the entitlement port refuses', async () => {
    const service = newService(false);
    const page = await service.create(tenantId, 'user-1', {
      productId: (
        await prisma.product.create({
          data: { tenantId, sku: 'SKU-5', name: 'Not Entitled' },
        })
      ).id,
      slug: 'not-entitled',
    });
    await expect(service.publish(tenantId, page.id, 'user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('publishes, versions, tenant-isolates reads, and rolls back', async () => {
    const service = newService();
    const lifecycleProduct = await prisma.product.create({
      data: { tenantId, sku: 'SKU-LIFECYCLE', name: 'Lifecycle Product' },
    });
    const page = await service.create(tenantId, 'user-1', {
      productId: lifecycleProduct.id,
      slug: 'lifecycle-page',
    });

    await service.saveDraft(tenantId, page.id, {
      theme: {},
      blocks: [],
      seo: { title: 'v1 title' },
    });
    const v1 = await service.publish(
      tenantId,
      page.id,
      'user-1',
      'first publish',
    );
    expect(v1.version).toBe(1);

    await service.saveDraft(tenantId, page.id, {
      theme: {},
      blocks: [],
      seo: { title: 'v2 title' },
    });
    const v2 = await service.publish(
      tenantId,
      page.id,
      'user-1',
      'second publish',
    );
    expect(v2.version).toBe(2);

    const published = await service.getPublished(tenantSlug, 'lifecycle-page');
    expect(published.version.version).toBe(2);
    expect((published.version.seo as { title: string }).title).toBe('v2 title');

    const otherTenant = await prisma.tenant.create({
      data: { slug: 'other-tenant', name: 'Other Tenant' },
    });
    await expect(service.get(otherTenant.id, page.id)).rejects.toThrow(
      NotFoundException,
    );

    const rolledBack = await service.rollback(
      tenantId,
      page.id,
      'user-1',
      v1.id,
    );
    expect(rolledBack.version).toBe(3);
    expect(rolledBack.changeNote).toBe('Rolled back to v1');

    const afterRollback = await service.getPublished(
      tenantSlug,
      'lifecycle-page',
    );
    expect((afterRollback.version.seo as { title: string }).title).toBe(
      'v1 title',
    );

    // Version rows are immutable — v1 and v2 remain untouched.
    const v1Reloaded = await prisma.productPageVersion.findUniqueOrThrow({
      where: { id: v1.id },
    });
    expect((v1Reloaded.seo as { title: string }).title).toBe('v1 title');
  });

  it('unpublishing returns 410 for public reads', async () => {
    const service = newService();
    const page = await service.create(tenantId, 'user-1', {
      productId: (
        await prisma.product.create({
          data: { tenantId, sku: 'SKU-6', name: 'Unpublish Me' },
        })
      ).id,
      slug: 'unpublish-me',
    });
    await service.publish(tenantId, page.id, 'user-1');
    await service.unpublish(tenantId, page.id);

    await expect(
      service.getPublished(tenantSlug, 'unpublish-me'),
    ).rejects.toThrow(GoneException);
  });

  it('offboarded tenants return 410 on every public page', async () => {
    const service = newService();
    const offboarded = await prisma.tenant.create({
      data: {
        slug: 'offboarded-tenant',
        name: 'Offboarded Tenant',
        status: 'offboarded',
      },
    });
    await expect(
      service.getPublished(offboarded.slug, 'anything'),
    ).rejects.toThrow(GoneException);
  });

  it('draft preview tokens verify by page id and reject tampering', async () => {
    const service = newService();
    const page = await service.create(tenantId, 'user-1', {
      productId: (
        await prisma.product.create({
          data: { tenantId, sku: 'SKU-7', name: 'Preview Me' },
        })
      ).id,
      slug: 'preview-me',
    });
    await service.saveDraft(tenantId, page.id, {
      theme: {},
      blocks: [],
      seo: { title: 'draft only' },
    });

    const { token } = await service.issuePreviewToken(
      tenantId,
      page.id,
      SECRET,
    );
    expect(verifyPreviewToken(token, page.id, SECRET)).toBe(true);

    const preview = await service.getDraftPreview(
      tenantSlug,
      'preview-me',
      token,
      SECRET,
    );
    expect((preview.page.draftSeo as { title: string }).title).toBe(
      'draft only',
    );

    const midpoint = Math.floor(token.length / 2);
    const flippedChar = token[midpoint] === 'a' ? 'b' : 'a';
    const tampered =
      token.slice(0, midpoint) + flippedChar + token.slice(midpoint + 1);
    await expect(
      service.getDraftPreview(tenantSlug, 'preview-me', tampered, SECRET),
    ).rejects.toThrow(NotFoundException);
  });
});
