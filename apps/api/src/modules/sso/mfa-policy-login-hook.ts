import { Injectable } from '@nestjs/common';
import type { LoginPolicyHook } from '../auth/login-policy-hook';
import { MfaPolicyService } from './mfa-policy.service';

/**
 * E02 `LoginPolicyHook.afterPrimaryAuth`. Native `AuthService` already forces
 * a TOTP challenge for any user with `mfaEnabled: true` — this hook only has
 * something to say for a not-yet-enrolled user whose tenant role requires
 * MFA: within grace, or past it (enrolment now mandatory).
 */
@Injectable()
export class MfaPolicyLoginHook implements LoginPolicyHook {
  constructor(private readonly mfaPolicyService: MfaPolicyService) {}

  async afterPrimaryAuth(ctx: {
    userId: string;
    tenantId: string;
    role: string;
  }): Promise<{ requireMfa: boolean; reason?: string; graceUntil?: Date }> {
    const evaluation = await this.mfaPolicyService.evaluate(
      ctx.userId,
      ctx.tenantId,
      ctx.role,
    );
    if (!evaluation.required || !evaluation.inGraceUntil) {
      return { requireMfa: false };
    }

    if (new Date() > evaluation.inGraceUntil) {
      return { requireMfa: true, reason: 'enrolment_required' };
    }
    return {
      requireMfa: true,
      reason: 'grace',
      graceUntil: evaluation.inGraceUntil,
    };
  }
}
