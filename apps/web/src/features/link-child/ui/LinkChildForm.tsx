import { Button, Field, Input, Stack, useToast } from '@edu/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLinkChild } from '@/entities/student';
import { describeApiError, isApiClientError } from '@/shared/api/errors';

export interface LinkChildFormProps {
  onLinked?: (studentId: string) => void;
}

/** Привязка ребёнка по коду из его профиля → `POST /parent/children/link` (F9). */
export function LinkChildForm({ onLinked }: LinkChildFormProps) {
  const { t } = useTranslation('parent');
  const toast = useToast();
  const [code, setCode] = useState('');
  const link = useLinkChild();

  // Неизвестный код и уже привязанный ребёнок — ожидаемые ответы, а не «раздел в разработке».
  const errorText = (error: unknown) => {
    if (isApiClientError(error) && error.code === 'NOT_FOUND') return t('children.codeNotFound');
    if (isApiClientError(error) && error.code === 'CONFLICT') return t('children.alreadyLinked');
    return describeApiError(error);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || link.isPending) return;
    link.mutate(trimmed, {
      onSuccess: (result) => {
        toast.show({ tone: 'success', title: t('children.linked') });
        setCode('');
        onLinked?.(result.student.id);
      },
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={3}>
        <Field
          label={t('children.code')}
          required
          error={link.isError ? errorText(link.error) : undefined}
        >
          <Input
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              // Код исправляют — прежняя ошибка уже не про него.
              if (link.isError) link.reset();
            }}
            placeholder={t('children.codePlaceholder')}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Field>
        <Button type="submit" loading={link.isPending} disabled={!code.trim()} fullWidth>
          {t('children.link')}
        </Button>
      </Stack>
    </form>
  );
}
