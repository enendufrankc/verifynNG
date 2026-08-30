import {
  Injectable,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, TenantRole } from '@prisma/client';
import { hashForStorage } from '@verifynng/core';
import { MAILER, type Mailer } from '../auth/mailer/mailer.interface';
import crypto from 'node:crypto';

@Injectable()
export class MembershipService {
  constructor(
    private prisma: PrismaClient,
    private eventEmitter: EventEmitter2,
    @Inject(MAILER) private mailer: Mailer,
  ) {}

  async addOwner(userId: string, tenantId: string) {
    return this.prisma.membership.create({
      data: { userId, tenantId, role: 'owner' },
    });
  }

  async listForTenant(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
    });
  }

  async invite(
    tenantId: string,
    email: string,
    role: TenantRole,
    invitedBy: string,
  ) {
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email, displayName: email.split('@')[0] },
      });
    }

    const existing = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member');
    }

    const membership = await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role },
    });

    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = hashForStorage(token);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    try {
      await this.mailer.send({
        to: email,
        template: 'set-password',
        vars: { token },
      });
    } catch {
      // Mail failure shouldn't block invite
    }

    this.eventEmitter.emit('member.invited', {
      tenantId,
      userId: user.id,
      role,
      invitedBy,
      at: new Date(),
    });

    return membership;
  }

  async setRole(
    tenantId: string,
    userId: string,
    newRole: TenantRole,
    changedBy: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await this.prisma.membership.count({
        where: { tenantId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({ error: 'last_owner' });
      }
    }

    const oldRole = membership.role;
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: newRole },
    });

    this.eventEmitter.emit('member.role.changed', {
      tenantId,
      userId,
      from: oldRole,
      to: newRole,
      changedBy,
      at: new Date(),
    });

    return updated;
  }

  async remove(tenantId: string, userId: string, removedBy: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === 'owner') {
      const ownerCount = await this.prisma.membership.count({
        where: { tenantId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({ error: 'last_owner' });
      }
    }

    await this.prisma.membership.delete({
      where: { id: membership.id },
    });

    this.eventEmitter.emit('member.removed', {
      tenantId,
      userId,
      removedBy,
      at: new Date(),
    });
  }
}
