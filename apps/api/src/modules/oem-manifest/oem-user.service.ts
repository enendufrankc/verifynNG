import crypto from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashForStorage } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { EventsService } from '../../common/events.service';
import { NotificationService } from '../notifications/notifications.service';

export interface InviteOemUserInput {
  email: string;
  displayName: string;
}

@Injectable()
export class OemUserService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private notifications: NotificationService,
    private events: EventsService,
  ) {}

  async invite(
    tenantId: string,
    oemId: string,
    input: InviteOemUserInput,
    invitedById: string,
  ) {
    const oem = await this.prisma.oem.findFirst({
      where: { id: oemId, tenantId },
    });
    if (!oem) throw new NotFoundException('OEM not found');

    let user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (user) {
      const existing = await this.prisma.oemUser.findUnique({
        where: { userId: user.id },
      });
      if (existing) throw new ConflictException('user_already_oem');
    } else {
      user = await this.prisma.user.create({
        data: { email: input.email, displayName: input.displayName, tenantId },
      });
    }

    await this.prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      update: { role: 'oem' },
      create: { userId: user.id, tenantId, role: 'oem' },
    });

    const oemUser = await this.prisma.oemUser.create({
      data: { tenantId, oemId, userId: user.id, invitedById },
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

    const env = loadEnv();
    await this.notifications.send(
      'password.reset',
      { email: user.email },
      {
        resetUrl: `${env.APP_BASE_URL}/set-password?token=${token}`,
        expiresIn: '7 days',
      },
      { tenantId },
    );

    await this.events.emit('oem.user.invited', {
      tenantId,
      oemId,
      userId: user.id,
      invitedById,
    });

    return oemUser;
  }

  async list(tenantId: string, oemId: string) {
    return this.prisma.oemUser.findMany({
      where: { tenantId, oemId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async remove(
    tenantId: string,
    oemId: string,
    oemUserId: string,
  ): Promise<void> {
    const oemUser = await this.prisma.oemUser.findFirst({
      where: { id: oemUserId, tenantId, oemId },
    });
    if (!oemUser) throw new NotFoundException('OEM user not found');

    await this.prisma.membership.deleteMany({
      where: { userId: oemUser.userId, tenantId },
    });
    await this.prisma.oemUser.delete({ where: { id: oemUserId } });
  }
}
