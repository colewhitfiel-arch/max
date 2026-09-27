import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Errors } from '../../../common/errors/app-error';
import { type PutOptions, type StorageProvider, type UploadTarget } from './storage-provider';

export interface S3StorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

const DEFAULT_EXPIRES_SEC = 15 * 60;

/**
 * S3-совместимое хранилище (Yandex Object Storage, VK Cloud, Supabase Storage, Cloudflare R2, MinIO).
 * Загрузка и скачивание — presigned URL напрямую в бакет, api байты не проксирует: на serverless
 * тело запроса ограничено, а презайн снимает это ограничение. Бакету нужен CORS на PUT/GET
 * с origin приложения.
 */
export class S3Storage implements StorageProvider {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(readonly options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    });
  }

  async createUploadTarget(
    key: string,
    opts: { contentType: string; sizeBytes: number; expiresSec?: number },
  ): Promise<UploadTarget> {
    const expiresIn = opts.expiresSec ?? DEFAULT_EXPIRES_SEC;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType }),
      { expiresIn },
    );
    return {
      url,
      method: 'PUT',
      // Content-Type входит в подпись — клиент обязан отправить ровно его.
      headers: { 'Content-Type': opts.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async createDownloadUrl(
    key: string,
    opts: { expiresSec?: number; fileName?: string; contentType?: string } = {},
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
      ...(opts.fileName
        ? {
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`,
          }
        : {}),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: opts.expiresSec ?? DEFAULT_EXPIRES_SEC,
    });
  }

  async put(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    // PutObject требует известную длину: поток собираем в память (сюда попадают только
    // извлечённые тексты, исходные файлы клиент кладёт сам по presigned URL).
    const data = Buffer.isBuffer(body) ? body : await readAll(body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentLength: data.length,
        ...(opts?.contentType ? { ContentType: opts.contentType } : {}),
      }),
    );
  }

  async get(key: string): Promise<Readable> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw Errors.notFound('Файл');
      return res.Body as Readable;
    } catch (error) {
      if (isNotFound(error)) throw Errors.notFound('Файл');
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
