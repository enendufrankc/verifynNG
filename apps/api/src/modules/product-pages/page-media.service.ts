import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import type { MediaRef } from '@verifynng/page-schema';
import { QuotaService } from '../quota/quota.service';
import { QuotaExceededError } from '../quota/quota-error';
import { PagesS3Service } from './pages-s3.service';

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const WEBP_WIDTHS = [480, 960, 1600];
const AVIF_WIDTHS = [960, 1600];
const MAX_DIMENSION = 6000;
const BLUR_SIZE = 16;

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

@Injectable()
export class PageMediaService implements OnModuleInit {
  private readonly logger = new Logger(PageMediaService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly s3: PagesS3Service,
    private readonly config: ConfigService,
    private readonly quota: QuotaService,
  ) {}

  onModuleInit(): void {
    // Soft signal only — a tenant well over this keeps uploading; ops sees it
    // via the quota.exceeded event, nothing here blocks the request.
    this.quota.registerKind('pages.storageBytes', {
      defaultLimit: 5_000_000_000,
      window: 'day',
    });
  }

  async upload(
    tenantId: string,
    productPageId: string | undefined,
    actorId: string,
    file: UploadedImage,
    alt: string,
  ): Promise<MediaRef> {
    const maxBytes =
      this.config.get<number>('PAGES_MAX_UPLOAD_MB', 10) * 1_000_000;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException('file_too_large');
    }

    const sniffed = await fileTypeFromBuffer(file.buffer);
    if (!sniffed || !ACCEPTED_MIME.has(sniffed.mime)) {
      throw new UnsupportedMediaTypeException('unsupported_image_format');
    }

    const metadata = await sharp(file.buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('unreadable_image');
    }
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      throw new BadRequestException('image_dimensions_too_large');
    }

    await this.softCheckQuota(tenantId, file.size);

    const assetId = randomUUID();
    const prefix = `${tenantId}/${assetId}`;
    const ext = sniffed.ext === 'jpg' ? 'jpg' : sniffed.ext;

    // sharp strips EXIF/GPS and colour-profile metadata on every re-encode
    // below unless `.withMetadata()` is called — it never is here.
    const originalKey = `${prefix}/original.${ext}`;
    await this.s3.putObject(
      originalKey,
      await sharp(file.buffer).toBuffer(),
      sniffed.mime,
    );

    const webp = await this.putVariants(
      file.buffer,
      prefix,
      WEBP_WIDTHS,
      'webp',
    );
    const avif = await this.putVariants(
      file.buffer,
      prefix,
      AVIF_WIDTHS,
      'avif',
    );

    const blurBuffer = await sharp(file.buffer)
      .resize(BLUR_SIZE)
      .webp({ quality: 20 })
      .toBuffer();
    const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

    const variants = { webp, avif };
    const asset = await this.prisma.pageMediaAsset.create({
      data: {
        tenantId,
        productPageId,
        objectKey: originalKey,
        mimeType: sniffed.mime,
        width: metadata.width,
        height: metadata.height,
        bytes: file.size,
        blurDataUrl,
        variants,
        alt,
        createdById: actorId,
      },
    });

    return {
      assetId: asset.id,
      alt,
      width: metadata.width,
      height: metadata.height,
      blurDataUrl,
      variants,
    };
  }

  private async putVariants(
    buffer: Buffer,
    prefix: string,
    widths: number[],
    format: 'webp' | 'avif',
  ): Promise<string[]> {
    const urls: string[] = [];
    for (const width of widths) {
      const resized = sharp(buffer).resize({ width, withoutEnlargement: true });
      const out =
        format === 'webp'
          ? await resized.webp().toBuffer()
          : await resized.avif().toBuffer();
      const key = `${prefix}/${width}.${format}`;
      await this.s3.putObject(key, out, `image/${format}`);
      urls.push(this.s3.publicUrl(key));
    }
    return urls;
  }

  private async softCheckQuota(tenantId: string, bytes: number): Promise<void> {
    try {
      await this.quota.assertWithinQuota(tenantId, 'pages.storageBytes', {
        cost: bytes,
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        this.logger.warn(`tenant ${tenantId} over pages.storageBytes (soft)`);
        return;
      }
      throw err;
    }
  }
}
