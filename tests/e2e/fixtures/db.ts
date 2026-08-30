import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/** Shared PrismaClient for E2E fixture setup — reads DATABASE_URL from env. */
export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}
