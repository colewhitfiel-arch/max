import { Button, SparkIcon, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { startDemoTour } from '../model/store';

/** Кнопка «Демонстрационный режим» на экране входа: запускает тур по всем ролям. */
export function StartDemoButton() {
  const { t } = useTranslation('demo');
  return (
    <Stack gap={2}>
      <Button size="lg" fullWidth leftIcon={<SparkIcon />} onClick={() => startDemoTour()}>
        {t('start.button')}
      </Button>
      <Text variant="caption" tone="muted" align="center">
        {t('start.hint')}
      </Text>
    </Stack>
  );
}
