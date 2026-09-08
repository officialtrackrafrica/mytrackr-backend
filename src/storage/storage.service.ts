import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('FILEBASE_BUCKET_NAME') || 'mytrackr';

    const accessKeyId = this.configService.get<string>('FILEBASE_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>(
      'FILEBASE_SECRET_KEY',
    );

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'FILEBASE_ACCESS_KEY or FILEBASE_SECRET_KEY is missing. Filebase S3 integration may fail if used.',
      );
    }

    this.s3Client = new S3Client({
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1', // Filebase S3 uses us-east-1 as the default region
      credentials: {
        accessKeyId: accessKeyId || 'placeholder',
        secretAccessKey: secretAccessKey || 'placeholder',
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(file: any, path: string): Promise<string> {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${path}/${Date.now()}-${sanitizedName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      return key;
    } catch (error: any) {
      this.logger.error(
        `Error uploading file to Filebase: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to upload file to storage',
      );
    }
  }

  async getSignedUrl(storedValue: string, expiresIn = 3600): Promise<string> {
    const key = this.extractObjectKey(storedValue);

    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
      { expiresIn },
    );
  }

  private extractObjectKey(storedValue: string): string {
    if (!/^https?:\/\//i.test(storedValue)) {
      return storedValue.replace(/^\/+/, '');
    }

    const url = new URL(storedValue);
    let key = decodeURIComponent(url.pathname).replace(/^\/+/, '');

    if (url.hostname === 's3.filebase.com') {
      const bucketPrefix = `${this.bucketName}/`;
      if (key.startsWith(bucketPrefix)) {
        key = key.slice(bucketPrefix.length);
      }
    }

    return key;
  }
}
