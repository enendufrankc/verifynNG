import { PrismaClient } from '@prisma/client';
import { scanEventAppendOnlyExtension } from './scan-event-extension.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const baseClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

export const prisma = baseClient.$extends(scanEventAppendOnlyExtension());

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = baseClient;
}
