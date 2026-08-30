/**
 * E05 seed fixtures: an OEM ("Guangzhou Pack Co."), its portal user, and a
 * minted-but-not-yet-delivered batch — so `AC1` can be demonstrated from a
 * fresh clone without first walking through E04's mint UI.
 *
 * Mints for real (not a Prisma-only stub): generates genuine watermarked
 * tier-1/tier-2 codes and writes an encrypted, signed manifest to MinIO in
 * the exact shape/encryption E04's ManifestService produces, since E05's
 * DeliveryService reads it back through that same code path.
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as argon2 from 'argon2';
import {
  generateCode,
  hashForStorage,
  deriveBatchWatermark,
  signManifest,
  StaticKeyRing,
  toGs1DigitalLink,
} from '@verifynng/core';
import { loadEnv } from '@verifynng/config';

const OEM_UNIT_COUNT = 20;

export async function seedOemDelivery(prisma: PrismaClient): Promise<void> {
  const env = loadEnv();

  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'ivoryglow' },
  });
  if (!tenant) {
    console.warn('seedOemDelivery: ivoryglow tenant not found, skipping');
    return;
  }
  const product = await prisma.product.findFirst({
    where: { tenantId: tenant.id, sku: 'ig004' },
  });
  if (!product) {
    console.warn('seedOemDelivery: ig004 product not found, skipping');
    return;
  }

  const oem = await prisma.oem.upsert({
    where: {
      tenantId_name: { tenantId: tenant.id, name: 'Guangzhou Pack Co.' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Guangzhou Pack Co.',
      country: 'CN',
      status: 'active',
    },
  });

  const passwordHash = await argon2.hash('Passw0rd!Passw0rd!', {
    type: argon2.argon2id,
  });
  const oemUserAccount = await prisma.user.upsert({
    where: { email: 'oem@guangzhou-pack.test' },
    update: {},
    create: {
      email: 'oem@guangzhou-pack.test',
      displayName: 'Guangzhou Pack Co. (OEM)',
      passwordHash,
      tenantId: tenant.id,
    },
  });
  await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: oemUserAccount.id, tenantId: tenant.id },
    },
    update: { role: 'oem' },
    create: { userId: oemUserAccount.id, tenantId: tenant.id, role: 'oem' },
  });
  await prisma.oemUser.upsert({
    where: { userId: oemUserAccount.id },
    update: {},
    create: { tenantId: tenant.id, oemId: oem.id, userId: oemUserAccount.id },
  });

  const idempotencyKey = 'e05-seed-oem-batch';
  const existingBatch = await prisma.batch.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey } },
  });
  if (existingBatch) {
    console.log('seedOemDelivery: batch already seeded, skipping mint');
    return;
  }

  const ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);

  const batch = await prisma.batch.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      oemId: oem.id,
      count: OEM_UNIT_COUNT,
      idempotencyKey,
      requestedBy: 'system',
      note: 'E05 seed fixture for AC1',
      status: 'minting',
      watermark: '',
      kid: ring.active().kid,
    },
  });

  const watermark = deriveBatchWatermark(ring, {
    tenant: tenant.slug,
    batchId: batch.id,
  });
  await prisma.batch.update({ where: { id: batch.id }, data: { watermark } });

  const tier2Codes: string[] = [];
  const manifestUnits: Array<{
    serial: number;
    tier1Code: string;
    tier2Code: string;
    tier1Url: string;
    tier2Url: string;
  }> = [];

  for (let i = 0; i < OEM_UNIT_COUNT; i++) {
    const serial = i + 1;
    const { code: tier1Code } = generateCode(ring, {
      tenant: tenant.slug,
      tier: 1,
      watermark,
    });
    const { code: tier2Code } = generateCode(ring, {
      tenant: tenant.slug,
      tier: 2,
      watermark,
    });
    tier2Codes.push(tier2Code);

    const tier1Url = product.gtin
      ? toGs1DigitalLink({
          baseUrl: env.VERIFY_BASE_URL,
          gtin: product.gtin,
          serial: tier1Code,
        })
      : `${env.VERIFY_BASE_URL}/v/${tier1Code}`;

    await prisma.unit.create({
      data: {
        tenantId: tenant.id,
        batchId: batch.id,
        productId: product.id,
        serial,
        tier1Code,
        tier2Hash: hashForStorage(tier2Code),
      },
    });

    manifestUnits.push({
      serial,
      tier1Code,
      tier2Code,
      tier1Url,
      tier2Url: `${env.VERIFY_BASE_URL}/v/${tier2Code}`,
    });
  }

  const mintedBatch = await prisma.batch.update({
    where: { id: batch.id },
    data: {
      status: 'minted',
      mintedCount: OEM_UNIT_COUNT,
      mintedAt: new Date(),
    },
  });

  const manifest = {
    version: 2,
    tenant: tenant.id,
    batchId: batch.id,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      gtin: product.gtin,
    },
    oem: { id: oem.id, name: oem.name },
    count: OEM_UNIT_COUNT,
    watermark,
    kid: mintedBatch.kid,
    baseUrl: env.VERIFY_BASE_URL,
    units: manifestUnits,
    createdAt: new Date().toISOString(),
  };
  const signed = signManifest(ring, manifest);
  const json = JSON.stringify(signed);

  const encKey = Buffer.from(env.MANIFEST_ENC_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]);

  const objectKey = `tenants/${tenant.id}/batches/${batch.id}/manifest.json.enc`;
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      Body: payload,
      ContentType: 'application/octet-stream',
    }),
  );

  const sha256 = crypto.createHash('sha256').update(json).digest('hex');
  await prisma.batch.update({
    where: { id: batch.id },
    data: { manifestObjectKey: objectKey, manifestSha256: sha256 },
  });

  console.log(
    `Seeded OEM "${oem.name}" (oem@guangzhou-pack.test) and minted batch ${batch.id} (${OEM_UNIT_COUNT} units) ready for delivery`,
  );
}
