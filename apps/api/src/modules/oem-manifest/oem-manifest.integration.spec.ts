import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Tenant, Oem } from '@prisma/client';
import { prisma as dbPrisma } from '@verifynng/db';
import {
  StaticKeyRing,
  hashForStorage,
  verifyManifest,
  receiptHash,
  deriveBatchWatermark,
} from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { AppModule } from '../../app.module';
import { MintService } from '../batches/mint.service';
import { ManifestService } from '../batches/manifest.service';
import { S3Service } from '../../common/s3.service';
import { EventsService } from '../../common/events.service';
import { AllowAllEntitlementPolicy } from '../batches/entitlement.policy';
import { decryptManifest } from './manifest-crypto.util';

type PrismaClient = typeof dbPrisma;

// Real Postgres + real MinIO + the full Nest HTTP pipeline (guards included).
//
// Deliberately NOT schema-isolated via createTestDatabase like other suites:
// every service in this module (and E04's batches/catalog) resolves Prisma
// through the `'PRISMA'` DI token, which PrismaModule binds with `useValue` to
// `@verifynng/db`'s module-singleton client — a plain top-level `new
// PrismaClient()` whose connection is fixed to whatever DATABASE_URL was set
// when this file's imports first ran. Reassigning process.env.DATABASE_URL in
// beforeAll (the pattern test/isolation/*.spec.ts uses) has no effect on that
// singleton, so the app's own OemManifestModule/BatchesModule services would
// silently query a different database than the one this suite seeds into —
// confirmed empirically, not assumed. Every fixture below is therefore created
// through that same singleton (imported here as `dbPrisma`) against this
// worktree's regular dev Postgres, with random ids/slugs to avoid collisions,
// and cleaned up in afterAll.
//
// A JWT is hand-signed in the exact format TokenService.issueAccessToken
// produces so this suite genuinely exercises TenantContextGuard/RolesGuard/
// OemScopeGuard, not a bypass of them. The raw download token is recovered
// from the NotificationOutbox row (the same place Mailpit/the real E2E flow
// reads it from) rather than a backdoor, since DeliveryService never returns
// it over HTTP.

function signAccessToken(claims: {
  sub: string;
  tid: string;
  role: string;
  sid: string;
}): string {
  const env = loadEnv();
  const ring = new StaticKeyRing(env.JWT_KEYS, env.JWT_ACTIVE_KID);
  const { kid, secret } = ring.active();
  const header = { alg: 'HS256', typ: 'JWT', kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, typ: 'access', iat: now, exp: now + 900 };
  const b64 = (v: Buffer | string | object) =>
    Buffer.from(
      Buffer.isBuffer(v) || typeof v === 'string' ? v : JSON.stringify(v),
    ).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const sig = b64(
    crypto.createHmac('sha256', secret).update(signingInput).digest(),
  );
  return `${signingInput}.${sig}`;
}

