import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant as makeTenant } from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ReportsS3Service } from '../../src/modules/reports/reports-s3.service';
import { PhotosService } from '../../src/modules/reports/photos.service';
import { PhotoProcessor } from '../../src/modules/reports/photo.processor';

// This worktree's compose project maps MinIO's S3 API port to
// `localhost:${MINIO_PORT}` (see scripts/epic's write_env / docker/compose.yml's
// S3_PUBLIC_ENDPOINT substitution) — never assume 9000, it collides across
// worktrees. dotenv (loaded by vitest.setup.ts) already put the right value in
// S3_ENDPOINT; S3_PUBLIC_ENDPOINT is a container-only override that compose
// sets for the api service, so outside of docker we reuse S3_ENDPOINT for both.
function fakeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  const values: Record<string, unknown> = {
    S3_ENDPOINT: endpoint,
    S3_PUBLIC_ENDPOINT: endpoint,
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_FORCE_PATH_STYLE: true,
    REPORTS_BUCKET_INCOMING: 'reports-incoming-test',
    REPORTS_BUCKET: 'reports-test',
    REPORT_INCOMING_TTL_HOURS: 24,
    REPORT_PHOTO_MAX_BYTES: 8_000_000,
    ...overrides,
  };
  return {
    get: (k: string, def?: unknown) => values[k] ?? def,
  } as unknown as ConfigService;
}

describe('photo processing (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let s3: ReportsS3Service;
  let photos: PhotosService;
  let processor: PhotoProcessor;

  beforeAll(async () => {
    const db = await createTestDatabase('reports-photo-processing');
    prisma = db.prisma;
    schemaName = db.schemaName;
    s3 = new ReportsS3Service(fakeConfig());
    await s3.onModuleInit();
    photos = new PhotosService(prisma, s3, fakeConfig());
    processor = new PhotoProcessor(prisma, s3, fakeConfig());
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('bucket creation is idempotent across repeated onModuleInit calls', async () => {
    await expect(s3.onModuleInit()).resolves.toBeUndefined();
  });

  it('strips EXIF/GPS, caps dimensions, and moves incoming → processed', async () => {
    const tenant = await makeTenant(prisma);
    const buf = readFileSync(
      resolve(__dirname, '../fixtures/photo-with-gps.jpg'),
    );
    // ContentLength is part of the presigned URL's signed headers — it must
    // match the actual request body length exactly or MinIO rejects the PUT
    // with a signature mismatch.
    const { photoId, uploadUrl } = await photos.requestUpload(
      tenant.id,
      'image/jpeg',
      buf.length,
      'iphash1',
    );

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: buf,
    });
    expect(putRes.ok).toBe(true);
    await prisma.reportPhoto.update({
      where: { id: photoId },
      data: { status: 'uploaded' },
    });

    await processor.process({
      name: 'photo.process',
      data: { photoId },
    } as never);

    const photo = await prisma.reportPhoto.findUniqueOrThrow({
      where: { id: photoId },
    });
    expect(photo.status).toBe('ready');
    expect(photo.objectKey).toBeTruthy();
    expect(photo.width).toBeLessThanOrEqual(2000);
    expect(photo.height).toBeLessThanOrEqual(2000);
  });

  it('rejects a file whose magic bytes do not match an image', async () => {
    const tenant = await makeTenant(prisma);
    const buf = readFileSync(
      resolve(__dirname, '../fixtures/not-an-image.jpg'),
    );
    const { photoId, uploadUrl } = await photos.requestUpload(
      tenant.id,
      'image/jpeg',
      buf.length,
      'iphash2',
    );
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: buf,
    });
    await prisma.reportPhoto.update({
      where: { id: photoId },
      data: { status: 'uploaded' },
    });

    await processor.process({
      name: 'photo.process',
      data: { photoId },
    } as never);

    const photo = await prisma.reportPhoto.findUniqueOrThrow({
      where: { id: photoId },
    });
    expect(photo.status).toBe('rejected');
    expect(photo.rejectReason).toBe('magic_mismatch');
  });

  it('actually strips GPS/EXIF data — verify with exifr against the processed object', async () => {
    // Additional assertion beyond the base plan: read the processed object back from
    // MinIO and confirm exifr finds no GPS tags, proving metadata is stripped by
    // sharp's default behavior (withMetadata() is never called — see photo.processor.ts).
    const tenant = await makeTenant(prisma);
    const buf = readFileSync(
      resolve(__dirname, '../fixtures/photo-with-gps.jpg'),
    );

    // Sanity-check the fixture itself carries detectable GPS EXIF *before*
    // processing — otherwise this test would pass trivially (nothing to strip).
    const exifr = await import('exifr');
    const rawGps = await exifr.gps(buf);
    expect(rawGps).not.toBeNull();
    expect(rawGps?.latitude).toBeCloseTo(37.772, 2);

    const { photoId, uploadUrl } = await photos.requestUpload(
      tenant.id,
      'image/jpeg',
      buf.length,
      'iphash3',
    );

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: buf,
    });
    await prisma.reportPhoto.update({
      where: { id: photoId },
      data: { status: 'uploaded' },
    });
    await processor.process({
      name: 'photo.process',
      data: { photoId },
    } as never);

    const photo = await prisma.reportPhoto.findUniqueOrThrow({
      where: { id: photoId },
    });
    expect(photo.status).toBe('ready');
    // Fetch the processed object via a presigned GET and check its EXIF via exifr.
    const getUrl = await s3.presignGet(photo.objectKey!);
    const res = await fetch(getUrl);
    const arrBuf = await res.arrayBuffer();
    const gpsData = await exifr.gps(Buffer.from(arrBuf));
    expect(gpsData).toBeUndefined();
  });
});
