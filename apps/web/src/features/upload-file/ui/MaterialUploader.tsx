import { type FileDto, MATERIAL_MIME_TYPES } from '@edu/contracts';
import { Button, Card, CloseIcon, IconButton, ListRow, Stack, Text, useToast } from '@edu/ui';
import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadFile } from '@/entities/file';
import { describeApiError } from '@/shared/api/errors';

export interface MaterialUploaderProps {
  value: FileDto[];
  onChange: (files: FileDto[]) => void;
  disabled?: boolean;
}

const ACCEPT = [...MATERIAL_MIME_TYPES, '.md', '.txt'].join(',');

function formatSize(bytes: number, t: TFunction<'teacher'>, locale: string): string {
  if (bytes < 1024) return t('courseBuilder.form.size.b', { value: bytes });
  if (bytes < 1024 * 1024) {
    return t('courseBuilder.form.size.kb', { value: Math.round(bytes / 1024) });
  }
  const mb = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024);
  return t('courseBuilder.form.size.mb', { value: mb });
}

interface UploadingItem {
  id: number;
  name: string;
}

/** Выбор и загрузка материалов курса (pdf/docx/txt/md) через presigned/local URL (F8). */
export function MaterialUploader({ value, onChange, disabled }: MaterialUploaderProps) {
  const { t, i18n } = useTranslation('teacher');
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  // Актуальный список: загрузка асинхронная, и за время неё файлы могли убрать из формы.
  const valueRef = useRef(value);
  valueRef.current = value;
  const nextUploadId = useRef(0);

  const onPick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const items = files.map((file) => ({ id: nextUploadId.current++, name: file.name, file }));
    setUploading((prev) => [...prev, ...items.map(({ id, name }) => ({ id, name }))]);
    for (const { id, file } of items) {
      try {
        const uploaded = await uploadFile({ file, purpose: 'MATERIAL' });
        valueRef.current = [...valueRef.current, uploaded];
        onChange(valueRef.current);
      } catch (error) {
        toast.show({ tone: 'danger', title: `${file.name}: ${describeApiError(error)}` });
      } finally {
        setUploading((prev) => prev.filter((item) => item.id !== id));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Stack gap={2}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-label={t('courseBuilder.form.materials')}
        onChange={(event) => void onPick(event.target.files)}
      />
      <Button
        variant="secondary"
        fullWidth
        disabled={disabled}
        loading={uploading.length > 0}
        onClick={() => inputRef.current?.click()}
      >
        {t('courseBuilder.form.pickFiles')}
      </Button>
      <Text variant="caption" tone="muted">
        {t('courseBuilder.form.filesHint')}
      </Text>
      {(value.length > 0 || uploading.length > 0) && (
        <Card padding="none">
          {value.map((file) => (
            <ListRow
              key={file.id}
              title={file.fileName}
              subtitle={formatSize(file.sizeBytes, t, i18n.language)}
              right={
                <IconButton
                  aria-label={t('courseBuilder.form.removeFile')}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((f) => f.id !== file.id))}
                >
                  <CloseIcon />
                </IconButton>
              }
            />
          ))}
          {uploading.map((item) => (
            <ListRow key={item.id} title={item.name} subtitle={t('courseBuilder.form.uploading')} />
          ))}
        </Card>
      )}
    </Stack>
  );
}
