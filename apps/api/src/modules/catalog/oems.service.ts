import {
  Injectable,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { PrismaClient, Oem, Prisma } from '@prisma/client';
import { EventsService } from '../../common/events.service';

@Injectable()
export class OemsService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private events: EventsService,
  ) {}

  async list(tenantId: string): Promise<Oem[]> {
    return this.prisma.oem.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, oemId: string): Promise<Oem> {
    const oem = await this.prisma.oem.findFirst({
      where: { id: oemId, tenantId },
    });
    if (!oem) throw new NotFoundException('OEM not found');
    return oem;
  }

  async create(
    tenantId: string,
    dto: {
      name: string;
      country?: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      notes?: string;
    },
  ): Promise<Oem> {
    try {
      const oem = await this.prisma.oem.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          country: dto.country,
          contactName: dto.contactName,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          address: dto.address,
          notes: dto.notes,
        },
      });
      await this.events.emit('oem.created', {
        tenantId,
        oemId: oem.id,
        name: oem.name,
        country: oem.country ?? undefined,
        at: new Date(),
      });
      return oem;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        (e.meta?.target as string[])?.includes('name')
      ) {
        throw new ConflictException('duplicate_oem_name');
      }
      throw e;
    }
  }

  async update(
    tenantId: string,
    oemId: string,
    dto: {
      name?: string;
      country?: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      notes?: string;
    },
  ): Promise<Oem> {
    await this.get(tenantId, oemId);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.notes !== undefined) data.notes = dto.notes;

    try {
      return await this.prisma.oem.update({ where: { id: oemId }, data });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        (e.meta?.target as string[])?.includes('name')
      ) {
        throw new ConflictException('duplicate_oem_name');
      }
      throw e;
    }
  }

  async setStatus(
    tenantId: string,
    oemId: string,
    status: 'active' | 'suspended',
  ): Promise<Oem> {
    const existing = await this.get(tenantId, oemId);
    const oem = await this.prisma.oem.update({
      where: { id: oemId },
      data: { status },
    });
    await this.events.emit('oem.status.changed', {
      tenantId,
      oemId,
      from: existing.status,
      to: status,
      at: new Date(),
    });
    return oem;
  }
}
