import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { API_PREFIX } from '@edu/contracts';
import { Errors } from '../../../common/errors/app-error';
import { type PutOptions, type StorageProvider, type UploadTarget } from './storage-provider';

export interface LocalFsStorageOptions {
  /** Корневая папка (относительно cwd или абсолютная). */
  rootDir: string;
  /** Публичный адрес api, чтобы собрать URL загрузки/скачивания. */
  apiUrl: string;
  /** Секрет для подписи токенов локальных ссылок (используется JWT_SECRET). */
  secret: string;
}

interface LocalToken {
  key: string;
  op: 'upload' | 'download';
  exp: number;
  ct?: string;
  size?: number;
}

/**
 * Хранилище на диске для dev без S3. Клиент загружает файл через `PUT /files/local/:token`,
 * скачивает через `GET /files/local/:token` — обе ручки реализует контроллер files,
 * проверяя токен методом verifyToken().
 */
export class LocalFsStorage implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(private readonly options: LocalFsStorageOptions) {
    this.root = path.resolve(options.rootDir);
  }

  private pathFor(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep) && full !== this.root)
      throw Errors.validation('Некорректный ключ файла');
    return full;
  }

  private signToken(payload: LocalToken): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.options.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /** Проверяет токен локальной ссылки; бросает UNAUTHORIZED при подделке или истечении. */
  verifyToken(token: string, op: LocalToken['op']): LocalToken {
    const [body, sig] = token.split('.');
    if (!body || !sig) throw Errors.unauthorized('Некорректный токен файла');
    const expected = createHmac('sha256', this.options.secret).update(body).digest('base64url');
    if (
      expected.length !== sig.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      throw Errors.unauthorized('Подпись токена файла неверна');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalToken;
    if (payload.op !== op) throw Errors.unauthorized('Токен выдан для другой операции');
    if (payload.exp < Date.now()) throw Errors.unauthorized('Ссылка на файл истекла');
    return payload;
  }

  private localUrl(token: string): string {
    return `${this.options.apiUrl.replace(/\/$/, '')}${API_PREFIX}/files/local/${encodeURIComponent(token)}`;
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
      url: this.localUrl(token),
      method: 'PUT',
      headers: { 'Content-Type': opts.contentType },
      expiresAt: new Date(exp),
    };
  }

  async createDownloadUrl(key: string, opts: { expiresSec?: number } = {}): Promise<string> {
    const exp = Date.now() + (opts.expiresSec ?? 3600) * 1000;
    return this.localUrl(this.signToken({ key, op: 'download', exp }));
  }

  async put(key: string, body: Buffer | Readable, _opts?: PutOptions): Promise<void> {
    const file = this.pathFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await pipeline(Buffer.isBuffer(body) ? Readable.from(body) : body, createWriteStream(file));
  }

  async get(key: string): Promise<Readable> {
    const file = this.pathFor(key);
    if (!(await this.exists(key))) throw Errors.notFound('Файл');
    return createReadStream(file);
  }

  async exists(key: string): Promise<boolean> {
    const file = this.pathFor(key); // бросает VALIDATION при выходе за корень
    try {
      await access(file);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