async function createSessionAndToken(
  prisma: PrismaClient,
  userId: string,
  tenantId: string,
  role: string,
) {
  const session = await prisma.session.create({
    data: {
      userId,
      tenantId,
      refreshTokenHash: hashForStorage(crypto.randomUUID()),
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  return signAccessToken({ sub: userId, tid: tenantId, role, sid: session.id });
}

/**
 * E19's TenantStatusGuard blocks every non-GET route for an owner whose
 * tenant has pending AUP/ToS acceptance (this shared dev DB has real
 * PolicyDocument rows once `pnpm db:seed` has run) — accept the current
 * version of each so the owner token this test mints can actually write.
 */
async function acceptCurrentPolicies(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  const documents = await prisma.policyDocument.findMany({
    where: { effectiveFrom: { lte: now } },
    orderBy: { effectiveFrom: 'desc' },
  });
  const latestByKind = new Map<string, string>();
  for (const doc of documents) {
    if (!latestByKind.has(doc.kind)) latestByKind.set(doc.kind, doc.version);
  }
  for (const [kind, version] of latestByKind) {
    // The guard checks acceptance by (tenantId, userId, kind, version), but the
    // DB unique constraint is only (tenantId, kind, version) — so only one
    // user's acceptance of a given version can be on record for a tenant at a
    // time. Re-pointing it at *this* owner is correct for a suite where each
    // test mints its own owner for the same shared fixture tenant.
    await prisma.policyAcceptance.upsert({
      where: {
        tenantId_kind_version: { tenantId, kind: kind as never, version },
      },
      update: { userId },
      create: { tenantId, userId, kind: kind as never, version },
    });
  }
}

async function createOwner(prisma: PrismaClient, tenantId: string) {
  const user = await prisma.user.create({
    data: {
      email: `owner-${crypto.randomUUID()}@e05.test`,
      displayName: 'Owner',
    },
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId, role: 'owner' },
  });
  await acceptCurrentPolicies(prisma, tenantId, user.id);
  const token = await createSessionAndToken(prisma, user.id, tenantId, 'owner');
  return { user, token };
}

async function createOemUser(
  prisma: PrismaClient,
  tenantId: string,
  oemId: string,
  label: string,
) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${crypto.randomUUID()}@e05.test`,
      displayName: label,
      tenantId,
    },
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId, role: 'oem' },
  });
  const oemUser = await prisma.oemUser.create({
    data: { tenantId, oemId, userId: user.id },
  });
  const token = await createSessionAndToken(prisma, user.id, tenantId, 'oem');
  return { user, oemUser, token };
}

/** Recovers the raw one-time download token from the outbox row's rendered link. */
async function tokenFromOutbox(
  prisma: PrismaClient,
  email: string,
): Promise<string> {
  const row = await prisma.notificationOutbox.findFirst({
    where: { templateId: 'manifest.delivered', recipient: email },
    orderBy: { createdAt: 'desc' },
  });
  const dashboardUrl = (row?.data as { dashboardUrl?: string } | null)
    ?.dashboardUrl;
  const token = dashboardUrl
    ? new URL(dashboardUrl).searchParams.get('token')
    : null;
  if (!token)
    throw new Error(
      `No manifest.delivered outbox row with a token for ${email}`,
    );
  return token;
}

async function mintBatch(
  prisma: PrismaClient,
  tenantId: string,
  productId: string,
  oemId: string,
  count: number,
  idempotencyKey: string,
) {
  const s3 = new S3Service();
  const manifestService = new ManifestService(prisma as never, s3);
  const events = new EventsService(new EventEmitter2());
  const mintService = new MintService(
    prisma as never,
    new AllowAllEntitlementPolicy(),
    manifestService,
    events,
    { add: async () => ({ id: 'job-1' }) } as never,
    { add: async () => ({ id: 'export-1' }) } as never,
  );
  const result = await mintService.mint({
    tenantId,
    productId,
    oemId,
    count,
    idempotencyKey,
    requestedBy: 'owner-1',
  });
  return result.batch;
}

const createdTenantIds: string[] = [];

/**
 * Best-effort teardown of everything this suite wrote to the shared dev DB,
 * short of the Tenant row itself: every mutating route here is `@Audited`,
 * and AuditLog is a hash-chained, DB-trigger-enforced append-only ledger — a
 * cascading delete through it is rejected by design ("AuditLog is
 * append-only"). The Tenant (and its audit trail) is left behind; this is a
 * local worktree dev DB, cleared wholesale with `pnpm db:reset` when needed.
 */
async function cleanupTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.shipment.deleteMany({ where: { tenantId } });
  await prisma.printReceipt.deleteMany({ where: { tenantId } });
  await prisma.manifestDownload.deleteMany({
    where: { delivery: { tenantId } },
  });
  await prisma.manifestDelivery.deleteMany({ where: { tenantId } });
  await prisma.oemUser.deleteMany({ where: { tenantId } });
  await prisma.notificationOutbox.deleteMany({ where: { tenantId } });
  await prisma.unit.deleteMany({ where: { tenantId } });
  await prisma.batch.deleteMany({ where: { tenantId } });
}

describe('E05 OEM Manifest Delivery (integration, real Postgres + MinIO + HTTP)', () => {
  let app: INestApplication;
  let tenant: Tenant;
  let productId: string;
  let oem: Oem;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    tenant = await dbPrisma.tenant.create({
      data: {
        slug: `e05-${crypto.randomUUID()}`,
        name: 'E05 Test Tenant',
        status: 'active',
      },
    });
    createdTenantIds.push(tenant.id);
    const product = await dbPrisma.product.create({
      data: { tenantId: tenant.id, sku: 'E05-SKU', name: 'E05 Test Product' },
    });
    productId = product.id;
    oem = await dbPrisma.oem.create({
      data: { tenantId: tenant.id, name: 'Guangzhou E05 Test' },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    for (const tenantId of createdTenantIds) {
      try {
        await cleanupTenant(dbPrisma, tenantId);
      } catch (err) {
        // Best-effort: this is a local worktree dev DB, not shared/production state.
        console.warn(
          `E05 integration cleanup failed for tenant ${tenantId}:`,
          err,
        );
      }
    }
  }, 60_000);

  it('deliver → download (verifiable manifest, download log) → expiry/max-downloads → revoke/resend', async () => {
    const server = app.getHttpServer();
    const batch = await mintBatch(
      dbPrisma,
      tenant.id,
      productId,
      oem.id,
      8,
      'download-flow',
    );
    const { token: ownerToken } = await createOwner(dbPrisma, tenant.id);
    // Created before delivery so the manifest.delivered notification (and its
    // token-bearing link) actually has this OEM user to address.
    const { user: oemAppUser, token: oemToken } = await createOemUser(
      dbPrisma,
      tenant.id,
      oem.id,
      'factory',
    );

    const deliverRes = await request(server)
      .post(`/tenants/${tenant.id}/batches/${batch.id}/deliveries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ oemId: oem.id, maxDownloads: 3 })
      .expect(201);
    const deliveryId = deliverRes.body.id as string;
    expect(deliverRes.body.status).toBe('delivered');

    // Re-delivering an already-delivered batch is an illegal transition.
    await request(server)
      .post(`/tenants/${tenant.id}/batches/${batch.id}/deliveries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ oemId: oem.id })
      .expect(409);

    const token = await tokenFromOutbox(dbPrisma, oemAppUser.email);

    // A wrong token on an otherwise-live delivery reads as dead, not as leaking
    // whether the delivery exists.
    const wrongToken = await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token: 'not-the-real-token' })
      .set('Authorization', `Bearer ${oemToken}`);
    expect(wrongToken.status).toBe(410);
    expect(wrongToken.body.error).toBe('token_revoked');

    // Cross-OEM (same tenant): a rival factory must never reach this delivery.
    const otherOem = await dbPrisma.oem.create({
      data: { tenantId: tenant.id, name: 'Rival OEM' },
    });
    const { token: otherOemToken } = await createOemUser(
      dbPrisma,
      tenant.id,
      otherOem.id,
      'rival',
    );
    await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${otherOemToken}`)
      .expect(403);
    await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token })
      .set('Authorization', `Bearer ${otherOemToken}`)
      .expect(403);

    // The real OEM downloads successfully; the manifest verifies and the log shows up.
    const download1 = await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token })
      .set('Authorization', `Bearer ${oemToken}`)
      .expect(200);
    const env = loadEnv();
    const ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
    expect(verifyManifest(ring, download1.body)).toBe(true);

    let delivery = await dbPrisma.manifestDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery.downloadCount).toBe(1);
    expect(delivery.status).toBe('downloaded');
    const downloads = await dbPrisma.manifestDownload.findMany({
      where: { deliveryId },
    });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].oemUserId).not.toBeNull();

    // maxDownloads=3: two more succeed, the fourth 410s.
    await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token })
      .set('Authorization', `Bearer ${oemToken}`)
      .expect(200);
    await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token })
      .set('Authorization', `Bearer ${oemToken}`)
      .expect(200);
    const overLimit = await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token })
      .set('Authorization', `Bearer ${oemToken}`);
    expect(overLimit.status).toBe(410);
    expect(overLimit.body.error).toBe('max_downloads_reached');

    // Resend rotates the token: the old one is dead, the new one works.
    await request(server)
      .post(`/tenants/${tenant.id}/deliveries/${deliveryId}/resend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const oldTokenAfterResend = await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token })
      .set('Authorization', `Bearer ${oemToken}`);
    expect(oldTokenAfterResend.status).toBe(410);
    expect(oldTokenAfterResend.body.error).toBe('token_revoked');

    const newToken = await tokenFromOutbox(dbPrisma, oemAppUser.email);
    expect(newToken).not.toBe(token);
    await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token: newToken })
      .set('Authorization', `Bearer ${oemToken}`)
      .expect(200);

    // Revoke kills the delivery outright.
    await request(server)
      .post(`/tenants/${tenant.id}/deliveries/${deliveryId}/revoke`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const revokedCheck = await request(server)
      .get(`/v1/oem/deliveries/${deliveryId}/manifest`)
      .query({ token: newToken })
      .set('Authorization', `Bearer ${oemToken}`);
    expect(revokedCheck.status).toBe(410);
    expect(revokedCheck.body.error).toBe('token_revoked');

    delivery = await dbPrisma.manifestDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(delivery.status).toBe('revoked');
  }, 60_000);

  it('close is owner-only and rejects operators; close is legal from minted/delivered/printed/shipped and terminal after', async () => {
    const server = app.getHttpServer();
    const batch = await mintBatch(
      dbPrisma,
      tenant.id,
      productId,
      oem.id,
      3,
      'close-flow',
    );
    const { token: ownerToken } = await createOwner(dbPrisma, tenant.id);

    const operatorUser = await dbPrisma.user.create({
      data: {
        email: `operator-${crypto.randomUUID()}@e05.test`,
        displayName: 'Operator',
      },
    });
    await dbPrisma.membership.create({
      data: { userId: operatorUser.id, tenantId: tenant.id, role: 'operator' },
    });
    const operatorToken = await createSessionAndToken(
      dbPrisma,
      operatorUser.id,
      tenant.id,
      'operator',
    );

    await request(server)
      .post(`/tenants/${tenant.id}/batches/${batch.id}/close`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(403);

    await request(server)
      .post(`/tenants/${tenant.id}/batches/${batch.id}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const closed = await dbPrisma.batch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(closed.status).toBe('closed');

    await request(server)
      .post(`/tenants/${tenant.id}/batches/${batch.id}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
  }, 30_000);

  it('receipt verify: matched receipt transitions to printed and is idempotent; mismatch stays delivered and ship then works', async () => {
    const server = app.getHttpServer();
    const batch = await mintBatch(
      dbPrisma,
      tenant.id,
      productId,
      oem.id,
      6,
      'receipt-flow',
    );
    const { token: ownerToken } = await createOwner(dbPrisma, tenant.id);

    const deliverRes = await request(server)
      .post(`/tenants/${tenant.id}/batches/${batch.id}/deliveries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ oemId: oem.id })
      .expect(201);
    const deliveryId = deliverRes.body.id as string;

    const { token: oemToken } = await createOemUser(
      dbPrisma,
      tenant.id,
      oem.id,
      'receipt-factory',
    );

    const delivery = await dbPrisma.manifestDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    const s3 = new S3Service();
    const payload = await s3.getObject(delivery.objectKey);
    const env = loadEnv();
    const manifest = JSON.parse(
      decryptManifest(payload, env.MANIFEST_ENC_KEY),
    ) as {
      units: Array<{ tier2Code: string }>;
    };

    const tier2Codes = manifest.units.map((u) => u.tier2Code);
    const correctHash = receiptHash(tier2Codes);
    const ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
    // Independently re-derive the watermark the way MintService did (tenant *slug*,
    // not id) and cross-check it against the stored ground truth on Batch — these
    // must always agree, since core.watermarkOf on any minted code reads back to it.
    const rederivedWatermark = deriveBatchWatermark(ring, {
      tenant: tenant.slug,
      batchId: batch.id,
    });
    expect(rederivedWatermark).toBe(batch.watermark);
    const watermark = batch.watermark;

    // A swapped-in foreign code: two distinct watermarks → mismatchReason 'watermark'.
    const mismatchRes = await request(server)
      .post(`/v1/oem/deliveries/${deliveryId}/receipt`)
      .set('Authorization', `Bearer ${oemToken}`)
      .send({
        receiptHash: 'deadbeef',
        codeCount: tier2Codes.length,
        watermarks: [watermark, 'FRGN'],
      })
      .expect(201);
    expect(mismatchRes.body.matched).toBe(false);
    expect(mismatchRes.body.mismatchReason).toBe('hash');
    expect(
      (await dbPrisma.batch.findUniqueOrThrow({ where: { id: batch.id } }))
        .status,
    ).toBe('delivered');

    const matchRes = await request(server)
      .post(`/v1/oem/deliveries/${deliveryId}/receipt`)
      .set('Authorization', `Bearer ${oemToken}`)
      .send({
        receiptHash: correctHash,
        codeCount: tier2Codes.length,
        watermarks: [watermark],
      })
      .expect(201);
    expect(matchRes.body.matched).toBe(true);
    expect(
      (await dbPrisma.batch.findUniqueOrThrow({ where: { id: batch.id } }))
        .status,
    ).toBe('printed');

    // Idempotent resubmission returns the same row, no duplicate insert.
    const replay = await request(server)
      .post(`/v1/oem/deliveries/${deliveryId}/receipt`)
      .set('Authorization', `Bearer ${oemToken}`)
      .send({
        receiptHash: correctHash,
        codeCount: tier2Codes.length,
        watermarks: [watermark],
      })
      .expect(201);
    expect(replay.body.id).toBe(matchRes.body.id);
    expect(await dbPrisma.printReceipt.count({ where: { deliveryId } })).toBe(
      2,
    );

    const shipRes = await request(server)
      .post(`/v1/oem/deliveries/${deliveryId}/ship`)
      .set('Authorization', `Bearer ${oemToken}`)
      .send({ carrier: 'DHL', trackingRef: '1234567890' })
      .expect(201);
    expect(shipRes.body.carrier).toBe('DHL');
    expect(
      (await dbPrisma.batch.findUniqueOrThrow({ where: { id: batch.id } }))
        .status,
    ).toBe('shipped');

    await request(server)
      .post(`/v1/oem/deliveries/${deliveryId}/ship`)
      .set('Authorization', `Bearer ${oemToken}`)
      .send({ carrier: 'DHL' })
      .expect(409);
  }, 60_000);

  it('cross-tenant: an OEM user of tenant A never sees or reaches tenant B deliveries', async () => {
    const server = app.getHttpServer();

    const tenantB = await dbPrisma.tenant.create({
      data: {
        slug: `e05-b-${crypto.randomUUID()}`,
        name: 'E05 Tenant B',
        status: 'active',
      },
    });
    createdTenantIds.push(tenantB.id);
    const productB = await dbPrisma.product.create({
      data: { tenantId: tenantB.id, sku: 'E05-B-SKU', name: 'E05 B Product' },
    });
    const oemB = await dbPrisma.oem.create({
      data: { tenantId: tenantB.id, name: 'Tenant B OEM' },
    });

    const batchA = await mintBatch(
      dbPrisma,
      tenant.id,
      productId,
      oem.id,
      4,
      'cross-tenant-a',
    );
    const batchB = await mintBatch(
      dbPrisma,
      tenantB.id,
      productB.id,
      oemB.id,
      4,
      'cross-tenant-b',
    );

    const { token: ownerTokenA } = await createOwner(dbPrisma, tenant.id);
    const { token: ownerTokenB } = await createOwner(dbPrisma, tenantB.id);

    const deliverA = await request(server)
      .post(`/tenants/${tenant.id}/batches/${batchA.id}/deliveries`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ oemId: oem.id })
      .expect(201);
    const deliverB = await request(server)
      .post(`/tenants/${tenantB.id}/batches/${batchB.id}/deliveries`)
      .set('Authorization', `Bearer ${ownerTokenB}`)
      .send({ oemId: oemB.id })
      .expect(201);

    const { token: oemTokenA } = await createOemUser(
      dbPrisma,
      tenant.id,
      oem.id,
      'tenant-a-oem',
    );

    // Tenant A's OEM user can reach its own delivery...
    await request(server)
      .get(`/v1/oem/deliveries/${deliverA.body.id}`)
      .set('Authorization', `Bearer ${oemTokenA}`)
      .expect(200);

    // ...but never tenant B's — 404, not 403, matching this codebase's rule of
    // never confirming another tenant's resource exists (assertOemAccess scopes
    // its lookup by tenantId first; 403 is reserved for a same-tenant, wrong-OEM hit).
    await request(server)
      .get(`/v1/oem/deliveries/${deliverB.body.id}`)
      .set('Authorization', `Bearer ${oemTokenA}`)
      .expect(404);

    const list = await request(server)
      .get('/v1/oem/deliveries')
      .set('Authorization', `Bearer ${oemTokenA}`)
      .expect(200);
    const ids = list.body.map((d: { id: string }) => d.id);
    expect(ids).toContain(deliverA.body.id);
    expect(ids).not.toContain(deliverB.body.id);
  }, 60_000);
});
