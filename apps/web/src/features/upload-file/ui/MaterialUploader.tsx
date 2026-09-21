import { type FileDto, MATERIAL_MIME_TYPES } from '@edu/contracts';
import { Button, Card, CloseIcon, IconButton, ListRow, Stack, Text, useToast } from '@edu/ui';
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Выбор и загрузка материалов курса (pdf/docx/txt/md) через presigned/local URL (F8). */
export function MaterialUploader({ value, onChange, disabled }: MaterialUploaderProps) {
  const { t } = useTranslation('teacher');
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);

  const onPick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setUploading((prev) => [...prev, ...files.map((f) => f.name)]);
    const uploaded: FileDto[] = [];
    for (const file of files) {
      try {
        uploaded.push(await uploadFile({ file, purpose: 'MATERIAL' }));
      } catch (error) {
        toast.show({ tone: 'danger', title: `${file.name}: ${describeApiError(error)}` });
      } finally {
        setUploading((prev) => prev.filter((name) => name !== file.name));
      }
    }
    if (uploaded.length > 0) onChange([...value, ...uploaded]);
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
              subtitle={formatSize(file.sizeBytes)}
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
          {uploading.map((name) => (
            <ListRow key={name} title={name} subtitle={t('courseBuilder.form.uploading')} />
          ))}
        </Card>
      )}
    </Stack>
  );
}
