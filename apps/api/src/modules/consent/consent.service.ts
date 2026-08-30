import { Injectable } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type {
  ConsentPurpose,
  ConsentRecord,
  ConsentSource,
  ConsentSubjectType,
  PolicyKind,
} from '@prisma/client';
import { EventsService } from '../../common/events.service';

export interface RecordConsentInput {
  subjectType: ConsentSubjectType;
  subjectRef: string;
  purpose: ConsentPurpose;
  granted: boolean;
  source: ConsentSource;
  tenantId?: string;
  documentKind?: PolicyKind;
  documentVersion?: string;
  evidence?: Record<string, unknown>;
}

@Injectable()
export class ConsentService {
  constructor(private readonly events: EventsService) {}

  async record(input: RecordConsentInput): Promise<ConsentRecord> {
    const record = await prisma.consentRecord.create({
      data: {
        tenantId: input.tenantId,
        subjectType: input.subjectType,
        subjectRef: input.subjectRef,
        purpose: input.purpose,
        granted: input.granted,
        source: input.source,
        documentKind: input.documentKind,
        documentVersion: input.documentVersion,
        evidence: input.evidence,
      },
    });
    await this.events.emit('consent.recorded', {
      consentRecordId: record.id,
      tenantId: record.tenantId,
      subjectType: record.subjectType,
      subjectRef: record.subjectRef,
      purpose: record.purpose,
      granted: record.granted,
      source: record.source,
      at: record.at.toISOString(),
    });
    return record;
  }

  async has(
    subjectType: ConsentSubjectType,
    subjectRef: string,
    purpose: ConsentPurpose,
  ): Promise<boolean> {
    const latest = await prisma.consentRecord.findFirst({
      where: { subjectType, subjectRef, purpose },
      orderBy: { at: 'desc' },
    });
    return latest?.granted ?? false;
  }

  async history(
    subjectType: ConsentSubjectType,
    subjectRef: string,
  ): Promise<ConsentRecord[]> {
    return prisma.consentRecord.findMany({
      where: { subjectType, subjectRef },
      orderBy: { at: 'desc' },
    });
  }
}
