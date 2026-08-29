import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import {
  signManifest,
  verifyManifest,
  toGs1DigitalLink,
  StaticKeyRing,
  type SignedManifest,
} from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { S3Service } from '../../common/s3.service';

@Injectable()
export class ManifestService {
  private ring: StaticKeyRing;
  private encKey: Buffer;

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private s3: S3Service,
  ) {
    const env = loadEnv();
    this.ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
    this.encKey = Buffer.from(env.MANIFEST_ENC_KEY, 'hex');
  }

  async generate(
    batchId: string,
    tier2Codes: string[],
  ): Promise<{ objectKey: string; sha256: string }> {
    const env = loadEnv();
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { product: true, oem: true },
    });
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    const units = await this.prisma.unit.findMany({
      where: { batchId },
      orderBy: { serial: 'asc' },
      select: { id: true, serial: true, tier1Code: true },
    });

    if (units.length !== tier2Codes.length) {
      throw new Error('Unit count mismatch with tier2 codes');
    }

    const manifestUnits = units.map((u, i) => {
      const tier1Code = u.tier1Code;
      const tier2Code = tier2Codes[i];
      const tier1Url = batch.product.gtin
        ? toGs1DigitalLink({
            baseUrl: env.VERIFY_BASE_URL,
            gtin: batch.product.gtin,
            serial: tier1Code,
          })
        : `${env.VERIFY_BASE_URL}/v/${tier1Code}`;
      const tier2Url = `${env.VERIFY_BASE_URL}/v/${tier2Code}`;
      return { serial: u.serial, tier1Code, tier2Code, tier1Url, tier2Url };
    });

    const manifest = {
      version: 2,
      tenant: batch.tenantId,
      batchId: batch.id,
      product: {
        id: batch.product.id,
        sku: batch.product.sku,
        name: batch.product.name,
        gtin: batch.product.gtin,
      },
      oem: batch.oem ? { id: batch.oem.id, name: batch.oem.name } : null,
      count: batch.count,
      watermark: batch.watermark,
      kid: batch.kid,
      baseUrl: env.VERIFY_BASE_URL,
      units: manifestUnits,
      createdAt: new Date().toISOString(),
    };

    const signed = signManifest(this.ring, manifest);
    const json = JSON.stringify(signed);

    // AES-256-GCM encrypt: layout is [iv(12) | tag(16) | ciphertext]
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]);

    const objectKey = `tenants/${batch.tenantId}/batches/${batchId}/manifest.json.enc`;
    await this.s3.putObject(objectKey, payload, 'application/octet-stream');

    const sha256 = crypto.createHash('sha256').update(json).digest('hex');

    await this.prisma.batch.update({
      where: { id: batchId },
      data: { manifestObjectKey: objectKey, manifestSha256: sha256 },
    });

    return { objectKey, sha256 };
  }

  async open(batchId: string): Promise<SignedManifest> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch || !batch.manifestObjectKey) {
      throw new Error(`No manifest for batch ${batchId}`);
    }

    const payload = await this.s3.getObject(batch.manifestObjectKey);
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const signed: SignedManifest = JSON.parse(decrypted.toString('utf8'));

    if (!verifyManifest(this.ring, signed)) {
      throw new Error('Manifest signature verification failed');
    }

    return signed;
  }
}
