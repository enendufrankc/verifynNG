/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@verifynng/db';
import { TenantS3Service } from './s3.service';

const requiredDocuments = ['cac_certificate', 'director_id'] as const;
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

export interface TenantPrincipal {
  userId: string;
  email?: string;
}

@Injectable()
export class TenantLifecycleService {
  constructor(private readonly storage: TenantS3Service) {}
  async create(input: {
    ownerUserId: string;
    ownerEmail?: string;
    name: string;
    legalName?: string;
    country: string;
    acceptPolicies?: { aup?: string; tos?: string };
  }): Promise<any> {
    const base = slugify(input.name);
    if (!base) throw new BadRequestException('name_required');
    let slug = base;
    for (let n = 2; await prisma.tenant.findUnique({ where: { slug } }); n++)
      slug = `${base}-${n}`;
    const current = await this.currentVersions();
    if (
      input.acceptPolicies?.aup !== current.aup ||
      input.acceptPolicies?.tos !== current.tos
    )
      throw new BadRequestException('current_policy_acceptance_required');
    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug,
          name: input.name,
          legalName: input.legalName,
          country: input.country.toUpperCase(),
          status: 'pending',
          statusChangedAt: new Date(),
        },
      });
      const owner = await tx.user.upsert({
        where: {
          email: input.ownerEmail ?? `${input.ownerUserId}@local.verifyng`,
        },
        update: { displayName: input.name },
        create: {
          email: input.ownerEmail ?? `${input.ownerUserId}@local.verifyng`,
          displayName: input.name,
        },
      });
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: created.id, userId: owner.id } },
        update: { role: 'owner' },
        create: { tenantId: created.id, userId: owner.id, role: 'owner' },
      });
      await tx.policyAcceptance.createMany({
        data: [
          {
            tenantId: created.id,
            userId: owner.id,
            kind: 'aup',
            version: current.aup,
          },
          {
            tenantId: created.id,
            userId: owner.id,
            kind: 'tos',
            version: current.tos,
          },
        ],
      });
      return { created, owner };
    });
    return {
      tenant: tenant.created,
      accessToken: this.token(tenant.owner.id, tenant.created.id),
      refreshToken: this.token(tenant.owner.id, tenant.created.id),
    };
  }

  private token(userId: string, tenantId: string) {
    return Buffer.from(JSON.stringify({ sub: userId, tid: tenantId })).toString(
      'base64url',
    );
  }
  async get(tenantId: string): Promise<any> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { verificationDocuments: true },
    });
    if (!tenant) throw new NotFoundException('tenant_not_found');
    return tenant;
  }
  async submitForReview(tenantId: string): Promise<any> {
    const docs = await prisma.verificationDocument.findMany({
      where: { tenantId, status: { in: ['uploaded', 'accepted'] } },
    });
    const kinds = new Set(docs.map((d) => d.kind));
    if (!requiredDocuments.every((kind) => kinds.has(kind)))
      throw new BadRequestException('required_documents_missing');
    const tenant = await this.get(tenantId);
    if (tenant.status !== 'pending' && tenant.status !== 'rejected')
      throw new ConflictException('invalid_status_transition');
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'in_review',
        statusChangedAt: new Date(),
        statusReason: null,
      },
    });
  }
  async transition(
    tenantId: string,
    status: 'active' | 'rejected' | 'suspended' | 'restricted',
    by: string,
    reason?: string,
  ): Promise<any> {
    const tenant = await this.get(tenantId);
    const legal: Record<string, string[]> = {
      active: ['in_review', 'suspended', 'restricted'],
      rejected: ['in_review'],
      suspended: ['active', 'restricted'],
      restricted: ['active', 'suspended'],
    };
    if (!legal[status]?.includes(tenant.status))
      throw new ConflictException('invalid_status_transition');
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status,
        statusReason: reason ?? `changed_by:${by}`,
        statusChangedAt: new Date(),
        verifiedAt: status === 'active' ? new Date() : undefined,
        suspendedAt: status === 'suspended' ? new Date() : undefined,
      },
    });
  }
  async offboard(
    tenantId: string,
    by: string,
    confirmSlug: string,
  ): Promise<any> {
    const tenant = await this.get(tenantId);
    if (tenant.slug !== confirmSlug)
      throw new BadRequestException('slug_confirmation_mismatch');
    if (!['active', 'suspended', 'restricted'].includes(tenant.status))
      throw new ConflictException('invalid_status_transition');
    const graceDays = Number(process.env.OFFBOARDING_GRACE_DAYS ?? 30);
    const scheduled = new Date(Date.now() + graceDays * 86400000);
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'offboarded',
        offboardedAt: new Date(),
        scheduledDeletionAt: scheduled,
        statusReason: `offboarded_by:${by}`,
      },
    });
    const exportRecord = await prisma.tenantExport.create({
      data: { tenantId, status: 'queued' },
    });
    return {
      tenant: updated,
      export: exportRecord,
      scheduledDeletionAt: scheduled,
    };
  }
  async currentVersions(): Promise<any> {
    const docs = await prisma.policyDocument.findMany({
      orderBy: { version: 'desc' },
    });
    return {
      aup: docs.find((d) => d.kind === 'aup')?.version ?? '2026-08-01',
      tos: docs.find((d) => d.kind === 'tos')?.version ?? '2026-08-01',
    };
  }
  async pendingAcceptances(userId: string, tenantId: string): Promise<any> {
    const versions = await this.currentVersions();
    const accepted = await prisma.policyAcceptance.findMany({
      where: { userId, tenantId },
    });
    return (['aup', 'tos'] as const).filter(
      (kind) =>
        !accepted.some((a) => a.kind === kind && a.version === versions[kind]),
    );
  }
  async acceptPolicy(
    userId: string,
    tenantId: string,
    kind: 'aup' | 'tos',
    version: string,
  ): Promise<any> {
    const current = await this.currentVersions();
    if (current[kind] !== version)
      throw new BadRequestException('outdated_policy_version');
    return prisma.policyAcceptance.upsert({
      where: { tenantId_kind_version: { tenantId, kind, version } },
      update: { userId, acceptedAt: new Date() },
      create: { tenantId, userId, kind, version },
    });
  }
  async updateSettings(
    tenantId: string,
    patch: Record<string, unknown>,
  ): Promise<any> {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: patch as never,
    });
  }
  async verification(tenantId: string): Promise<any> {
    return prisma.verificationDocument.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }
  async createDocument(
    tenantId: string,
    input: {
      kind:
        | 'cac_certificate'
        | 'trademark_certificate'
        | 'director_id'
        | 'other';
      fileName: string;
      contentType: string;
      size: number;
      uploadedBy: string;
    },
  ): Promise<any> {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(input.contentType) || input.size > 10 * 1024 * 1024)
      throw new BadRequestException('unsupported_document');
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const objectKey = `tenants/${tenantId}/verification/${id}/${input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const document = await prisma.verificationDocument.create({
      data: {
        id,
        tenantId,
        kind: input.kind,
        objectKey,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.size,
        uploadedBy: input.uploadedBy,
      },
    });
    return {
      documentId: document.id,
      uploadUrl: await this.storage.presignPut(
        objectKey,
        input.contentType,
        input.size,
      ),
      objectKey,
    };
  }
  async completeDocument(tenantId: string, documentId: string): Promise<any> {
    const document = await prisma.verificationDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!document) throw new NotFoundException('document_not_found');
    try {
      const object = await this.storage.head(document.objectKey);
      if (
        (object.ContentLength ?? 0) > 10 * 1024 * 1024 ||
        object.ContentType !== document.contentType
      )
        throw new BadRequestException('uploaded_document_mismatch');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('document_not_uploaded');
    }
    return prisma.verificationDocument.update({
      where: { id: documentId },
      data: { status: 'uploaded' },
    });
  }
  async deleteDocument(tenantId: string, documentId: string): Promise<any> {
    const tenant = await this.get(tenantId);
    if (!['pending', 'rejected'].includes(tenant.status))
      throw new ConflictException('documents_locked');
    return prisma.verificationDocument.deleteMany({
      where: { id: documentId, tenantId },
    });
  }
  async getExport(tenantId: string): Promise<any> {
    const tenant = await this.get(tenantId);
    const record = await prisma.tenantExport.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      status: record?.status ?? 'not_requested',
      downloadUrl: record?.objectKey
        ? `/v1/tenants/${tenantId}/export/download`
        : undefined,
      scheduledDeletionAt: tenant.scheduledDeletionAt,
    };
  }
}
