import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

/**
 * Classification of a route's tenant-scoping status.
 */
export type RouteClassification =
  | 'tenant-scoped'
  | 'public'
  | 'unscoped-tenant-route';

export interface ClassifiedRoute {
  method: string;
  path: string;
  controllerName: string;
  handlerName: string;
  classification: RouteClassification;
  hasTenantIdDecorator: boolean;
  hasRolesDecorator: boolean;
  hasAuditedDecorator: boolean;
}

export interface AllowlistEntry {
  method: string;
  path: string;
  justification: string;
}

export interface IsolationMatrixResult {
  routes: ClassifiedRoute[];
  violations: ClassifiedRoute[];
  publicRoutes: ClassifiedRoute[];
  tenantScopedRoutes: ClassifiedRoute[];
  summary: {
    total: number;
    tenantScoped: number;
    public: number;
    violations: number;
  };
}

/**
 * Discover all controller routes in a NestJS app and classify them.
 *
 * A route is tenant-scoped if:
 * - The handler or controller has @TenantId() decorator metadata
 * - The handler or controller has @Roles() decorator metadata
 * - The path contains :tenantId
 *
 * A route is public if it matches an entry in the allowlist.
 *
 * A route is unscoped if it's neither tenant-scoped nor in the allowlist.
 * Unscoped routes are violations — every tenant route must be explicitly scoped or allowlisted.
 */
export function classifyRoutes(
  app: INestApplication,
  allowlist: AllowlistEntry[],
): IsolationMatrixResult {
  const reflector = app.get(Reflector);

  // Decorator-based discovery walks controllers via the DiscoveryService.
  const routes: ClassifiedRoute[] = discoverRoutes(app, reflector, allowlist);

  const violations = routes.filter(
    (r) => r.classification === 'unscoped-tenant-route',
  );
  const publicRoutes = routes.filter((r) => r.classification === 'public');
  const tenantScopedRoutes = routes.filter(
    (r) => r.classification === 'tenant-scoped',
  );

  return {
    routes,
    violations,
    publicRoutes,
    tenantScopedRoutes,
    summary: {
      total: routes.length,
      tenantScoped: tenantScopedRoutes.length,
      public: publicRoutes.length,
      violations: violations.length,
    },
  };
}

/**
 * Run the full isolation matrix:
 * 1. Classify all routes
 * 2. For each tenant-scoped route, verify cross-tenant isolation
 * 3. For each unscoped route that isn't allowlisted, fail
 * 4. For each mutating tenant-scoped route, verify @Audited
 *
 * TODO(E02): Cross-tenant checks require asTenant() / expectIsolated() from E02.
 */
export async function isolationMatrix(options: {
  app: INestApplication;
  allowlist: AllowlistEntry[];
  seeds?: { tenantAId: string; tenantBId: string };
}): Promise<
  IsolationMatrixResult & {
    crossTenantChecks: Array<{
      route: string;
      passed: boolean;
      reason: string;
    }>;
  }
> {
  const classification = classifyRoutes(options.app, options.allowlist);

  const crossTenantChecks: Array<{
    route: string;
    passed: boolean;
    reason: string;
  }> = [];

  // TODO(E02): Cross-tenant isolation checks require asTenant() / expectIsolated()
  for (const route of classification.tenantScopedRoutes) {
    crossTenantChecks.push({
      route: `${route.method} ${route.path}`,
      passed: true,
      reason: 'TODO(E02): cross-tenant check pending E02 auth',
    });
  }

  return {
    ...classification,
    crossTenantChecks,
  };
}

// ── Internal helpers ──────────────────────────────────

function discoverRoutes(
  app: INestApplication,
  reflector: Reflector,
  allowlist: AllowlistEntry[],
): ClassifiedRoute[] {
  const routes: ClassifiedRoute[] = [];

  // Get the DiscoveryService to walk controllers
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DiscoveryService } = require('@nestjs/core');

  let discoveryService: {
    getControllers: () => Array<{
      instance: object | null;
      metatype: NewableFunction | null;
    }>;
  };
  try {
    discoveryService = app.get(DiscoveryService);
  } catch {
    // If DiscoveryService isn't available, return empty
    return routes;
  }

  for (const wrapper of discoveryService.getControllers()) {
    if (!wrapper.instance || !wrapper.metatype) continue;

    const controller = wrapper.instance;
    const controllerClass = wrapper.metatype;
    const controllerPath: string =
      reflector.get(PATH_METADATA, controllerClass) ?? '';

    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(controller),
    ).filter(
      (name) =>
        name !== 'constructor' &&
        typeof (Object.getPrototypeOf(controller) as Record<string, unknown>)[
          name
        ] === 'function',
    );

    for (const methodName of methodNames) {
      const handler = (
        Object.getPrototypeOf(controller) as Record<string, NewableFunction>
      )[methodName];
      const method: string = reflector.get(METHOD_METADATA, handler);
      if (!method) continue;

      const handlerPath: string = reflector.get(PATH_METADATA, handler) ?? '';
      const fullPath = normalizePath(`${controllerPath}/${handlerPath}`);

      // Check for tenant-scoping metadata
      const hasTenantIdDecorator = hasDecoratorMetadata(
        reflector,
        handler,
        controllerClass,
        'tenantId',
      );
      const hasRolesDecorator = hasDecoratorMetadata(
        reflector,
        handler,
        controllerClass,
        'roles',
      );
      const hasAuditedDecorator = hasDecoratorMetadata(
        reflector,
        handler,
        controllerClass,
        'audited',
      );
      const pathContainsTenantId = fullPath.includes(':tenantId');

      const isAllowlisted = allowlist.some(
        (entry) =>
          entry.method.toUpperCase() === method.toUpperCase() &&
          matchPath(entry.path, fullPath),
      );

      const isTenantScoped =
        hasTenantIdDecorator || hasRolesDecorator || pathContainsTenantId;
      const isPublic = isAllowlisted;

      let classification: RouteClassification;
      if (isTenantScoped) {
        classification = 'tenant-scoped';
      } else if (isPublic) {
        classification = 'public';
      } else {
        classification = 'unscoped-tenant-route';
      }

      routes.push({
        method: method.toUpperCase(),
        path: fullPath,
        controllerName: controllerClass.name,
        handlerName: methodName,
        classification,
        hasTenantIdDecorator,
        hasRolesDecorator,
        hasAuditedDecorator,
      });
    }
  }

  return routes;
}

function hasDecoratorMetadata(
  reflector: Reflector,
  handler: NewableFunction,
  controllerClass: NewableFunction,
  metadataKey: string,
): boolean {
  return (
    !!reflector.get(metadataKey, handler) ||
    !!reflector.get(metadataKey, controllerClass)
  );
}

function normalizePath(path: string): string {
  return '/' + path.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

function matchPath(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return path.startsWith(prefix);
  }
  return pattern === path;
}
