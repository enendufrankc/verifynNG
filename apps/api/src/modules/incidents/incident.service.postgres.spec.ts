import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
  prisma,
} from '@verifynng/db';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { IncidentService } from './incident.service';

describe('IncidentService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const events = { emit: vi.fn() };
  const service = new IncidentService(events as never);

  beforeAll(async () => {
    testDb = await createTestDatabase('incident');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await dropTestSchema(testDb.schemaName, testDb.prisma);
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  function proxyPrisma() {
    for (const method of [
      'create',
      'findUniqueOrThrow',
      'update',
      'findMany',
    ] as const) {
      vi.spyOn(prisma.incident, method).mockImplementation(((args: never) =>
        (testDb.prisma.incident[method] as (a: never) => unknown)(
          args,
        )) as never);
    }
  }

  it('open() sets a 72h NDPC deadline for high severity with personal-data categories', async () => {
    proxyPrisma();
    const detectedAt = new Date('2026-08-30T10:00:00.000Z');
    const incident = await service.open({
      title: 'Test leak',
      severity: 'high',
      detectedAt,
      dataCategories: ['report.contactEmail'],
      affectedTenantIds: ['ivoryglow'],
      openedById: 'support-1',
    });

    expect(incident.ndpcNotifyRequired).toBe(true);
    expect(incident.ndpcNotifyDeadline?.toISOString()).toBe(
      '2026-09-02T10:00:00.000Z',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'incident.opened',
      expect.objectContaining({ incidentId: incident.id, severity: 'high' }),
    );
  });

  it('open() does not require NDPC notice for low severity', async () => {
    proxyPrisma();
    const incident = await service.open({
      title: 'Minor blip',
      severity: 'low',
      detectedAt: new Date(),
      dataCategories: ['report.contactEmail'],
      affectedTenantIds: [],
      openedById: 'support-1',
    });
    expect(incident.ndpcNotifyRequired).toBe(false);
    expect(incident.ndpcNotifyDeadline).toBeNull();
  });

  it('open() does not require NDPC notice when no personal-data category is involved', async () => {
    proxyPrisma();
    const incident = await service.open({
      title: 'Infra blip, no data exposure',
      severity: 'critical',
      detectedAt: new Date(),
      dataCategories: [],
      affectedTenantIds: [],
      openedById: 'support-1',
    });
    expect(incident.ndpcNotifyRequired).toBe(false);
  });

  it('update() appends to the timeline and close() sets closedAt', async () => {
    proxyPrisma();
    const incident = await service.open({
      title: 'To close',
      severity: 'low',
      detectedAt: new Date(),
      dataCategories: [],
      affectedTenantIds: [],
      openedById: 'support-1',
    });
    const closed = await service.close(incident.id, 'support-1');
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect((closed.timeline as unknown[]).length).toBeGreaterThan(1);
  });
});
