import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type { PolicyDocument, PolicyKind } from '@prisma/client';
import { EventsService } from '../../common/events.service';
import { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';

/**
 * Public, URL-facing document kind. Distinct from the DB's PolicyKind enum
 * because `tos` predates this module's URL contract (`/legal/terms`) — see
 * docs/superpowers/plans/2026-08-30-e19-legal-documents-milestone1.md.
 */
export type LegalDocKind =
  | 'privacy'
  | 'terms'
  | 'aup'
  | 'cookie'
  | 'subprocessors';

export const LEGAL_DOC_KINDS: readonly LegalDocKind[] = [
  'privacy',
  'terms',
  'aup',
  'cookie',
  'subprocessors',
];

export const KIND_TO_DB: Record<LegalDocKind, PolicyKind> = {
  privacy: 'privacy',
  terms: 'tos',
  aup: 'aup',
  cookie: 'cookie',
  subprocessors: 'subprocessors',
};

const DB_TO_KIND: Record<PolicyKind, LegalDocKind> = {
  privacy: 'privacy',
  tos: 'terms',
  aup: 'aup',
  cookie: 'cookie',
  subprocessors: 'subprocessors',
};

export interface LegalDocumentDto {
  kind: LegalDocKind;
  version: string;
  locale: string;
  bodyMd: string;
  changeSummary: string | null;
  requiresReacceptance: boolean;
  publishedAt: string;
}

export interface PublishInput {
  kind: LegalDocKind;
  version: string;
  bodyMd: string;
  locale?: string;
  changeSummary?: string;
  requiresReacceptance?: boolean;
  publishedById?: string;
  effectiveFrom?: Date;
}

@Injectable()
export class LegalDocumentService {
  constructor(
    private readonly events: EventsService,
    private readonly tenantLifecycle: TenantLifecycleService,
  ) {}

  async current(kind: LegalDocKind, locale = 'en'): Promise<LegalDocumentDto> {
    const doc = await prisma.policyDocument.findFirst({
      where: {
        kind: KIND_TO_DB[kind],
        locale,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!doc) throw new NotFoundException('legal_document_not_found');
    return this.toDto(doc);
  }

  async list(kind: LegalDocKind, locale = 'en'): Promise<LegalDocumentDto[]> {
    const docs = await prisma.policyDocument.findMany({
      where: {
        kind: KIND_TO_DB[kind],
        locale,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return docs.map((doc) => this.toDto(doc));
  }

  async publish(input: PublishInput): Promise<LegalDocumentDto> {
    const doc = await prisma.policyDocument.create({
      data: {
        kind: KIND_TO_DB[input.kind],
        locale: input.locale ?? 'en',
        version: input.version,
        markdown: input.bodyMd,
        changeSummary: input.changeSummary,
        requiresReacceptance: input.requiresReacceptance ?? false,
        publishedById: input.publishedById,
        effectiveFrom: input.effectiveFrom ?? new Date(),
      },
    });
    await this.events.emit('legal.document.published', {
      kind: input.kind,
      version: doc.version,
      locale: doc.locale,
      publishedAt: doc.effectiveFrom.toISOString(),
      requiresReacceptance: doc.requiresReacceptance,
    });
    return this.toDto(doc);
  }

  /**
   * Only `terms`/`aup` require re-acceptance today — delegates to E03's
   * TenantLifecycleService, which already tracks TenantAcceptance
   * (PolicyAcceptance) rows, rather than duplicating that comparison here.
   */
  async needsReacceptance(
    tenantId: string,
    userId: string,
  ): Promise<{ kind: LegalDocKind; version: string }[]> {
    const [pending, current] = await Promise.all([
      this.tenantLifecycle.pendingAcceptances(userId, tenantId) as Promise<
        ('aup' | 'tos')[]
      >,
      this.tenantLifecycle.currentVersions() as Promise<{
        aup: string;
        tos: string;
      }>,
    ]);
    return pending.map((kind) => ({
      kind: DB_TO_KIND[kind],
      version: current[kind],
    }));
  }

  /** Read-only view of E03's PolicyAcceptance rows for the "Your agreements" screen. */
  async agreements(tenantId: string): Promise<
    {
      kind: LegalDocKind;
      version: string;
      acceptedAt: string;
      userId: string;
    }[]
  > {
    const rows = await prisma.policyAcceptance.findMany({
      where: { tenantId },
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map((row) => ({
      kind: DB_TO_KIND[row.kind],
      version: row.version,
      acceptedAt: row.acceptedAt.toISOString(),
      userId: row.userId,
    }));
  }

  private toDto(doc: PolicyDocument): LegalDocumentDto {
    return {
      kind: DB_TO_KIND[doc.kind],
      version: doc.version,
      locale: doc.locale,
      bodyMd: doc.markdown,
      changeSummary: doc.changeSummary,
      requiresReacceptance: doc.requiresReacceptance,
      publishedAt: doc.effectiveFrom.toISOString(),
    };
  }
}
