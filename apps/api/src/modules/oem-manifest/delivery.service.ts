import crypto from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, ManifestDelivery } from '@prisma/client';
import { hashForStorage, signManifest, StaticKeyRing } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { ManifestService } from '../batches/manifest.service';
import { ExportsService } from '../batches/exports.service';
import { S3Service } from '../../common/s3.service';
import { EventsService } from '../../common/events.service';
import { NotificationService } from '../notifications/notifications.service';
import { BatchLifecycleService } from './batch-lifecycle.service';
import {
  constantTimeEqual,
  decryptManifest,
  encryptManifest,
} from './manifest-crypto.util';

export interface DeliverInput {
  oemId: string;
  expiresInHours?: number;
  maxDownloads?: number;
  expectedShipDate?: string;
}

export type DownloadOutcome =
  | { ok: true; json: string }
  | {
      ok: false;
      status: 410;
      error: 'token_revoked' | 'expired' | 'max_downloads_reached';
    };

@Injectable()
export class DeliveryService {
  private ring: StaticKeyRing;
  private encKey: string;

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private manifestService: ManifestService,
    private exportsService: ExportsService,
    private s3: S3Service,
    private events: EventsService,
    private notifications: NotificationService,
    private batchLifecycle: BatchLifecycleService,
  ) {
    const env = loadEnv();
    this.ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
    this.encKey = env.MANIFEST_ENC_KEY;
  }

  async listForBatch(
    tenantId: string,
    batchId: string,
  ): Promise<ManifestDelivery[]> {
    return this.prisma.manifestDelivery.findMany({
      where: { tenantId, batchId },
      orderBy: { deliveredAt: 'desc' },
      include: { oem: true, downloads: true, receipts: true },
    });
  }

  /** Tenant console's top-level Deliveries list — across every batch. */
  async listForTenant(tenantId: string) {
    return this.prisma.manifestDelivery.findMany({
      where: { tenantId },
      orderBy: { deliveredAt: 'desc' },
      include: {
        oem: true,
        downloads: true,
        receipts: true,
        batch: { include: { product: true } },
      },
    });
  }

  async getTenantDelivery(tenantId: string, deliveryId: string) {
    const delivery = await this.prisma.manifestDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: { oem: true, downloads: true, receipts: true, batch: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async deliver(
    tenantId: string,
    batchId: string,
    input: DeliverInput,
    actor: { userId: string },
  ): Promise<ManifestDelivery> {
    const env = loadEnv();
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
      include: { product: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    if (!this.batchLifecycle.canTransition(batch.status, 'delivered')) {
      throw new ConflictException({
        error: 'illegal_transition',
        message: `illegal_transition ${batch.status}→delivered`,
      });
    }

    const oem = await this.prisma.oem.findFirst({
      where: { id: input.oemId, tenantId },
    });
    if (!oem) throw new NotFoundException('OEM not found');

    const signed = await this.manifestService.open(batchId);

    const expiresInHours =
      input.expiresInHours ?? env.DELIVERY_DEFAULT_EXPIRY_HOURS;
    const maxDownloads =
      input.maxDownloads ?? env.DELIVERY_DEFAULT_MAX_DOWNLOADS;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);
    const expectedShipDate = input.expectedShipDate
      ? new Date(input.expectedShipDate)
      : null;

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashForStorage(token);

    const delivery = await this.prisma.manifestDelivery.create({
      data: {
        tenantId,
        batchId,
        oemId: oem.id,
        objectKey: '',
        signatureKid: '',
        signature: '',
        tokenHash,
        expiresAt,
        maxDownloads,
        expectedShipDate,
        deliveredById: actor.userId,
      },
    });

    const {
      kid: _k,
      alg: _a,
      signature: _s,
      ...manifestFields
    } = signed as Record<string, unknown>;
    void _k;
    void _a;
    void _s;
    const reSigned = signManifest(this.ring, {
      ...manifestFields,
      delivery: {
        deliveryId: delivery.id,
        oemId: oem.id,
        issuedAt: delivery.deliveredAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });

    const objectKey = `tenants/${tenantId}/batches/${batchId}/deliveries/${delivery.id}.json.enc`;
    const encrypted = encryptManifest(JSON.stringify(reSigned), this.encKey);
    await this.s3.putObject(objectKey, encrypted, 'application/octet-stream');

    await this.prisma.manifestDelivery.update({
      where: { id: delivery.id },
      data: {
        objectKey,
        signatureKid: reSigned.kid,
        signature: reSigned.signature,
      },
    });

    await this.batchLifecycle.transition(
      tenantId,
      batchId,
      'delivered',
      { type: 'user', id: actor.userId },
      { expectedShipDate },
    );

    const recipientEmails = await this.notifyDelivered(
      tenantId,
      batch,
      oem,
      delivery,
      token,
    );

    await this.events.emit('manifest.delivered', {
      tenantId,
      batchId,
      oemId: oem.id,
      deliveryId: delivery.id,
      expiresAt,
      recipientEmails,
    });

    return this.getTenantDelivery(tenantId, delivery.id);
  }

  async revoke(
    tenantId: string,
    deliveryId: string,
  ): Promise<ManifestDelivery> {
    const delivery = await this.getTenantDelivery(tenantId, deliveryId);
    return this.prisma.manifestDelivery.update({
      where: { id: delivery.id },
      data: { status: 'revoked', revokedAt: new Date() },
    });
  }

  async resend(
    tenantId: string,
    deliveryId: string,
  ): Promise<ManifestDelivery> {
    const delivery = await this.getTenantDelivery(tenantId, deliveryId);
    if (delivery.status === 'revoked') {
      throw new ConflictException({ error: 'delivery_revoked' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashForStorage(token);

    const updated = await this.prisma.manifestDelivery.update({
      where: { id: delivery.id },
      data: {
        tokenHash,
        tokenVersion: { increment: 1 },
        downloadCount: 0,
        status: 'delivered',
        revokedAt: null,
      },
      include: { oem: true, batch: { include: { product: true } } },
    });

    await this.notifyDelivered(
      tenantId,
      updated.batch,
      updated.oem,
      updated,
      token,
    );
    return updated;
  }

  /** Validates OEM-portal access to a delivery; throws 404/403 the way AC2 expects. */
  async assertOemAccess(deliveryId: string, oemId: string, tenantId: string) {
    const delivery = await this.prisma.manifestDelivery.findFirst({
      where: { id: deliveryId, tenantId },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.oemId !== oemId) throw new ForbiddenException();
    return delivery;
  }

  async listForOem(oemId: string, tenantId: string) {
    return this.prisma.manifestDelivery.findMany({
      where: { oemId, tenantId },
      orderBy: { deliveredAt: 'desc' },
      include: { batch: { include: { product: true } } },
    });
  }

  async getForOem(deliveryId: string, oemId: string, tenantId: string) {
    const delivery = await this.assertOemAccess(deliveryId, oemId, tenantId);
    return this.prisma.manifestDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
      include: {
        downloads: true,
        receipts: true,
        batch: { include: { product: true } },
      },
    });
  }

  /**
   * Token validity check shared by the manifest and artwork routes. Only the
   * manifest route enforces `maxDownloads` — an artwork fetch doesn't consume
   * the manifest's download budget.
   */
  private async checkToken(
    deliveryId: string,
    token: string,
    opts: { enforceMaxDownloads: boolean },
  ): Promise<
    | { ok: true; delivery: ManifestDelivery }
    | {
        ok: false;
        status: 410;
        error: 'token_revoked' | 'expired' | 'max_downloads_reached';
      }
  > {
    const delivery = await this.prisma.manifestDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });

    if (delivery.status === 'revoked') {
      return { ok: false, status: 410, error: 'token_revoked' };
    }
    if (!constantTimeEqual(hashForStorage(token), delivery.tokenHash)) {
      return { ok: false, status: 410, error: 'token_revoked' };
    }
    if (delivery.expiresAt.getTime() < Date.now()) {
      return { ok: false, status: 410, error: 'expired' };
    }
    if (
      opts.enforceMaxDownloads &&
      delivery.downloadCount >= delivery.maxDownloads
    ) {
      return { ok: false, status: 410, error: 'max_downloads_reached' };
    }

    return { ok: true, delivery };
  }

  /** Token check + decrypt for `GET .../manifest?token=`. Does not record the download. */
  async openForDownload(
    deliveryId: string,
    token: string,
  ): Promise<DownloadOutcome> {
    const check = await this.checkToken(deliveryId, token, {
      enforceMaxDownloads: true,
    });
    if (!check.ok) return check;

    const payload = await this.s3.getObject(check.delivery.objectKey);
    const json = decryptManifest(payload, this.encKey);
    return { ok: true, json };
  }

  /** Token check for `GET .../artwork?token=` — returns the delivery so the caller can redirect. */
  async checkArtworkToken(
    deliveryId: string,
    token: string,
  ): Promise<
    | { ok: true; delivery: ManifestDelivery }
    | { ok: false; status: 410; error: 'token_revoked' | 'expired' }
  > {
    const check = await this.checkToken(deliveryId, token, {
      enforceMaxDownloads: false,
    });
    if (!check.ok && check.error === 'max_downloads_reached') {
      // Unreachable with enforceMaxDownloads: false, but keeps the return type honest.
      throw new Error(
        'unexpected max_downloads_reached from artwork token check',
      );
    }
    return check as
      | { ok: true; delivery: ManifestDelivery }
      | { ok: false; status: 410; error: 'token_revoked' | 'expired' };
  }

  async recordDownload(
    deliveryId: string,
    oemUserId: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<{ downloadCount: number }> {
    const [, updated] = await this.prisma.$transaction([
      this.prisma.manifestDownload.create({
        data: { deliveryId, oemUserId, ip, userAgent },
      }),
      this.prisma.manifestDelivery.update({
        where: { id: deliveryId },
        data: {
          downloadCount: { increment: 1 },
          status: 'downloaded',
        },
      }),
    ]);

    const delivery = await this.prisma.manifestDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    await this.events.emit('manifest.downloaded', {
      tenantId: delivery.tenantId,
      batchId: delivery.batchId,
      oemId: delivery.oemId,
      deliveryId,
      downloadCount: updated.downloadCount,
      ip,
    });

    return { downloadCount: updated.downloadCount };
  }

  async getArtworkRedirectUrl(delivery: { tenantId: string; batchId: string }) {
    return this.exportsService.getSignedUrl(
      delivery.tenantId,
      delivery.batchId,
      'all-zip',
    );
  }

  async openManifestJson(delivery: {
    objectKey: string;
  }): Promise<Record<string, unknown>> {
    const payload = await this.s3.getObject(delivery.objectKey);
    return JSON.parse(decryptManifest(payload, this.encKey)) as Record<
      string,
      unknown
    >;
  }

  private async notifyDelivered(
    tenantId: string,
    batch: { id: string; count: number; product: { sku: string } },
    oem: { id: string; name: string },
    delivery: { id: string },
    token: string,
  ): Promise<string[]> {
    const env = loadEnv();
    const oemUsers = await this.prisma.oemUser.findMany({
      where: { oemId: oem.id, tenantId },
      include: { user: true },
    });
    const owners = await this.prisma.membership.findMany({
      where: { tenantId, role: 'owner' },
      include: { user: true },
    });

    const recipientEmails: string[] = [];

    for (const ou of oemUsers) {
      const url = `${env.OEM_PORTAL_BASE_URL}/oem/deliveries/${delivery.id}?token=${token}`;
      await this.notifications.send(
        'manifest.delivered',
        { email: ou.user.email },
        {
          oemName: oem.name,
          batchSku: batch.product.sku,
          unitCount: batch.count,
          dashboardUrl: url,
        },
        { tenantId },
      );
      recipientEmails.push(ou.user.email);
    }

    for (const m of owners) {
      const url = `${env.APP_BASE_URL}/deliveries/${delivery.id}`;
      await this.notifications.send(
        'manifest.delivered',
        { email: m.user.email },
        {
          oemName: oem.name,
          batchSku: batch.product.sku,
          unitCount: batch.count,
          dashboardUrl: url,
        },
        { tenantId },
      );
      recipientEmails.push(m.user.email);
    }

    return recipientEmails;
  }
}
