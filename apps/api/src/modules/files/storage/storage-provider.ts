import type { Readable } from 'node:stream';

export const STORAGE = Symbol('STORAGE');

export interface UploadTarget {
  /** Куда клиент делает запрос с телом файла. */
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PutOptions {
  contentType?: string;
}

/**
 * Порт файлового хранилища. Реализации: LocalFsStorage (dev: диск + раздача через api),
 * PostgresStorage (serverless-стенд: байты в БД, раздача через api), S3Storage (prod: presigned URL).
 * Модули не знают, где лежат байты — только ключ.
 */
export interface StorageProvider {
  readonly driver: 'local' | 'postgres' | 's3';
  /** Прямой upload из клиента (presigned URL или локальная ручка api). */
  createUploadTarget(
    key: string,
    opts: { contentType: string; sizeBytes: number; expiresSec?: number },
  ): Promise<UploadTarget>;
  /** Временная ссылка на скачивание; `contentType` — MIME, с которым файл будет отдан. */
  createDownloadUrl(
    key: string,
    opts?: { expiresSec?: number; fileName?: string; contentType?: string },
  ): Promise<string>;
  put(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  /** Размер объекта в байтах; `null` — объекта нет. */
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

/** Ключ объекта: <purpose>/<yyyy>/<mm>/<fileId>/<safeFileName>. */
export function buildStorageKey(
  purpose: string,
  fileId: string,
  fileName: string,
  at: Date = new Date(),
): string {
  const safe = fileName.replace(/[^\w.\-()Ѐ-ӿ ]+/g, '_').slice(0, 120) || 'file';
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${purpose.toLowerCase()}/${y}/${m}/${fileId}/${safe}`;
}
