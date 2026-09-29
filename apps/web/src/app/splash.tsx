import { AppLayout, Screen, Spinner, Stack, Text } from '@edu/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Через столько показываем, что задержка — пробуждение стенда, а не зависание. */
const SLOW_START_AFTER_MS = 3000;

/** Экран загрузки до завершения bootstrap (проверка сессии). */
export function Splash() {
  const { t } = useTranslation('common');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    // Serverless-стенд и его база засыпают после паузы: первый запрос может занять несколько секунд
    const timer = setTimeout(() => setSlow(true), SLOW_START_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <AppLayout>
      <AppLayout.Content>
        <Screen fill>
          <Stack gap={3} align="center" justify="center" grow>
            <Spinner size="lg" label={t('app.loading')} />
            <Text tone="muted">{t('app.name')}</Text>
            {slow ? (
              <Text tone="muted" role="status">
                {t('app.slowStart')}
              </Text>
            ) : null}
          </Stack>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
