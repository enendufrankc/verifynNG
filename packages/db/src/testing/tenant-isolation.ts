import crypto from 'node:crypto';
import { Prisma, type PrismaClient, type Tenant } from '@prisma/client';
import request from 'supertest';
import { StaticKeyRing, hashForStorage } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';

/**
 * Shared cross-tenant isolation harness. Every epic that adds tenant-scoped
 * routes builds `IsolationRoute[]` describing them and calls
 * `assertTenantIsolation()` from `apps/api/test/isolation/<epic>.isolation.spec.ts`.
 * See docs/auth.md for usage.
 */

export interface TenantFixtureMember {
  user: { id: string; email: string };
  sessionId: string;
  accessToken: string;
}

export interface TenantFixture {
  tenant: Tenant;
  owner: TenantFixtureMember;
  operator: TenantFixtureMember;
  viewer: TenantFixtureMember;
}

function parseAccessTtlSeconds(value: string): number {
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 900;
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(match[1], 10) * unit[match[2]];
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Signs an access token in the exact format `TokenService.issueAccessToken`
 * produces (HS256, `kid` header from the active JWT_KEYS entry), so tokens
 * minted here are accepted by the real running app.
 */
function signTestAccessToken(claims: {
  sub: string;
  tid: string;
  role: string;
  sid: string;
}): string {
  const env = loadEnv();
  const keyRing = new StaticKeyRing(env.JWT_KEYS, env.JWT_ACTIVE_KID);
  const { kid, secret } = keyRing.active();
  const ttlSeconds = parseAccessTtlSeconds(env.JWT_ACCESS_TTL);

  const header = { alg: 'HS256', typ: 'JWT', kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: claims.sub,
    tid: claims.tid,
    role: claims.role,
    sid: claims.sid,
    typ: 'access',
    iat: now,
    exp: now + ttlSeconds,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(
    crypto.createHmac('sha256', secret).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}

async function createMember(
  prisma: PrismaClient,
  tenantId: string,
  role: 'owner' | 'operator' | 'viewer',
  label: string,
): Promise<TenantFixtureMember> {
  const email = `${label}-${role}-${crypto.randomUUID()}@isolation.test`;
  const user = await prisma.user.create({
    data: { email, displayName: `${label} ${role}` },
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId, role },
  });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tenantId,
      refreshTokenHash: hashForStorage(crypto.randomUUID()),
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  const accessToken = signTestAccessToken({
    sub: user.id,
    tid: tenantId,
    role,
    sid: session.id,
  });

  return {
    user: { id: user.id, email: user.email },
    sessionId: session.id,
    accessToken,
  };
}

async function createTenantFixture(
  prisma: PrismaClient,
  label: string,
): Promise<TenantFixture> {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `isolation-${label}-${crypto.randomUUID()}`,
      name: `Isolation Tenant ${label}`,
      status: 'active',
    },
  });
  const [owner, operator, viewer] = await Promise.all([
    createMember(prisma, tenant.id, 'owner', label),
    createMember(prisma, tenant.id, 'operator', label),
    createMember(prisma, tenant.id, 'viewer', label),
  ]);
  return { tenant, owner, operator, viewer };
}

/** Creates two independent tenants, each with an owner/operator/viewer and a valid access token per member. */
export async function createTwoTenants(
  prisma: PrismaClient,
): Promise<{ a: TenantFixture; b: TenantFixture }> {
  const [a, b] = await Promise.all([
    createTenantFixture(prisma, 'a'),
    createTenantFixture(prisma, 'b'),
  ]);
  return { a, b };
}

export type IsolationMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface IsolationRoute {
  method: IsolationMethod;
  /** Builds the request path against the "other" tenant's fixture (the one being probed). */
  path: (other: TenantFixture) => string;
  body?: unknown;
  /** The status a cross-tenant call must return: 404 for the default rule, 403 for @PlatformRole exceptions. */
  expectWhenCrossTenant: 404 | 403;
}

export interface NestAppLike {
  getHttpServer(): Parameters<typeof request>[0];
}

interface TenantSnapshotEntry {
  count: number;
  latestUpdatedAt: number;
}

type TenantSnapshot = Record<string, TenantSnapshotEntry>;

function tenantScopedModelDelegates(): Array<{
  modelName: string;
  delegateKey: string;
  hasUpdatedAt: boolean;
}> {
  return Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'tenantId'))
    .map((model) => ({
      modelName: model.name,
      delegateKey: model.name.charAt(0).toLowerCase() + model.name.slice(1),
      hasUpdatedAt: model.fields.some((field) => field.name === 'updatedAt'),
    }));
}

/** Snapshots row counts + latest updatedAt for every tenant-scoped model, keyed by model name. */
async function snapshotTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<TenantSnapshot> {
  const snapshot: TenantSnapshot = {};
  for (const model of tenantScopedModelDelegates()) {
    const delegate = (
      prisma as unknown as Record<
        string,
        { findMany: (args: unknown) => Promise<unknown[]> }
      >
    )[model.delegateKey];
    if (!delegate?.findMany) continue;

    const rows = (await delegate.findMany({
      where: { tenantId },
      select: model.hasUpdatedAt ? { updatedAt: true } : { id: true },
    })) as Array<{ updatedAt?: Date }>;

    const latestUpdatedAt = model.hasUpdatedAt
      ? rows.reduce((max, row) => Math.max(max, row.updatedAt!.getTime()), 0)
      : 0;

    snapshot[model.modelName] = { count: rows.length, latestUpdatedAt };
  }
  return snapshot;
}

function diffSnapshots(
  before: TenantSnapshot,
  after: TenantSnapshot,
): string[] {
  const changes: string[] = [];
  for (const modelName of Object.keys(before)) {
    if (
      before[modelName].count !== after[modelName].count ||
      before[modelName].latestUpdatedAt !== after[modelName].latestUpdatedAt
    ) {
      changes.push(
        `${modelName} (before=${JSON.stringify(before[modelName])}, after=${JSON.stringify(after[modelName])})`,
      );
    }
  }
  return changes;
}

/**
 * For each route: calls it as tenant A's owner against tenant B's resources and asserts
 * the response status matches `expectWhenCrossTenant`, and that no tenant-B-scoped row
 * changed as a result (row count + latest updatedAt across every model with a tenantId field).
 *
 * Throws (failing the calling test) on the first violation found.
 */
export async function assertTenantIsolation(
  app: NestAppLike,
  prisma: PrismaClient,
  routes: IsolationRoute[],
): Promise<void> {
  const { a, b } = await createTwoTenants(prisma);
  const server = app.getHttpServer();

  for (const route of routes) {
    const path = route.path(b);
    const before = await snapshotTenant(prisma, b.tenant.id);

    let req = request(server)
      [route.method](path)
      .set('Authorization', `Bearer ${a.owner.accessToken}`);
    if (route.body !== undefined) {
      req = req.send(route.body as never);
    }

    const response = await req;

    if (response.status !== route.expectWhenCrossTenant) {
      throw new Error(
        `Tenant isolation violation: ${route.method.toUpperCase()} ${path} returned ${response.status}, expected ${route.expectWhenCrossTenant} (body: ${JSON.stringify(response.body)})`,
      );
    }

    const after = await snapshotTenant(prisma, b.tenant.id);
    const changes = diffSnapshots(before, after);
    if (changes.length > 0) {
      throw new Error(
        `Tenant isolation violation: ${route.method.toUpperCase()} ${path} changed tenant B rows: ${changes.join(', ')}`,
      );
    }
  }
}
