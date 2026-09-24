import { AppLayout, Screen, Spinner, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';

/** Экран загрузки до завершения bootstrap (проверка сессии). */
export function Splash() {
  const { t } = useTranslation('common');
  return (
    <AppLayout>
      <AppLayout.Content>
        <Screen fill>
          <Stack gap={3} align="center" justify="center" grow>
            <Spinner size="lg" label={t('app.loading')} />
            <Text tone="muted">{t('app.name')}</Text>
          </Stack>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
