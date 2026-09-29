import { AppLayout, ErrorState, Screen } from '@edu/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { config } from '@/shared/config';
import { reportClientError } from './client-errors';

function describeRouteError(error: unknown): string | undefined {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim();
  if (error instanceof Error) return error.message;
  return error == null ? undefined : String(error);
}

/**
 * `errorElement` корня роутера: ошибка рендера страницы или падение `lazy()` (чанк не загрузился
 * после деплоя) → наш экран с перезагрузкой вместо встроенного экрана React Router.
 */
export function RouteErrorScreen() {
  const error = useRouteError();
  const { t } = useTranslation('common');
  useEffect(() => {
    console.error('[app] ошибка роута', error);
    reportClientError(config.apiUrl, 'render', error);
  }, [error]);
  return (
    <AppLayout>
      <AppLayout.Content>
        <Screen>
          <ErrorState
            title={t('errors.crashTitle')}
            description={describeRouteError(error)}
            onRetry={() => window.location.reload()}
            retryLabel={t('errors.reload')}
          />
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
