import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ReportsS3Service implements OnModuleInit {
  private readonly logger = new Logger(ReportsS3Service.name);
  readonly client: S3Client;
  private readonly publicClient: S3Client;
  readonly incomingBucket: string;
  readonly bucket: string;
  private readonly incomingTtlHours: number;

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
    this.publicClient = new S3Client({
      endpoint: config.get<string>(
        'S3_PUBLIC_ENDPOINT',
        'http://localhost:9000',
      ),
      region: 'us-east-1',
      forcePathStyle,
      credentials,
    });
    this.incomingBucket = config.get<string>(
      'REPORTS_BUCKET_INCOMING',
      'reports-incoming',
    );
    this.bucket = config.get<string>('REPORTS_BUCKET', 'reports');
    this.incomingTtlHours = config.get<number>('REPORT_INCOMING_TTL_HOURS', 24);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket(this.incomingBucket);
    await this.ensureBucket(this.bucket);
    await this.setIncomingLifecycle();
  }

  private async ensureBucket(name: string): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: name }));
      this.logger.log(`created bucket ${name}`);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists')
        return;
      throw err;
    }
  }

  private async setIncomingLifecycle(): Promise<void> {
    await this.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.incomingBucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'expire-incoming',
              Status: 'Enabled',
              Filter: {},
              Expiration: {
                Days: Math.max(1, Math.ceil(this.incomingTtlHours / 24)),
              },
            },
          ],
        },
      }),
    );
  }

  async presignIncomingPut(
    key: string,
    contentType: string,
    size: number,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: this.incomingBucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: 300 },
    );
  }

  async headIncoming(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.incomingBucket, Key: key }),
    );
  }

  async getIncomingObject(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.incomingBucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>)
      chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async deleteIncoming(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.incomingBucket, Key: key }),
    );
  }

  async putProcessed(
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

  async presignGet(key: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
}
