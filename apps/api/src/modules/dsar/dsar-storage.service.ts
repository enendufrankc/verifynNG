import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class DsarStorageService {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('DSAR_EXPORT_BUCKET', 'dsar-exports');
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
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async presignGet(key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
