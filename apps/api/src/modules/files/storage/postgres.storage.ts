import { Readable } from 'node:stream';
import { Errors } from '../../../common/errors/app-error';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { SignedLinkStorage, type SignedLinkStorageOptions } from './signed-link.storage';
import { type PutOptions } from './storage-provider';

/**
 * Байты файлов в Postgres (таблица `stored_objects`) — для serverless-стенда без S3 (ADR-014):
 * у функций Vercel нет общего диска, загрузка и извлечение текста попадают в разные инстансы.
 * Загрузка и скачивание идут через api по подписанным ссылкам, как у `LocalFsStorage`; размер
 * ограничен телом запроса функции (на Vercel — 4,5 МБ), чего хватает конспектам и сдачам.
 */
export class PostgresStorage extends SignedLinkStorage {
  readonly driver = 'postgres' as const;

  constructor(
    private readonly prisma: PrismaService,
    options: SignedLinkStorageOptions,
  ) {
    super(options);
  }

  async put(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const bytes = Buffer.isBuffer(body) ? body : await readAll(body);
    // Prisma ждёт Uint8Array поверх обычного ArrayBuffer — копия отвязывает от пула Buffer.
    const data = new Uint8Array(bytes.length);
    data.set(bytes);
    const row = { data, contentType: opts?.contentType ?? null, sizeBytes: bytes.length };
    await this.prisma.storedObject.upsert({
      where: { key },
      create: { key, ...row },
      update: row,
    });
  }

  async get(key: string): Promise<Readable> {
    const row = await this.prisma.storedObject.findUnique({
      where: { key },
      select: { data: true },
    });
    if (!row) throw Errors.notFound('Файл');
    return Readable.from(Buffer.from(row.data));
  }

  async exists(key: string): Promise<boolean> {
    return (await this.size(key)) !== null;
  }

  async size(key: string): Promise<number | null> {
    const row = await this.prisma.storedObject.findUnique({
      where: { key },
      select: { sizeBytes: true },
    });
    return row?.sizeBytes ?? null;
  }

  async delete(key: string): Promise<void> {
    await this.prisma.storedObject.deleteMany({ where: { key } });
  }
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}
