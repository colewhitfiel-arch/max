/**
 * Загрузка материалов: размер — через i18n и локаль; удаление файла во время загрузки другого
 * не откатывается; одноимённые файлы в очереди не конфликтуют.
 */
import type { FileDto } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { MaterialUploader } from './MaterialUploader';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const dto = (n: number, fileName: string, sizeBytes: number): FileDto => ({
  id: id(n),
  fileName,
  mime: 'text/plain',
  sizeBytes,
  purpose: 'MATERIAL',
  status: 'UPLOADED',
  url: null,
  createdAt: '2026-09-23T10:00:00.000Z',
});

const uploads = vi.hoisted(() => ({
  pending: [] as { resolve: (file: FileDto) => void }[],
}));

vi.mock('@/entities/file', () => ({
  uploadFile: () =>
    new Promise<FileDto>((resolve) => {
      uploads.pending.push({ resolve });
    }),
}));

function Harness({ initial }: { initial: FileDto[] }) {
  const [files, setFiles] = useState(initial);
  return (
    <ToastProvider>
      <MaterialUploader value={files} onChange={setFiles} />
      <output data-testid="value">{files.map((f) => f.fileName).join(',')}</output>
    </ToastProvider>
  );
}

beforeEach(() => {
  uploads.pending = [];
});

describe('MaterialUploader', () => {
  it('размер файла — в единицах локали', () => {
    render(<Harness initial={[dto(1, 'a.txt', 2048), dto(2, 'b.pdf', 1.5 * 1024 * 1024)]} />);
    expect(screen.getByText('2 КБ')).toBeInTheDocument();
    expect(screen.getByText('1,5 МБ')).toBeInTheDocument();
  });

  it('удалённый во время загрузки файл не возвращается в список', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[dto(1, 'old.txt', 10)]} />);

    await user.upload(screen.getByLabelText('Материалы'), new File(['x'], 'new.txt'));
    expect(screen.getByText('Загружается…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Убрать файл' }));
    expect(screen.getByTestId('value').textContent).toBe('');

    await act(async () => uploads.pending[0]!.resolve(dto(2, 'new.txt', 10)));
    expect(screen.getByTestId('value').textContent).toBe('new.txt');
  });

  it('одноимённые файлы загружаются независимо', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.upload(screen.getByLabelText('Материалы'), [
      new File(['1'], 'same.txt'),
      new File(['2'], 'same.txt'),
    ]);
    expect(screen.getAllByText('Загружается…')).toHaveLength(2);

    await act(async () => uploads.pending[0]!.resolve(dto(1, 'same.txt', 1)));
    expect(screen.getAllByText('Загружается…')).toHaveLength(1);

    await act(async () => uploads.pending[1]!.resolve(dto(2, 'same.txt', 1)));
    expect(screen.queryByText('Загружается…')).not.toBeInTheDocument();
    expect(screen.getByTestId('value').textContent).toBe('same.txt,same.txt');
  });
});
