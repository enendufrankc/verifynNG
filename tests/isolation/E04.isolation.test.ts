import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { isolationMatrix } from './isolation-matrix';
import allowlist from './allowlist.json';

const E04_CONTROLLERS = [
  'ProductsController',
  'OemsController',
  'BatchesController',
  'JobsController',
];

describe('E04 catalog/batches route isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Imported dynamically so `tests/` (no package.json of its own, resolved
    // against the repo root) only pulls in apps/api's module graph when this
    // spec actually runs.
    const { AppModule } = await import('../../apps/api/src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('every catalog/batches route is tenant-scoped or explicitly allowlisted', async () => {
    const result = await isolationMatrix({
      app,
      allowlist: allowlist.publicRoutes,
    });

    const e04Routes = result.routes.filter((r) =>
      E04_CONTROLLERS.includes(r.controllerName),
    );
    // Sanity check the matrix actually found E04's routes, so this assertion
    // can't pass vacuously if route discovery silently returns nothing.
    expect(e04Routes.length).toBeGreaterThan(0);

    const violations = e04Routes.filter(
      (r) => r.classification === 'unscoped-tenant-route',
    );
    expect(violations).toEqual([]);
  });

  it('the tier-2-bearing download route requires an operator-or-above role', async () => {
    const result = await isolationMatrix({
      app,
      allowlist: allowlist.publicRoutes,
    });

    const download = result.routes.find(
      (r) =>
        r.controllerName === 'BatchesController' &&
        r.handlerName === 'download',
    );
    expect(download).toBeDefined();
    expect(download!.hasRolesDecorator).toBe(true);
  });
});
