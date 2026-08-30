import { describe, it, expect, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { InMemoryConsent } from './consent/in-memory-consent.provider';
import type { CaptchaPort } from './captcha/captcha-port';
import type { SubmitReportDto } from './dto/submit-report.dto';
import type { NotificationService } from '../notifications/notifications.service';

function makeFakeNotifications() {
  const send = vi
    .fn()
    .mockResolvedValue({ outboxId: 'fake-outbox', status: 'queued' });
  return {
    send,
    asService: () => ({ send }) as unknown as NotificationService,
  };
}

// Fast, DB-free unit coverage of ReportsService's branching logic (tenant
// status gates, cross-tenant isolation, verdict gating, photo ownership).
// The Postgres-backed happy/unhappy paths (real ScanEvent/Report/ReportPhoto
// rows, real reference collisions) are covered by
// test/reports/reports-submission.integration.spec.ts.

class FixedCaptcha implements CaptchaPort {
  constructor(private readonly ok: boolean) {}
  async verify() {
    return {
      ok: this.ok,
      reason: this.ok ? undefined : 'invalid-input-response',
    };
  }
}

interface FakeTenant {
  id: string;
  slug: string;
  status: string;
}

interface FakeScanEvent {
  id: string;
  tenantId: string;
  verdict: string;
  unitId: string | null;
  batchId: string | null;
  productId: string | null;
}

interface FakePhoto {
  id: string;
  ipHash: string;
  reportId: string | null;
  status: string;
}

interface FakeProduct {
  id: string;
  name: string;
}

function makeFakePrisma(opts: {
  tenants?: FakeTenant[];
  scanEvents?: FakeScanEvent[];
  photos?: FakePhoto[];
  products?: FakeProduct[];
}) {
  const tenants = opts.tenants ?? [];
  const scanEvents = opts.scanEvents ?? [];
  const photos = opts.photos ?? [];
  const products = opts.products ?? [];
  const reports: Array<Record<string, unknown>> = [];

  return {
    tenant: {
      findUnique: async ({ where: { slug } }: { where: { slug: string } }) =>
        tenants.find((t) => t.slug === slug) ?? null,
    },
    scanEvent: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        scanEvents.find((s) => s.id === id) ?? null,
    },
    reportPhoto: {
      findMany: async ({
        where,
      }: {
        where: {
          id?: { in: string[] };
          ipHash?: string;
          reportId?: string | null;
        };
      }) =>
        photos.filter((p) => {
          if (where.id && !where.id.in.includes(p.id)) return false;
          if (where.ipHash !== undefined && p.ipHash !== where.ipHash)
            return false;
          if (where.reportId !== undefined && p.reportId !== where.reportId)
            return false;
          return true;
        }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const p of photos) {
          if (where.id.in.includes(p.id)) {
            Object.assign(p, data);
            count++;
          }
        }
        return { count };
      },
    },
    product: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        products.find((p) => p.id === id) ?? null,
    },
    report: {
      count: async ({
        where: { reference },
      }: {
        where: { reference: string };
      }) => (reports.some((r) => r.reference === reference) ? 1 : 0),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: `report_${reports.length + 1}`,
          status: 'new',
          outcome: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        reports.push(row);
        return row;
      },
      findUnique: async ({
        where: { reference },
      }: {
        where: { reference: string };
      }) => reports.find((r) => r.reference === reference) ?? null,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const baseDto = (overrides: Partial<SubmitReportDto> = {}): SubmitReportDto =>
  ({
    scanEventId: 'scan-1',
    purchaseChannel: 'open_market',
    photoIds: [],
    captchaToken: 'ok-demo',
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('ReportsService', () => {
  describe('resolveTenantBySlug', () => {
    it('throws NotFoundException for an unknown slug', async () => {
      const prisma = makeFakePrisma({});
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      await expect(service.resolveTenantBySlug('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws GoneException for an offboarded tenant', async () => {
      const prisma = makeFakePrisma({
        tenants: [{ id: 't1', slug: 'acme', status: 'offboarded' }],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      await expect(service.resolveTenantBySlug('acme')).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('allows a suspended tenant through (consumer safety)', async () => {
      const prisma = makeFakePrisma({
        tenants: [{ id: 't1', slug: 'acme', status: 'suspended' }],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      const tenant = await service.resolveTenantBySlug('acme');
      expect(tenant.id).toBe('t1');
    });
  });

  describe('submit', () => {
    const tenant: FakeTenant = { id: 't1', slug: 'acme', status: 'active' };
    const otherTenant: FakeTenant = {
      id: 't2',
      slug: 'other',
      status: 'active',
    };

    it('rejects a failing captcha before touching the scan event', async () => {
      const prisma = makeFakePrisma({ tenants: [tenant] });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(false),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      await expect(
        service.submit('acme', baseDto(), { ip: '1.2.3.4', ipHash: 'h1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('produces an indistinguishable 404 for a cross-tenant scanEventId', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant, otherTenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: otherTenant.id,
            verdict: 'red',
            unitId: null,
            batchId: null,
            productId: null,
          },
        ],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      const crossTenant = service.submit('acme', baseDto(), {
        ip: '1.2.3.4',
        ipHash: 'h1',
      });
      const missing = service.submit(
        'acme',
        baseDto({ scanEventId: 'does-not-exist' }),
        { ip: '1.2.3.4', ipHash: 'h1' },
      );

      await expect(crossTenant).rejects.toBeInstanceOf(NotFoundException);
      await expect(missing).rejects.toBeInstanceOf(NotFoundException);
      await expect(crossTenant).rejects.toMatchObject({
        response: { message: 'scan_event_not_found' },
      });
      await expect(missing).rejects.toMatchObject({
        response: { message: 'scan_event_not_found' },
      });
    });

    it('rejects a green (non-reportable) verdict', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenant.id,
            verdict: 'green',
            unitId: null,
            batchId: null,
            productId: null,
          },
        ],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      await expect(
        service.submit('acme', baseDto(), { ip: '1.2.3.4', ipHash: 'h1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a photo owned by a different ipHash', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenant.id,
            verdict: 'red',
            unitId: null,
            batchId: null,
            productId: null,
          },
        ],
        photos: [
          {
            id: 'photo-1',
            ipHash: 'someone-elses-hash',
            reportId: null,
            status: 'pending',
          },
        ],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      await expect(
        service.submit('acme', baseDto({ photoIds: ['photo-1'] }), {
          ip: '1.2.3.4',
          ipHash: 'h1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a photo already claimed by another report', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenant.id,
            verdict: 'red',
            unitId: null,
            batchId: null,
            productId: null,
          },
        ],
        photos: [
          {
            id: 'photo-1',
            ipHash: 'h1',
            reportId: 'already-claimed',
            status: 'pending',
          },
        ],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      await expect(
        service.submit('acme', baseDto({ photoIds: ['photo-1'] }), {
          ip: '1.2.3.4',
          ipHash: 'h1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('derives unitId/batchId/productId/verdict from the ScanEvent, never from the client', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenant.id,
            verdict: 'amber',
            unitId: 'unit-9',
            batchId: 'batch-9',
            productId: 'product-9',
          },
        ],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      const result = await service.submit('acme', baseDto(), {
        ip: '1.2.3.4',
        ipHash: 'h1',
      });

      const status = await service.getPublicStatus('acme', result.reference);
      expect(status.status).toBe('new');

      // SubmitReportDto has no unitId/batchId/productId/verdict fields at all —
      // the only way these land on the Report row is via the ScanEvent lookup.
      const created = await prisma.report.findUnique({
        where: { reference: result.reference },
      });
      expect(created.unitId).toBe('unit-9');
      expect(created.batchId).toBe('batch-9');
      expect(created.productId).toBe('product-9');
      expect(created.verdictAtReport).toBe('amber');
    });

    it('sends a report.consumer_ack notification when a contact email is provided, resolving the product name', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenant.id,
            verdict: 'red',
            unitId: null,
            batchId: null,
            productId: 'product-1',
          },
        ],
        products: [{ id: 'product-1', name: 'Glow Serum' }],
      });
      const notifications = makeFakeNotifications();
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        notifications.asService(),
      );

      const result = await service.submit(
        'acme',
        baseDto({ contact: { email: 'consumer@example.com', consent: false } }),
        { ip: '1.2.3.4', ipHash: 'h1' },
      );

      expect(notifications.send).toHaveBeenCalledTimes(1);
      expect(notifications.send).toHaveBeenCalledWith(
        'report.consumer_ack',
        { email: 'consumer@example.com' },
        {
          reference: result.reference,
          productName: 'Glow Serum',
          statusUrl: result.statusUrl,
        },
        { tenantId: tenant.id },
      );
    });

    it('falls back to a generic product name and skips the notification without a contact email', async () => {
      const prisma = makeFakePrisma({
        tenants: [tenant],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenant.id,
            verdict: 'red',
            unitId: null,
            batchId: null,
            productId: null,
          },
        ],
      });
      const notifications = makeFakeNotifications();
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        notifications.asService(),
      );

      await service.submit('acme', baseDto(), {
        ip: '1.2.3.4',
        ipHash: 'h1',
      });

      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('getPublicStatus', () => {
    it('produces an indistinguishable 404 when the reference belongs to another tenant', async () => {
      const tenantA: FakeTenant = { id: 't1', slug: 'acme', status: 'active' };
      const tenantB: FakeTenant = { id: 't2', slug: 'other', status: 'active' };
      const prisma = makeFakePrisma({
        tenants: [tenantA, tenantB],
        scanEvents: [
          {
            id: 'scan-1',
            tenantId: tenantA.id,
            verdict: 'red',
            unitId: null,
            batchId: null,
            productId: null,
          },
        ],
      });
      const service = new ReportsService(
        prisma,
        new EventEmitter2(),
        new FixedCaptcha(true),
        new InMemoryConsent(),
        makeFakeNotifications().asService(),
      );
      const { reference } = await service.submit('acme', baseDto(), {
        ip: '1.2.3.4',
        ipHash: 'h1',
      });

      await expect(
        service.getPublicStatus('other', reference),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.getPublicStatus('acme', reference),
      ).resolves.toMatchObject({ status: 'new' });
    });
  });
});
