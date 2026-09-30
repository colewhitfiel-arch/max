import { parseAttendanceQrValue } from '@edu/contracts';
import { Button, Field, Input, Sheet, Stack, Text } from '@edu/ui';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ManualCheckInSheetProps {
  open: boolean;
  onClose: () => void;
  /** Код занятия из вставленной ссылки. */
  onCode: (code: string) => void;
}

/**
 * Отметка без сканера (приложение открыто не в MAX): ученик вставляет ссылку из QR-кода,
 * которую преподаватель скопировал на экране кода. Ссылка живёт столько же, сколько код.
 */
export function ManualCheckInSheet({ open, onClose, onCode }: ManualCheckInSheetProps) {
  const { t } = useTranslation('student');
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const code = parseAttendanceQrValue(value);
    if (!code) {
      setInvalid(true);
      return;
    }
    setValue('');
    setInvalid(false);
    onCode(code);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('checkIn.manualTitle')}
      closeLabel={t('common:actions.close')}
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack gap={4}>
          <Text variant="small" tone="muted">
            {t('checkIn.manualHint')}
          </Text>
          <Field
            label={t('checkIn.manualLabel')}
            error={invalid ? t('checkIn.notOurCode') : undefined}
          >
            <Input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setInvalid(false);
              }}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Button type="submit" fullWidth disabled={value.trim() === ''}>
            {t('checkIn.manualSubmit')}
          </Button>
        </Stack>
      </form>
    </Sheet>
  );
}
