import type { FileDto } from '@edu/contracts';
import { Button, Card, CloseIcon, IconButton, ListRow, Stack, Text, useToast } from '@edu/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadFile } from '@/entities/file';
import { describeApiError } from '@/shared/api/errors';

export interface SubmissionFilesProps {
  value: FileDto[];
  onChange: (files: FileDto[]) => void;
  disabled?: boolean;
}

/** Вложения к сдаче задания: фото решения, документ. Формат не ограничен (файлы не парсятся). */
export function SubmissionFiles({ value, onChange, disabled }: SubmissionFilesProps) {
  const { t } = useTranslation('student');
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  // Актуальный список: загрузка асинхронная, за это время файл могли убрать из формы.
  const valueRef = useRef(value);
  valueRef.current = value;

  const onPick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setUploading((prev) => [...prev, ...files.map((file) => file.name)]);
    for (const file of files) {
      try {
        const uploaded = await uploadFile({ file, purpose: 'SUBMISSION' });
        valueRef.current = [...valueRef.current, uploaded];
        onChange(valueRef.current);
      } catch (error) {
        toast.show({ tone: 'danger', title: `${file.name}: ${describeApiError(error)}` });
      } finally {
        setUploading((prev) => prev.filter((name) => name !== file.name));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (fileId: string) => {
    valueRef.current = valueRef.current.filter((file) => file.id !== fileId);
    onChange(valueRef.current);
  };

  return (
    <Stack gap={2} align="start">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={disabled}
        onChange={(event) => void onPick(event.target.files)}
      />
      <Button variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {t('assignments.files.add')}
      </Button>
      {(value.length > 0 || uploading.length > 0) && (
        <Card padding="none">
          {value.map((file) => (
            <ListRow
              key={file.id}
              title={file.fileName}
              right={
                <IconButton
                  aria-label={t('assignments.files.remove')}
                  disabled={disabled}
                  onClick={() => remove(file.id)}
                >
                  <CloseIcon />
                </IconButton>
              }
            />
          ))}
          {uploading.map((name) => (
            <ListRow key={name} title={name} subtitle={t('assignments.files.uploading')} />
          ))}
        </Card>
      )}
      {value.length === 0 && uploading.length === 0 && (
        <Text variant="caption" tone="muted">
          {t('assignments.files.hint')}
        </Text>
      )}
    </Stack>
  );
}
