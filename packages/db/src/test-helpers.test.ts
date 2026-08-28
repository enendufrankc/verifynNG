import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from './test-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

// This test requires DATABASE_URL pointing at a running Postgres
describe.skipIf(!DATABASE_URL)('createTestDatabase', () => {
  let result: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    result = await createTestDatabase('helpers-test');
  });

  afterAll(async () => {
    if (result) {
      await dropTestSchema(result.schemaName, result.prisma);
      await disconnectTestHelper();
    }
  });

  it('creates a schema and returns a working PrismaClient', async () => {
    expect(result.schemaName).toMatch(/^test_helpers_test_/);
    // Can query the isolated schema
    const count = await result.prisma.tenant.count();
    expect(count).toBe(0);
  });

  it('isolates data between schemas', async () => {
    // Insert in test schema
    await result.prisma.tenant.create({
      data: { slug: 'test-1', name: 'Test', status: 'pending' },
    });
    const count = await result.prisma.tenant.count();
    expect(count).toBe(1);
  });
});
