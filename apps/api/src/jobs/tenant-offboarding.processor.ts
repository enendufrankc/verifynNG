import { Inject, Injectable } from '@nestjs/common';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { prisma } from '@verifynng/db';
import { TenantEventBus } from '../modules/tenants/tenant-events';
import { TenantS3Service } from '../modules/tenants/s3.service';
import { ndjson, exportRows } from '../modules/tenants/tenant-export.data';
import {
  RETENTION_POLICY,
  RetentionPolicy,
} from '../modules/tenants/retention-policy';

@Injectable()
export class TenantOffboardingProcessor {
  constructor(
    private readonly storage: TenantS3Service,
    private readonly events: TenantEventBus,
    @Inject(RETENTION_POLICY) private readonly retention: RetentionPolicy,
  ) {}

  async runExport(tenantId: string, exportId: string): Promise<void> {
    const objectKey = `tenants/${tenantId}/exports/${exportId}.zip`;
    await prisma.tenantExport.update({
      where: { id: exportId },
      data: { status: 'running', objectKey },
    });
    try {
      const [
        products,
        oems,
        batches,
        units,
        scanEvents,
        memberships,
        auditLogs,
      ] = await Promise.all([
        prisma.product.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            sku: true,
            name: true,
            gtin: true,
            createdAt: true,
          },
        }),
        prisma.oem.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            name: true,
            country: true,
            createdAt: true,
          },
        }),
        prisma.batch.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            productId: true,
            oemId: true,
            count: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.unit.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            batchId: true,
            tier2Hash: true,
            state: true,
            createdAt: true,
          },
        }),
        prisma.scanEvent.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            unitId: true,
            tier: true,
            verdict: true,
            geoCountry: true,
            geoCity: true,
            userAgent: true,
            createdAt: true,
          },
        }),
        prisma.membership.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            role: true,
            createdAt: true,
          },
        }),
        prisma.auditLog.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            actorId: true,
            action: true,
            target: true,
            payload: true,
            prevHash: true,
            hash: true,
            createdAt: true,
          },
        }),
      ]);
      const entries: Record<string, string> = {
        'products.ndjson': ndjson(exportRows('products', products)),
        'oems.ndjson': ndjson(exportRows('oems', oems)),
        'batches.ndjson': ndjson(exportRows('batches', batches)),
        'units.ndjson': ndjson(exportRows('units', units)),
        'scan_events.ndjson': ndjson(exportRows('scan_events', scanEvents)),
        'members.ndjson': ndjson(exportRows('members', memberships)),
        'audit_log.ndjson': ndjson(exportRows('audit_log', auditLogs)),
      };
      const archive = archiver('zip');
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on('data', (chunk: Buffer) => chunks.push(chunk));
      const completed = new Promise<void>((resolve, reject) => {
        output.on('end', resolve);
        output.on('error', reject);
        archive.on('error', reject);
      });
      archive.pipe(output);
      for (const [name, content] of Object.entries(entries))
        archive.append(content, { name });
      await archive.finalize();
      await completed;
      const body = Buffer.concat(chunks);
      await this.storage.put(objectKey, body, 'application/zip');
      await prisma.tenantExport.update({
        where: { id: exportId },
        data: {
          status: 'done',
          sizeBytes: body.byteLength,
          completedAt: new Date(),
        },
      });
      this.events.emit('tenant.exported', {
        tenantId,
        objectKey,
        sizeBytes: body.byteLength,
        at: new Date().toISOString(),
      });
    } catch (error) {
      await prisma.tenantExport.update({
        where: { id: exportId },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'export_failed',
        },
      });
      throw error;
    }
  }

  async runDelete(tenantId: string): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.retention.scanEventsDays * 86400000,
    );
    await prisma.scanEvent.updateMany({
      where: { tenantId, createdAt: { gte: cutoff } },
      data: { unitId: null, ip: null, userAgent: null, geoCity: null },
    });
    await prisma.scanEvent.deleteMany({
      where: { tenantId, createdAt: { lt: cutoff } },
    });
    await prisma.unit.deleteMany({ where: { tenantId } });
    await prisma.batch.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.oem.deleteMany({ where: { tenantId } });
    await this.storage.deletePrefix(`tenants/${tenantId}/`);
    this.events.emit('tenant.deleted', {
      tenantId,
      at: new Date().toISOString(),
    });
  }
}
