import type { Readable } from 'node:stream';
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

/**
 * S3-совместимое хранилище (Yandex Object Storage, VK Cloud, MinIO).
 * ЗАГЛУШКА: реализуется отдельной задачей (Agent G / I4) через @aws-sdk/client-s3 +
 * @aws-sdk/s3-request-presigner. Интерфейс уже зафиксирован — потребители не меняются.
 */
export class S3Storage implements StorageProvider {
  readonly driver = 's3' as const;

  constructor(readonly options: S3StorageOptions) {}

  async createUploadTarget(
    _key: string,
    _opts: { contentType: string; sizeBytes: number; expiresSec?: number },
  ): Promise<UploadTarget> {
    throw Errors.notImplemented('S3-хранилище');
  }
  async createDownloadUrl(_key: string): Promise<string> {
    throw Errors.notImplemented('S3-хранилище');
  }
  async put(_key: string, _body: Buffer | Readable, _opts?: PutOptions): Promise<void> {
    throw Errors.notImplemented('S3-хранилище');
  }
  async get(_key: string): Promise<Readable> {
    throw Errors.notImplemented('S3-хранилище');
  }
  async exists(_key: string): Promise<boolean> {
    throw Errors.notImplemented('S3-хранилище');
  }
  async delete(_key: string): Promise<void> {
    throw Errors.notImplemented('S3-хранилище');
  }
}
