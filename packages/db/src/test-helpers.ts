import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const rootPrisma = new PrismaClient();

/**
 * Creates an isolated test database schema, runs migrations, and returns
 * a PrismaClient pointed at that schema. Callers should call
 * `testDb.disconnect()` in their afterAll hook.
 */
export async function createTestDatabase(
  testFilePath?: string,
): Promise<{ prisma: PrismaClient; schemaName: string }> {
  const slug = testFilePath
    ? testFilePath
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()
        .slice(0, 40)
    : `test_${Date.now()}`;
  const schemaName = `test_${slug}_${process.pid}`;

  await rootPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);

  const testDatabaseUrl = process.env.DATABASE_URL!.replace(
    /\?schema=public/,
    `?schema=${schemaName}`,
  );

  // Run migrations against the test schema
  execSync(
    `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`,
    {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'pipe',
    },
  );

  const testPrisma = new PrismaClient({
    datasources: {
      db: { url: testDatabaseUrl },
    },
  });

  return {
    prisma: testPrisma,
    schemaName,
  };
}

/**
 * Drops the test schema and disconnects. Call in afterAll.
 */
export async function dropTestSchema(
  schemaName: string,
  testPrisma: PrismaClient,
): Promise<void> {
  await testPrisma.$disconnect();
  await rootPrisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
  );
}

/**
 * Disconnect the root helper client (call once at the very end of the test run).
 */
export async function disconnectTestHelper(): Promise<void> {
  await rootPrisma.$disconnect();
}
