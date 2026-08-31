import { Injectable } from '@nestjs/common';

/**
 * Extension point for other epics to influence the password-login pipeline
 * without AuthService knowing about them. Added for E20 (SSO & MFA policy —
 * flagged on issue #3 before landing, since E02's worktree isn't active):
 * `EnforceSsoLoginHook` implements `beforePasswordLogin` to block password
 * login for enforce-SSO tenants, and `MfaPolicyLoginHook` implements
 * `afterPrimaryAuth` to require MFA per a tenant's role policy.
 *
 * Hooks only run when a request resolves a specific tenant (`LoginDto.tenant`)
 * — a login with no tenant context has nothing for a per-tenant hook to
 * evaluate against.
 */
export interface LoginPolicyHook {
  /** Throw to block the login attempt (e.g. `ForbiddenException`). Runs before the password is checked. */
  beforePasswordLogin?(ctx: {
    tenantId: string;
    tenantSlug: string;
  }): Promise<void>;
  /** Runs after the password has been verified, before a session is issued. */
  afterPrimaryAuth?(ctx: {
    userId: string;
    tenantId: string;
    role: string;
  }): Promise<{ requireMfa: boolean; reason?: string }>;
}

/**
 * NestJS's per-module injector can't merge providers bound to the same token
 * across modules into one array (that's Angular's `multi: true`, not Nest's
 * model) — so this uses the same registration pattern this codebase already
 * uses for `QuotaService.registerKind()`: a singleton registry that
 * consuming modules (e.g. `SsoModule`, in its `onModuleInit()`) call into,
 * rather than a DI-resolved array.
 */
@Injectable()
export class LoginPolicyRegistry {
  private readonly hooks: LoginPolicyHook[] = [];

  register(hook: LoginPolicyHook): void {
    this.hooks.push(hook);
  }

  getHooks(): readonly LoginPolicyHook[] {
    return this.hooks;
  }
}
