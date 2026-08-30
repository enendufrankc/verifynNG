import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import heicConvert from 'heic-convert';
import { ReportsS3Service } from './reports-s3.service';

export interface PhotoProcessJob {
  photoId: string;
}

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const MAX_DIMENSION = 2000;

// Single WorkerHost for the whole `reports` queue. BullMQ's Worker.moveToActive
// pulls the next job off a queue in FIFO order regardless of the job's `name` —
// it is not routed per job name — so two separate WorkerHost classes both bound
// to `@Processor('reports')` would race for every job, including each other's.
// A `photo.sweep` job landing on a worker that only knows `photo.process` (or
// vice versa) would silently no-op and mark the job "completed" without doing
// the work. Handling both job names in one process() avoids that entirely; see
// PhotoSweepProcessor for the (scheduling-only) counterpart.
@Processor('reports', { concurrency: 2 })
@Injectable()
export class PhotoProcessor extends WorkerHost {
  private readonly logger = new Logger(PhotoProcessor.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly s3: ReportsS3Service,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'photo.sweep') return this.sweep();
    if (job.name === 'photo.process')
      return this.processPhoto(job as Job<PhotoProcessJob>);
  }

  private async processPhoto(job: Job<PhotoProcessJob>): Promise<void> {
    const { photoId } = job.data;
    const photo = await this.prisma.reportPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.status !== 'uploaded') return;

    await this.prisma.reportPhoto.update({
      where: { id: photoId },
      data: { status: 'processing' },
    });

    try {
      await this.s3.headIncoming(photo.incomingKey);
      const raw = await this.s3.getIncomingObject(photo.incomingKey);

      if (raw.length > photo.declaredBytes * 2 && raw.length > 8_000_000) {
        await this.reject(photoId, 'too_large');
        return;
      }

      const sniffed = await fileTypeFromBuffer(raw);
      if (!sniffed || !ACCEPTED_MIME.has(sniffed.mime)) {
        await this.reject(photoId, 'magic_mismatch');
        return;
      }

      let decodable: Buffer = raw;
      if (sniffed.mime === 'image/heic' || sniffed.mime === 'image/heif') {
        const converted = await heicConvert({
          buffer: raw,
          format: 'JPEG',
          quality: 0.9,
        });
        decodable = Buffer.from(converted);
      }

      const image = sharp(decodable).rotate();
      const metadata = await image.metadata();
      const resized = image.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
      // sharp strips all metadata (EXIF/XMP/IPTC, GPS included) by default on
      // any transformation — withMetadata() is what *keeps* it, and (contrary
      // to what its signature suggests) withMetadata(false) is not "strip":
      // sharp's implementation calls keepMetadata() unconditionally and only
      // inspects the argument when it's an options object, so passing `false`
      // silently retains everything. Never call withMetadata() here.
      const output = await resized.jpeg({ quality: 85 }).toBuffer();
      const outputMeta = await sharp(output).metadata();

      const objectKey = `${photo.tenantId}/${photo.reportId ?? 'unclaimed'}/${photo.id}.jpg`;
      await this.s3.putProcessed(objectKey, output, 'image/jpeg');
      await this.s3.deleteIncoming(photo.incomingKey);

      await this.prisma.reportPhoto.update({
        where: { id: photoId },
        data: {
          status: 'ready',
          objectKey,
          storedBytes: output.length,
          sha256: createHash('sha256').update(output).digest('hex'),
          width: outputMeta.width ?? metadata.width ?? null,
          height: outputMeta.height ?? metadata.height ?? null,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `photo.process failed for ${photoId}: ${(err as Error).message}`,
      );
      await this.reject(photoId, 'processing_error');
    }
  }

  private async reject(photoId: string, reason: string): Promise<void> {
    await this.prisma.reportPhoto.update({
      where: { id: photoId },
      data: {
        status: 'rejected',
        rejectReason: reason,
        processedAt: new Date(),
      },
    });
  }

  private async sweep(): Promise<void> {
    const ttlHours = this.config.get<number>('REPORT_INCOMING_TTL_HOURS', 24);
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const stale = await this.prisma.reportPhoto.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      take: 200,
    });
    for (const photo of stale) {
      await this.prisma.reportPhoto.update({
        where: { id: photo.id },
        data: {
          status: 'rejected',
          rejectReason: 'expired_incoming',
          processedAt: new Date(),
        },
      });
    }
    this.logger.log(`photo.sweep: expired ${stale.length} pending photos`);
  }
}
