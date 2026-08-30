import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type { PolicyDocument, PolicyKind } from '@prisma/client';

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

const KIND_TO_DB: Record<LegalDocKind, PolicyKind> = {
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
    return this.toDto(doc);
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
