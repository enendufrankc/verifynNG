import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Anonymous-read policy — page media is served directly by URL, never presigned. */
function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

@Injectable()
export class PagesS3Service implements OnModuleInit {
  private readonly logger = new Logger(PagesS3Service.name);
  private readonly client: S3Client;
  readonly bucket: string;
  readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const credentials = {
      accessKeyId: config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
      secretAccessKey: config.get<string>('S3_SECRET_KEY', 'minioadmin'),
    };
    const forcePathStyle = config.get<boolean>('S3_FORCE_PATH_STYLE', true);
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT', 'http://minio:9000'),
      region: 'us-east-1',
      forcePathStyle,
      credentials,
    });
    this.bucket = config.get<string>('PAGES_MEDIA_BUCKET', 'pages');
    this.publicBaseUrl = config.get<string>(
      'S3_PUBLIC_ENDPOINT',
      'http://localhost:9000',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.bucket,
        Policy: publicReadPolicy(this.bucket),
      }),
    );
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`created bucket ${this.bucket}`);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists')
        return;
      throw err;
    }
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${this.bucket}/${key}`;
  }
}
