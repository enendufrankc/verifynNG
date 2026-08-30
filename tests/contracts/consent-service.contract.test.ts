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

/**
 * Contract: ConsentService.record() / has(), as E19's epic file promises to
 * E08 (report contact checkbox → 'contact_followup') and E14
 * (marketing-send gate via has(subject,'marketing')).
 *
 * Neither E08 nor E14 calls this yet (E08 has no Report model on `main`;
 * E14's NotificationService.send() has no marketing-consent gate wired in
 * — there's no current caller to gate). This test fixes the shape both
 * would need to code against, so it breaks loudly if E19 ever changes it
 * incompatibly, and can be pointed at their real call sites the moment
 * they exist.
 */
describe('Contract: ConsentService (for E08, E14)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    testDb = await createTestDatabase('contract-consent');
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
    vi.spyOn(prisma.consentRecord, 'create').mockImplementation(((
      args: never,
    ) => testDb.prisma.consentRecord.create(args)) as never);
    vi.spyOn(prisma.consentRecord, 'findFirst').mockImplementation(((
      args: never,
    ) => testDb.prisma.consentRecord.findFirst(args)) as never);
  }

  it('E08 contract: recording a report contact-consent checkbox', async () => {
    const { ConsentService } = await import(
      '../../apps/api/src/modules/consent/consent.service'
    );
    proxyPrisma();
    const service = new ConsentService({ emit: vi.fn() } as never);

    // This is the exact call shape E08's report-submission handler would
    // make when a consumer ticks "you may contact me about this report".
    const record = await service.record({
      subjectType: 'consumer',
      subjectRef: 'sha256-of-lowercased-email-plus-salt', // never a raw email
      purpose: 'contact_followup',
      granted: true,
      source: 'report_form',
      tenantId: 'ivoryglow',
    });

    expect(record.subjectType).toBe('consumer');
    expect(record.purpose).toBe('contact_followup');
    expect(record.granted).toBe(true);

    await expect(
      service.has(
        'consumer',
        'sha256-of-lowercased-email-plus-salt',
        'contact_followup',
      ),
    ).resolves.toBe(true);
  });

  it("E14 contract: has(subject, 'marketing') gates a non-transactional send", async () => {
    const { ConsentService } = await import(
      '../../apps/api/src/modules/consent/consent.service'
    );
    proxyPrisma();
    const service = new ConsentService({ emit: vi.fn() } as never);

    // No consent recorded yet — E14's send() should treat this as "do not send".
    await expect(
      service.has('user', 'user-without-marketing-consent', 'marketing'),
    ).resolves.toBe(false);

    // User opts in via the preferences screen (admin_preferences source).
    await service.record({
      subjectType: 'user',
      subjectRef: 'user-without-marketing-consent',
      purpose: 'marketing',
      granted: true,
      source: 'admin_preferences',
      tenantId: 'ivoryglow',
    });
    await expect(
      service.has('user', 'user-without-marketing-consent', 'marketing'),
    ).resolves.toBe(true);

    // Latest record wins — an opt-out after opting in must flip the gate.
    await service.record({
      subjectType: 'user',
      subjectRef: 'user-without-marketing-consent',
      purpose: 'marketing',
      granted: false,
      source: 'admin_preferences',
      tenantId: 'ivoryglow',
    });
    await expect(
      service.has('user', 'user-without-marketing-consent', 'marketing'),
    ).resolves.toBe(false);
  });
});
