import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class TenantS3Service {
  readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET', 'verifyng');
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT', 'http://minio:9000'),
      region: 'us-east-1',
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: config.get<string>('S3_SECRET_KEY', 'minioadmin'),
      },
    });
  }
  async presignPut(
    key: string,
    contentType: string,
    size: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: 600 },
    );
  }
  async head(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
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
  async presignGet(key: string, expiresIn = 86400): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));
      if (keys.length > 0)
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }
}
