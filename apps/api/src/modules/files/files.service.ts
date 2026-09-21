import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import {
  type CreateUploadUrlBody,
  FILE_SIZE_LIMITS,
  type FileDto,
  MATERIAL_MIME_TYPES,
  type UploadUrlResult,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/logger.service';
import { extractText, supportsExtraction } from './extract/text-extractor';
import { type FileRow, FilesRepository } from './files.repository';
import { LocalFsStorage } from './storage/local-fs.storage';
import { STORAGE, type StorageProvider, buildStorageKey } from './storage/storage-provider';

/** Материал для пайплайна: текст и мета. */
export interface MaterialText {
  fileId: string;
  fileName: string;
  text: string;
  meta: { pages?: number; headings?: string[]; chars: number };
}

/**
 * Файлы: presigned-загрузка (S3) или локальные ссылки (dev), подтверждение, получение,
 * извлечение текста для course-builder. Владелец файла — тот, кто запросил upload-url.
 */
@Injectable()
export class FilesService {
  private readonly log;

  constructor(
    private readonly repo: FilesRepository,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'files' });
  }

  async createUploadUrl(user: AuthUser, body: CreateUploadUrlBody): Promise<UploadUrlResult> {
    const limit = FILE_SIZE_LIMITS[body.purpose];
    if (body.sizeBytes > limit) {
      throw Errors.validation(
        `Файл больше допустимого размера (${Math.round(limit / 1024 / 1024)} МБ)`,
      );
    }
    if (
      body.purpose === 'MATERIAL' &&
      !(MATERIAL_MIME_TYPES as readonly string[]).includes(body.mime)
    ) {
      throw Errors.validation('Для материалов допустимы pdf, docx, pptx, txt, md, png, jpg');
    }
    const fileId = randomUUID();
    const storageKey = buildStorageKey(body.purpose, fileId, body.fileName);
    const row = await this.repo.create({
      id: fileId,
      ownerUserId: user.userId,
      purpose: body.purpose,
      fileName: body.fileName,
      mime: body.mime,
      sizeBytes: body.sizeBytes,
      storageKey,
    });
    const target = await this.storage.createUploadTarget(storageKey, {
      contentType: body.mime,
      sizeBytes: body.sizeBytes,
    });
    return { fileId: row.id, uploadUrl: target.url, headers: target.headers };
  }

  async confirmUpload(user: AuthUser, fileId: string): Promise<FileDto> {
    const row = await this.requireOwned(user, fileId);
    if (!(await this.storage.exists(row.storageKey))) {
      throw Errors.businessRule('Файл ещё не загружен в хранилище');
    }
    return this.toDto(await this.repo.confirm(row.id));
  }

  async getFile(user: AuthUser, fileId: string): Promise<FileDto> {
    // Policy: MVP — владелец файла. Доступ по группе (материалы курса ученикам) — при реализации блоков FILE.
    return this.toDto(await this.requireOwned(user, fileId));
  }

  /** Локальная загрузка (dev): проверка подписанного токена, запись потока в хранилище. */
  async putLocal(token: string, body: Readable, contentType: string | undefined): Promise<void> {
    const local = this.requireLocalStorage();
    const payload = local.verifyToken(token, 'upload');
    await local.put(payload.key, body, contentType ? { contentType } : undefined);
  }

  /** Локальное скачивание (dev): поток файла и его MIME. */
  async getLocal(token: string): Promise<{ stream: Readable; key: string }> {
    const local = this.requireLocalStorage();
    const payload = local.verifyToken(token, 'download');
    return { stream: await local.get(payload.key), key: payload.key };
  }

  // ---------- для course-builder ----------

  /** Файлы по id с проверкой владельца и назначения MATERIAL. */
  async listOwnedMaterials(ownerUserId: string, fileIds: string[]): Promise<FileRow[]> {
    const rows = await this.repo.findManyByIds(fileIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of fileIds) {
      const row = byId.get(id);
      if (!row || row.ownerUserId !== ownerUserId)
        throw Errors.notFound('Файл материала', { fileId: id });
      if (row.purpose !== 'MATERIAL') throw Errors.validation('Файл не является материалом курса');
      if (!row.confirmedAt) throw Errors.businessRule(`Файл «${row.fileName}» ещё не загружен`);
    }
    return fileIds.map((id) => byId.get(id)!);
  }

  /** DTO файлов по id без проверки владельца — для вложения в DTO задач course-builder. */
  async listDtosByIds(fileIds: string[]): Promise<FileDto[]> {
    const rows = await this.repo.findManyByIds(fileIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return this.toDtos(fileIds.map((id) => byId.get(id)).filter((r): r is FileRow => !!r));
  }

  /** Извлекает текст (кэшируется в хранилище рядом с файлом). */
  async extractMaterialText(fileId: string): Promise<MaterialText> {
    const row = await this.repo.findById(fileId);
    if (!row) throw Errors.notFound('Файл');
    if (row.status === 'EXTRACTED' && row.extractedTextKey) {
      const cached = await this.readAll(await this.storage.get(row.extractedTextKey));
      const meta = (row.extractMeta ?? {}) as MaterialText['meta'];
      const text = cached.toString('utf8');
      return {
        fileId: row.id,
        fileName: row.fileName,
        text,
        meta: { ...meta, chars: text.length },
      };
    }
    if (!supportsExtraction(row.mime)) {
      throw Errors.businessRule(`Из файла «${row.fileName}» (${row.mime}) нельзя извлечь текст`);
    }
    await this.repo.setStatus(row.id, 'EXTRACTING');
    try {
      const buffer = await this.readAll(await this.storage.get(row.storageKey));
      const extracted = await extractText(row.mime, buffer);
      if (extracted.text.length < 20) {
        throw Errors.businessRule(`В файле «${row.fileName}» не нашлось текста`);
      }
      const textKey = `${row.storageKey}.txt`;
      await this.storage.put(textKey, Buffer.from(extracted.text, 'utf8'), {
        contentType: 'text/plain; charset=utf-8',
      });
      await this.repo.setStatus(row.id, 'EXTRACTED', {
        extractedTextKey: textKey,
        extractMeta: extracted.meta,
        error: null,
      });
      this.log.info({ fileId: row.id, chars: extracted.meta.chars }, 'текст извлечён');
      return { fileId: row.id, fileName: row.fileName, text: extracted.text, meta: extracted.meta };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repo.setStatus(row.id, 'FAILED', { error: message });
      throw error;
    }
  }

  // ---------- внутреннее ----------

  private async requireOwned(user: AuthUser, fileId: string): Promise<FileRow> {
    const row = await this.repo.findById(fileId);
    if (!row || row.ownerUserId !== user.userId) throw Errors.notFound('Файл');
    return row;
  }

  private requireLocalStorage(): LocalFsStorage {
    if (!(this.storage instanceof LocalFsStorage)) {
      throw Errors.notFound('Локальные ссылки на файлы');
    }
    return this.storage;
  }

  private async readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async toDto(row: FileRow): Promise<FileDto> {
    return {
      id: row.id,
      fileName: row.fileName,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      purpose: row.purpose,
      status: row.status,
      url: row.confirmedAt
        ? await this.storage.createDownloadUrl(row.storageKey, { fileName: row.fileName })
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async toDtos(rows: FileRow[]): Promise<FileDto[]> {
    return Promise.all(rows.map((row) => this.toDto(row)));
  }
}
