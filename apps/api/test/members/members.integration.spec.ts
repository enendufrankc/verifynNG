import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient, Tenant } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant as makeTenant, user as makeUser } from '@verifynng/db/testing';
import { MembershipService } from '../../src/modules/members/members.service';
import type {
  Mailer,
  MailMessage,
} from '../../src/modules/auth/mailer/mailer.interface';

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
  }
}

let counter = 0;
function uniqueEmail(): string {
  return `member_${++counter}_${Date.now()}@x.io`;
}

describe('MembershipService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: MembershipService;
  let mailer: FakeMailer;
  let events: EventEmitter2;
  let tenant: Tenant;

  beforeAll(async () => {
    const db = await createTestDatabase('members-service-integration-test');
    prisma = db.prisma;
    schemaName = db.schemaName;
    mailer = new FakeMailer();
    events = new EventEmitter2();
    service = new MembershipService(prisma, events, mailer);
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('addOwner creates an owner membership', async () => {
    tenant = await makeTenant(prisma);
    const owner = await makeUser(prisma);
    const membership = await service.addOwner(owner.id, tenant.id);
    expect(membership.role).toBe('owner');
    expect(membership.tenantId).toBe(tenant.id);
  });

  it('invite creates a new user, a membership, a reset token, and sends a mail', async () => {
    const t = await makeTenant(prisma);
    const inviter = await makeUser(prisma);
    await service.addOwner(inviter.id, t.id);

    const email = uniqueEmail();
    const before = mailer.sent.length;
    let invitedEvent: unknown;
    events.once('member.invited', (payload) => (invitedEvent = payload));

    const membership = await service.invite(
      t.id,
      email,
      'operator',
      inviter.id,
    );
    expect(membership.role).toBe('operator');

    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email },
    });
    expect(invitedUser.passwordHash).toBeNull();

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { userId: invitedUser.id },
    });
    expect(resetToken).not.toBeNull();

    expect(mailer.sent.length).toBe(before + 1);
    expect(mailer.sent[mailer.sent.length - 1]).toMatchObject({
      to: email,
      template: 'set-password',
    });
    expect(invitedEvent).toMatchObject({
      tenantId: t.id,
      userId: invitedUser.id,
      role: 'operator',
      invitedBy: inviter.id,
    });
  });

  it('invite reuses an existing user by email instead of creating a duplicate', async () => {
    const t1 = await makeTenant(prisma);
    const t2 = await makeTenant(prisma);
    const email = uniqueEmail();

    await service.invite(t1.id, email, 'viewer', 'inviter-1');
    const userAfterFirst = await prisma.user.findUniqueOrThrow({
      where: { email },
    });

    await service.invite(t2.id, email, 'operator', 'inviter-2');
    const userAfterSecond = await prisma.user.findUniqueOrThrow({
      where: { email },
    });

    expect(userAfterSecond.id).toBe(userAfterFirst.id);
    const memberships = await prisma.membership.findMany({
      where: { userId: userAfterFirst.id },
    });
    expect(memberships).toHaveLength(2);
  });

  it('invite rejects a user who is already a member of that tenant', async () => {
    const t = await makeTenant(prisma);
    const email = uniqueEmail();
    await service.invite(t.id, email, 'viewer', 'inviter');
    await expect(
      service.invite(t.id, email, 'operator', 'inviter'),
    ).rejects.toThrow();
  });

  it('setRole changes a non-owner role and emits member.role.changed', async () => {
    const t = await makeTenant(prisma);
    const member = await makeUser(prisma);
    await prisma.membership.create({
      data: { userId: member.id, tenantId: t.id, role: 'viewer' },
    });

    let changedEvent: unknown;
    events.once('member.role.changed', (payload) => (changedEvent = payload));

    const updated = await service.setRole(
      t.id,
      member.id,
      'operator',
      'admin-1',
    );
    expect(updated.role).toBe('operator');
    expect(changedEvent).toMatchObject({
      tenantId: t.id,
      userId: member.id,
      from: 'viewer',
      to: 'operator',
      changedBy: 'admin-1',
    });
  });

  it('refuses to demote the last owner', async () => {
    const t = await makeTenant(prisma);
    const owner = await makeUser(prisma);
    await service.addOwner(owner.id, t.id);

    try {
      await service.setRole(t.id, owner.id, 'operator', 'admin-1');
      throw new Error('expected setRole to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({
        error: 'last_owner',
      });
    }
  });

  it('allows demoting an owner when another owner remains', async () => {
    const t = await makeTenant(prisma);
    const ownerA = await makeUser(prisma);
    const ownerB = await makeUser(prisma);
    await service.addOwner(ownerA.id, t.id);
    await service.addOwner(ownerB.id, t.id);

    const updated = await service.setRole(
      t.id,
      ownerA.id,
      'operator',
      'admin-1',
    );
    expect(updated.role).toBe('operator');
  });

  it('refuses to remove the last owner', async () => {
    const t = await makeTenant(prisma);
    const owner = await makeUser(prisma);
    await service.addOwner(owner.id, t.id);

    await expect(service.remove(t.id, owner.id, 'admin-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('removes a non-owner member and emits member.removed', async () => {
    const t = await makeTenant(prisma);
    const member = await makeUser(prisma);
    await prisma.membership.create({
      data: { userId: member.id, tenantId: t.id, role: 'viewer' },
    });

    let removedEvent: unknown;
    events.once('member.removed', (payload) => (removedEvent = payload));

    await service.remove(t.id, member.id, 'admin-1');

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: member.id, tenantId: t.id } },
    });
    expect(membership).toBeNull();
    expect(removedEvent).toMatchObject({
      tenantId: t.id,
      userId: member.id,
      removedBy: 'admin-1',
    });
  });

  it('listForTenant returns members with user details', async () => {
    const t = await makeTenant(prisma);
    const owner = await makeUser(prisma);
    await service.addOwner(owner.id, t.id);

    const members = await service.listForTenant(t.id);
    expect(members).toHaveLength(1);
    expect(members[0].user.id).toBe(owner.id);
  });

  it('listForUser returns every tenant a user belongs to', async () => {
    const t1 = await makeTenant(prisma);
    const t2 = await makeTenant(prisma);
    const person = await makeUser(prisma);
    await service.addOwner(person.id, t1.id);
    await service.addOwner(person.id, t2.id);

    const memberships = await service.listForUser(person.id);
    expect(memberships.map((m) => m.tenantId).sort()).toEqual(
      [t1.id, t2.id].sort(),
    );
  });
});
