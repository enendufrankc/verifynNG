import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { toGs1DigitalLink } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { S3Service } from '../../common/s3.service';
import { EventsService } from '../../common/events.service';

type ArtefactKind = 'qr-zip' | 'sheet-pdf' | 'tier1-csv' | 'all-zip';

@Injectable()
export class ExportsService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private s3: S3Service,
    private events: EventsService,
  ) {}

  async getSignedUrl(
    tenantId: string,
    batchId: string,
    artefact: ArtefactKind,
  ): Promise<{ url: string; expiresAt: Date }> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const batchArtefact = await this.prisma.batchArtefact.findUnique({
      where: { batchId_kind: { batchId, kind: artefact } },
    });
    if (!batchArtefact) throw new NotFoundException('Artefact not found');

    const url = await this.s3.getSignedUrl(batchArtefact.objectKey, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000);
    if (
      artefact === 'qr-zip' ||
      artefact === 'sheet-pdf' ||
      artefact === 'all-zip'
    ) {
      await this.events.emit('manifest.downloaded', {
        tenantId,
        batchId,
        artefact,
        actorType: 'operator',
        at: new Date(),
      });
    }
    return { url, expiresAt };
  }

  async getTier1QrUrl(
    tenantId: string,
    batchId: string,
    unitId: string,
  ): Promise<{ code: string; url: string }> {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, batchId, tenantId },
      include: { batch: { include: { product: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const env = loadEnv();
    const url = unit.batch.product.gtin
      ? toGs1DigitalLink({
          baseUrl: env.VERIFY_BASE_URL,
          gtin: unit.batch.product.gtin,
          serial: unit.tier1Code,
        })
      : `${env.VERIFY_BASE_URL}/v/${unit.tier1Code}`;
    return { code: unit.tier1Code, url };
  }
}
