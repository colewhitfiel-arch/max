import { Injectable } from '@nestjs/common';
import type { FilePurpose, FileStatus } from '@edu/contracts';
import type { Prisma } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type FileRow = Prisma.FileGetPayload<{ select: typeof fileSelect }>;

const fileSelect = {
  id: true,
  ownerUserId: true,
  purpose: true,
  fileName: true,
  mime: true,
  sizeBytes: true,
  storageKey: true,
  confirmedAt: true,
  status: true,
  extractedTextKey: true,
  extractMeta: true,
  error: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

/** Таблица files. Только этот модуль. */
@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id: string;
    ownerUserId: string;
    purpose: FilePurpose;
    fileName: string;
    mime: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<FileRow> {
    return this.prisma.file.create({ data, select: fileSelect });
  }

  async findById(id: string): Promise<FileRow | null> {
    return this.prisma.file.findUnique({ where: { id }, select: fileSelect });
  }

  async findManyByIds(ids: string[]): Promise<FileRow[]> {
    if (ids.length === 0) return [];
    return this.prisma.file.findMany({ where: { id: { in: ids } }, select: fileSelect });
  }

  async confirm(id: string): Promise<FileRow> {
    return this.prisma.file.update({
      where: { id },
      data: { confirmedAt: new Date(), status: 'UPLOADED', error: null },
      select: fileSelect,
    });
  }

  async setStatus(
    id: string,
    status: FileStatus,
    patch: {
      extractedTextKey?: string | null;
      extractMeta?: Prisma.InputJsonValue;
      error?: string | null;
    } = {},
  ): Promise<void> {
    await this.prisma.file.update({ where: { id }, data: { status, ...patch } });
  }
}
