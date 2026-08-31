import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';

const WEBP_WIDTHS = [480, 960, 1600];
const AVIF_WIDTHS = [960, 1600];
const BUCKET = process.env.PAGES_MEDIA_BUCKET || 'pages';

function client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
  });
}

function publicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_ENDPOINT || 'http://localhost:9000';
  return `${base}/${BUCKET}/${key}`;
}

let bucketEnsured = false;
async function ensureBucket(s3: S3Client): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch (err) {
    const code = (err as { name?: string })?.name;
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      throw err;
    }
  }
  bucketEnsured = true;
}

export interface SeedMediaRef {
  assetId: string;
  alt: string;
  width: number;
  height: number;
  blurDataUrl?: string;
  variants: { webp: string[]; avif?: string[] };
}

/** Uploads a seed image through T4's pipeline shape (strip metadata, webp/avif variants, blur placeholder). */
export async function uploadSeedImage(
  prisma: PrismaClient,
  tenantId: string,
  filePath: string,
  alt: string,
  createdById: string,
): Promise<SeedMediaRef> {
  const s3 = client();
  await ensureBucket(s3);

  const buffer = readFileSync(filePath);
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const assetId = randomUUID();
  const prefix = `${tenantId}/${assetId}`;

  const webp: string[] = [];
  for (const w of WEBP_WIDTHS) {
    const out = await sharp(buffer)
      .resize({ width: w, withoutEnlargement: true })
      .webp()
      .toBuffer();
    const key = `${prefix}/${w}.webp`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: out,
        ContentType: 'image/webp',
      }),
    );
    webp.push(publicUrl(key));
  }

  const avif: string[] = [];
  for (const w of AVIF_WIDTHS) {
    const out = await sharp(buffer)
      .resize({ width: w, withoutEnlargement: true })
      .avif()
      .toBuffer();
    const key = `${prefix}/${w}.avif`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: out,
        ContentType: 'image/avif',
      }),
    );
    avif.push(publicUrl(key));
  }

  const blurBuffer = await sharp(buffer)
    .resize(16)
    .webp({ quality: 20 })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

  const variants = { webp, avif };
  const asset = await prisma.pageMediaAsset.create({
    data: {
      tenantId,
      objectKey: `${prefix}/original.webp`,
      mimeType: 'image/webp',
      width,
      height,
      bytes: buffer.byteLength,
      blurDataUrl,
      variants,
      alt,
      createdById,
    },
  });

  return { assetId: asset.id, alt, width, height, blurDataUrl, variants };
}
