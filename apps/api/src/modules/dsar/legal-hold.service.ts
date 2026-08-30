import { Injectable } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type { LegalHold, LegalHoldScope } from '@prisma/client';

export interface CreateLegalHoldInput {
  tenantId?: string;
  scope: LegalHoldScope;
  ref: string;
  reason: string;
  createdById: string;
}

@Injectable()
export class LegalHoldService {
  async isHeld(scope: LegalHoldScope, ref: string): Promise<boolean> {
    const hold = await prisma.legalHold.findFirst({
      where: { scope, ref, releasedAt: null },
    });
    return hold !== null;
  }

  async create(input: CreateLegalHoldInput): Promise<LegalHold> {
    return prisma.legalHold.create({
      data: {
        tenantId: input.tenantId,
        scope: input.scope,
        ref: input.ref,
        reason: input.reason,
        createdById: input.createdById,
      },
    });
  }

  async release(id: string): Promise<LegalHold> {
    return prisma.legalHold.update({
      where: { id },
      data: { releasedAt: new Date() },
    });
  }
}
