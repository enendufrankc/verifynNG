import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { S3Service } from '../../common/s3.service';

type ArtefactKind = 'qr-zip' | 'sheet-pdf' | 'tier1-csv' | 'all-zip';

@Injectable()
export class ExportsService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private s3: S3Service,
  ) {}

  async getSignedUrl(
    tenantId: string,
    batchId: string,
    artefact: ArtefactKind,
  ): Promise<{ url: string; expiresAt: Date }> {
    const batchArtefact = await this.prisma.batchArtefact.findUnique({
      where: { batchId_kind: { batchId, kind: artefact } },
    });
    if (!batchArtefact) throw new NotFoundException('Artefact not found');

    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const url = await this.s3.getSignedUrl(batchArtefact.objectKey, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000);
    return { url, expiresAt };
  }
}
