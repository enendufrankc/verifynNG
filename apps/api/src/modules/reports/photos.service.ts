import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ReportsS3Service } from './reports-s3.service';

@Injectable()
export class PhotosService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly s3: ReportsS3Service,
    private readonly config: ConfigService,
  ) {}

  async requestUpload(
    tenantId: string,
    contentType: string,
    sizeBytes: number,
    ipHash: string,
  ): Promise<{ photoId: string; uploadUrl: string; maxBytes: number }> {
    const maxBytes = this.config.get<number>(
      'REPORT_PHOTO_MAX_BYTES',
      8_000_000,
    );
    if (sizeBytes > maxBytes) throw new BadRequestException('photo_too_large');

    const id = randomUUID();
    const key = `${tenantId}/${id}`;
    const photo = await this.prisma.reportPhoto.create({
      data: {
        id,
        tenantId,
        contentType,
        declaredBytes: sizeBytes,
        ipHash,
        status: 'pending',
        incomingKey: key,
      },
    });
    const uploadUrl = await this.s3.presignIncomingPut(
      key,
      photo.contentType,
      sizeBytes,
    );
    return { photoId: photo.id, uploadUrl, maxBytes };
  }
}
