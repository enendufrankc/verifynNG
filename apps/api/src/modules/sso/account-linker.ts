import { Injectable } from '@nestjs/common';
import { PrismaClient, SsoProvider, TenantRole } from '@prisma/client';

export interface OidcClaims {
  sub: string;
  email: string;
  domain: string;
}

export interface AccountLinkerConfig {
  allowedDomains: string[];
  jitProvisioning: boolean;
  jitDefaultRole: string;
}

export type AccountLinkResult =
  | {
      outcome: 'linked' | 'jit';
      userId: string;
      membershipCreated: boolean;
      role: string;
    }
  | {
      outcome: 'rejected';
      reason: 'domain_not_allowed' | 'jit_disabled';
    };

/**
 * (provider, sub) is the durable identity link — email is only used to find
 * or provision the initial link, so an IdP-side email rename never creates a
 * duplicate account or lets someone hijack a link by registering a matching
 * email elsewhere.
 */
@Injectable()
export class AccountLinker {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(
    tenantId: string,
    provider: SsoProvider,
    claims: OidcClaims,
    config: AccountLinkerConfig,
  ): Promise<AccountLinkResult> {
    const identity = await this.prisma.ssoIdentity.findUnique({
      where: {
        tenantId_provider_subject: { tenantId, provider, subject: claims.sub },
      },
    });
    if (identity) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId: identity.userId, tenantId } },
      });
      // A membership removed after the identity was linked falls through to
      // re-resolution below rather than trusting a stale link.
      if (membership) {
        await this.prisma.ssoIdentity.update({
          where: { id: identity.id },
          data: { lastLoginAt: new Date(), email: claims.email },
        });
        return {
          outcome: 'linked',
          userId: identity.userId,
          membershipCreated: false,
          role: membership.role,
        };
      }
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: claims.email },
    });
    if (existingUser) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId: existingUser.id, tenantId } },
      });
      if (membership) {
        await this.prisma.ssoIdentity.create({
          data: {
            tenantId,
            userId: existingUser.id,
            provider,
            subject: claims.sub,
            email: claims.email,
            lastLoginAt: new Date(),
          },
        });
        return {
          outcome: 'linked',
          userId: existingUser.id,
          membershipCreated: false,
          role: membership.role,
        };
      }
    }

    if (!config.allowedDomains.includes(claims.domain)) {
      return { outcome: 'rejected', reason: 'domain_not_allowed' };
    }
    if (!config.jitProvisioning) {
      return { outcome: 'rejected', reason: 'jit_disabled' };
    }

    const role = config.jitDefaultRole as TenantRole;
    const created = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email: claims.email,
            displayName: claims.email.split('@')[0],
          },
        }));
      const membership = await tx.membership.create({
        data: { userId: user.id, tenantId, role, createdVia: 'jit' },
      });
      await tx.ssoIdentity.create({
        data: {
          tenantId,
          userId: user.id,
          provider,
          subject: claims.sub,
          email: claims.email,
          lastLoginAt: new Date(),
        },
      });
      return { userId: user.id, role: membership.role };
    });

    return {
      outcome: 'jit',
      userId: created.userId,
      membershipCreated: true,
      role: created.role,
    };
  }
}
