import { Injectable } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
} from '@prisma/client';
import { EventsService } from '../../common/events.service';

interface TimelineEntry {
  at: string;
  actorId: string;
  note: string;
}

interface Assessment {
  ndpcNotifyRequired: boolean;
  ndpcNotifyDeadline: Date | null;
}

/** NDPA/NDPR: notify the regulator within 72h of detection for a severe
 * incident that actually exposes personal data. */
function assessNdpc(
  severity: IncidentSeverity,
  dataCategories: string[],
  detectedAt: Date,
): Assessment {
  const required =
    (severity === 'high' || severity === 'critical') &&
    dataCategories.length > 0;
  return {
    ndpcNotifyRequired: required,
    ndpcNotifyDeadline: required
      ? new Date(detectedAt.getTime() + 72 * 3600_000)
      : null,
  };
}

export interface OpenIncidentInput {
  title: string;
  severity: IncidentSeverity;
  detectedAt: Date;
  occurredAt?: Date;
  dataCategories: string[];
  affectedTenantIds: string[];
  estimatedSubjects?: number;
  openedById: string;
}

@Injectable()
export class IncidentService {
  constructor(private readonly events: EventsService) {}

  async open(input: OpenIncidentInput): Promise<Incident> {
    const assessment = assessNdpc(
      input.severity,
      input.dataCategories,
      input.detectedAt,
    );
    const timeline: TimelineEntry[] = [
      {
        at: new Date().toISOString(),
        actorId: input.openedById,
        note: 'opened',
      },
    ];
    const incident = await prisma.incident.create({
      data: {
        title: input.title,
        severity: input.severity,
        detectedAt: input.detectedAt,
        occurredAt: input.occurredAt,
        dataCategories: input.dataCategories,
        affectedTenantIds: input.affectedTenantIds,
        estimatedSubjects: input.estimatedSubjects,
        ndpcNotifyRequired: assessment.ndpcNotifyRequired,
        ndpcNotifyDeadline: assessment.ndpcNotifyDeadline,
        openedById: input.openedById,
        timeline: timeline as never,
      },
    });
    await this.events.emit('incident.opened', {
      incidentId: incident.id,
      severity: incident.severity,
      dataCategories: incident.dataCategories,
      detectedAt: incident.detectedAt.toISOString(),
      notifyDeadlineAt: incident.ndpcNotifyDeadline?.toISOString(),
    });
    return incident;
  }

  async assess72h(id: string): Promise<Assessment> {
    const incident = await prisma.incident.findUniqueOrThrow({ where: { id } });
    const assessment = assessNdpc(
      incident.severity,
      incident.dataCategories,
      incident.detectedAt,
    );
    await prisma.incident.update({
      where: { id },
      data: assessment,
    });
    return assessment;
  }

  async update(
    id: string,
    patch: {
      status?: IncidentStatus;
      note?: string;
      actorId: string;
      postmortemUrl?: string;
    },
  ): Promise<Incident> {
    const incident = await prisma.incident.findUniqueOrThrow({ where: { id } });
    const timeline = [
      ...((incident.timeline as unknown as TimelineEntry[]) ?? []),
      {
        at: new Date().toISOString(),
        actorId: patch.actorId,
        note:
          patch.note ??
          (patch.status ? `status -> ${patch.status}` : 'updated'),
      },
    ];
    return prisma.incident.update({
      where: { id },
      data: {
        status: patch.status,
        postmortemUrl: patch.postmortemUrl,
        timeline: timeline as never,
        closedAt: patch.status === 'closed' ? new Date() : undefined,
      },
    });
  }

  async close(id: string, actorId: string): Promise<Incident> {
    return this.update(id, { status: 'closed', actorId });
  }

  async listAll(): Promise<Incident[]> {
    return prisma.incident.findMany({ orderBy: { detectedAt: 'desc' } });
  }

  async listForTenant(tenantId: string): Promise<Incident[]> {
    return prisma.incident.findMany({
      where: { affectedTenantIds: { has: tenantId } },
      orderBy: { detectedAt: 'desc' },
    });
  }

  async get(id: string): Promise<Incident> {
    return prisma.incident.findUniqueOrThrow({ where: { id } });
  }
}
