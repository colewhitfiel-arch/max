import { AppLayout, Button, ErrorState, PageHeader, Screen, Spinner, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { DevLoginForm } from '@/features/dev-login';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { config } from '@/shared/config';
import { useMaxBridge } from '@/shared/max';

/**
 * Куда вернуться после входа: путь, с которого увёл `RequireAuth` (`state.from`) — например,
 * ссылка-приглашение родителя `/invite/:token` (F14). Только внутренние пути, не сама `/auth`.
 */
function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/auth') ? from : '/';
}

/** `/auth`: dev — демо-пользователи; max — автовход по launch-параметрам и ошибка при неудаче. */
export function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const { status, error, loginMax } = useAuth();
  const bridge = useMaxBridge();
  const target = returnPath(location.state);

  if (status === 'authenticated') return <Navigate to={target} replace />;

  const retryMax = () => {
    let launchParams: string | null = null;
    try {
      launchParams = bridge.getLaunchParams();
    } catch {
      launchParams = null;
    }
    loginMax(launchParams)
      .then(() => navigate(target, { replace: true }))
      .catch(() => {});
  };

  return (
    <AppLayout
      header={
        <PageHeader
          title={t('login.title')}
          subtitle={config.authMode === 'dev' ? t('login.subtitle') : undefined}
        />
      }
    >
      <AppLayout.Content>
        <Screen>
          {config.authMode === 'max' ? (
            error ? (
              <ErrorState
                title={t('login.maxFailed')}
                description={describeApiError(error)}
                onRetry={retryMax}
              />
            ) : (
              <Stack gap={3} align="center">
                <Spinner size="lg" />
                <Text weight="medium">{t('login.maxTitle')}</Text>
                <Text variant="caption" tone="muted">
                  {t('login.maxHint')}
                </Text>
              </Stack>
            )
          ) : (
            <DevLoginForm onLoggedIn={() => navigate(target, { replace: true })} />
          )}
          {config.isDev && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/dev/ui')}>
              UI Playground
            </Button>
          )}
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
