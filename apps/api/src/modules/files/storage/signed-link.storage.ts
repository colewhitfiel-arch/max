import { createHmac } from 'node:crypto';
import type { Readable } from 'node:stream';
import { API_PREFIX } from '@edu/contracts';
import { safeEqual } from '../../../common/auth/safe-equal';
import { Errors } from '../../../common/errors/app-error';
import { type PutOptions, type StorageProvider, type UploadTarget } from './storage-provider';

export interface SignedLinkStorageOptions {
  /** Публичный адрес api, чтобы собрать URL загрузки/скачивания. */
  apiUrl: string;
  /** Секрет для подписи токенов ссылок (используется JWT_SECRET). */
  secret: string;
}

export interface SignedLinkToken {
  key: string;
  op: 'upload' | 'download';
  exp: number;
  ct?: string;
  size?: number;
}

/**
 * Хранилище, байты которого клиент грузит и скачивает через сам api: `PUT/GET /files/local/:token`
 * с подписанным токеном (HMAC, срок, операция, заявленные тип и размер). Ручки реализует
 * контроллер files, проверяя токен методом verifyToken(). Где лежат байты — решает наследник:
 * диск (`LocalFsStorage`, dev) или Postgres (`PostgresStorage`, serverless-стенд без S3).
 */
export abstract class SignedLinkStorage implements StorageProvider {
  abstract readonly driver: 'local' | 'postgres';

  constructor(private readonly linkOptions: SignedLinkStorageOptions) {}

  private signToken(payload: SignedLinkToken): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.linkOptions.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /** Проверяет токен ссылки; бросает UNAUTHORIZED при подделке или истечении. */
  verifyToken(token: string, op: SignedLinkToken['op']): SignedLinkToken {
    const [body, sig] = token.split('.');
    if (!body || !sig) throw Errors.unauthorized('Некорректный токен файла');
    const expected = createHmac('sha256', this.linkOptions.secret).update(body).digest('base64url');
    if (!safeEqual(expected, sig)) {
      throw Errors.unauthorized('Подпись токена файла неверна');
    }
    let payload: SignedLinkToken;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedLinkToken;
    } catch {
      throw Errors.unauthorized('Некорректный токен файла');
    }
    if (payload.op !== op) throw Errors.unauthorized('Токен выдан для другой операции');
    if (payload.exp < Date.now()) throw Errors.unauthorized('Ссылка на файл истекла');
    return payload;
  }

  private linkUrl(token: string): string {
    return `${this.linkOptions.apiUrl.replace(/\/$/, '')}${API_PREFIX}/files/local/${encodeURIComponent(token)}`;
  }

  async createUploadTarget(
    key: string,
    opts: { contentType: string; sizeBytes: number; expiresSec?: number },
  ): Promise<UploadTarget> {
    const exp = Date.now() + (opts.expiresSec ?? 900) * 1000;
    const token = this.signToken({
      key,
      op: 'upload',
      exp,
      ct: opts.contentType,
      size: opts.sizeBytes,
    });
    return {
      url: this.linkUrl(token),
      method: 'PUT',
      headers: { 'Content-Type': opts.contentType },
      expiresAt: new Date(exp),
    };
  }

  async createDownloadUrl(
    key: string,
    opts: { expiresSec?: number; contentType?: string } = {},
  ): Promise<string> {
    const exp = Date.now() + (opts.expiresSec ?? 3600) * 1000;
    return this.linkUrl(
      this.signToken({
        key,
        op: 'download',
        exp,
        ...(opts.contentType ? { ct: opts.contentType } : {}),
      }),
    );
  }

  abstract put(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void>;
  abstract get(key: string): Promise<Readable>;
  abstract exists(key: string): Promise<boolean>;
  abstract size(key: string): Promise<number | null>;
  abstract delete(key: string): Promise<void>;
}
