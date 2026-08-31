import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { loadEnv } from '@verifynng/config';
import { QuotaService } from '../quota/quota.service';
import { PagesS3Service } from './pages-s3.service';
import { PageMediaService } from './page-media.service';

const GPS_PHOTO = readFileSync(
  resolve(__dirname, '../../../test/fixtures/photo-with-gps.jpg'),
);
const NOT_AN_IMAGE = readFileSync(
  resolve(__dirname, '../../../test/fixtures/not-an-image.jpg'),
);

describe('PageMediaService integration (real Postgres + MinIO)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let redis: Redis;
  let service: PageMediaService;
  let tenantId: string;

  beforeAll(async () => {
    const result = await createTestDatabase('page-media-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    const tenant = await prisma.tenant.create({
      data: {
        slug: 'page-media-integration-tenant',
        name: 'Page Media Tenant',
      },
    });
    tenantId = tenant.id;

    const env = loadEnv();
    redis = new Redis(env.REDIS_URL);
    const quota = new QuotaService(redis, prisma, new EventEmitter2());
    // S3_PUBLIC_ENDPOINT is a container-only override docker/compose.yml sets
    // for the api service (localhost:${MINIO_PORT}); outside docker we reuse
    // S3_ENDPOINT for both, same as ReportsS3Service's integration test.
    const config = new ConfigService({
      ...env,
      S3_PUBLIC_ENDPOINT: env.S3_ENDPOINT,
    });

    const s3 = new PagesS3Service(config);
    await s3.onModuleInit();

    service = new PageMediaService(prisma, s3, config, quota);
    service.onModuleInit();
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
    await redis.quit();
  });

  it('uploads a real image, strips EXIF/GPS, and generates variants', async () => {
    const ref = await service.upload(
      tenantId,
      undefined,
      'user-1',
      { buffer: GPS_PHOTO, size: GPS_PHOTO.length },
      'A test photo',
    );

    expect(ref.width).toBe(100);
    expect(ref.height).toBe(100);
    expect(ref.variants.webp).toHaveLength(3);
    expect(ref.variants.avif).toHaveLength(2);
    expect(ref.blurDataUrl?.startsWith('data:image/webp;base64,')).toBe(true);

    const res = await fetch(ref.variants.webp[1]);
    expect(res.status).toBe(200);
    const downloaded = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(downloaded).metadata();
    expect(metadata.exif).toBeUndefined();

    const asset = await prisma.pageMediaAsset.findUniqueOrThrow({
      where: { id: ref.assetId },
    });
    expect(asset.tenantId).toBe(tenantId);
    expect(asset.alt).toBe('A test photo');
  });

  it('rejects a file whose magic bytes are not an accepted image type', async () => {
    await expect(
      service.upload(
        tenantId,
        undefined,
        'user-1',
        { buffer: NOT_AN_IMAGE, size: NOT_AN_IMAGE.length },
        'alt',
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects an SVG (no magic-byte match for a raster image)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await expect(
      service.upload(
        tenantId,
        undefined,
        'user-1',
        { buffer: svg, size: svg.length },
        'alt',
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects a declared size over the configured max', async () => {
    await expect(
      service.upload(
        tenantId,
        undefined,
        'user-1',
        { buffer: GPS_PHOTO, size: 12_000_000 },
        'alt',
      ),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('rejects an image whose dimensions exceed the pixel cap', async () => {
    const huge = await sharp({
      create: {
        width: 6100,
        height: 10,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    await expect(
      service.upload(
        tenantId,
        undefined,
        'user-1',
        { buffer: huge, size: huge.length },
        'alt',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
