import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Errors } from '../../../common/errors/app-error';
import { SignedLinkStorage, type SignedLinkStorageOptions } from './signed-link.storage';
import { type PutOptions } from './storage-provider';

export interface LocalFsStorageOptions extends SignedLinkStorageOptions {
  /** Корневая папка (относительно cwd или абсолютная). */
  rootDir: string;
}

/**
 * Хранилище на диске для dev без S3. Клиент загружает файл через `PUT /files/local/:token`,
 * скачивает через `GET /files/local/:token` (см. `SignedLinkStorage`).
 */
export class LocalFsStorage extends SignedLinkStorage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(options: LocalFsStorageOptions) {
    super(options);
    this.root = path.resolve(options.rootDir);
  }

  private pathFor(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep) && full !== this.root)
      throw Errors.validation('Некорректный ключ файла');
    return full;
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

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
