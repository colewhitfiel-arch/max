import type { AiText } from '@edu/contracts';
import { Card, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/shared/lib/dates';

/** Текст от ИИ или «готовится» (null — кэша ещё нет). */
export function AiTextCard({ title, value }: { title: string; value: AiText }) {
  const { t, i18n } = useTranslation('common');
  return (
    <Card>
      <Stack gap={1}>
        <Text variant="caption" tone="muted" weight="medium">
          {title}
          {value ? ` · ${formatDateTime(value.generatedAt, i18n.language)}` : ''}
        </Text>
        <Text tone={value ? 'default' : 'muted'}>{value ? value.text : t('states.aiPending')}</Text>
      </Stack>
    </Card>
  );
}
