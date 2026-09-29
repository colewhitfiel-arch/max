import { AppLayout, Button, ErrorState, PageHeader, Screen, Spinner, Stack, Text } from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { StartDemoButton } from '@/features/demo-tour';
import { DevLoginForm } from '@/features/dev-login';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { effectiveAuthMode } from '@/shared/auth/store';
import { config } from '@/shared/config';
import { useMaxBridge } from '@/shared/max';

/**
 * Куда вернуться после входа: путь, с которого увёл `RequireAuth` (`state.from`) — например,
 * ссылка-приглашение родителя `/invite/:token` (F14). Только внутренние пути, не сама `/auth`.
 * Незавершённый онбординг ученика перехватывает `StudentShell`.
 */
function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/auth') ? from : '/';
}

/**
 * `/auth`: dev — демо-пользователи; max — автовход по launch-параметрам и ошибка при неудаче.
 * Сверху — «Демонстрационный режим»: тур по всем ролям для жюри (features/demo-tour).
 */
export function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const { status, error, loginMax } = useAuth();
  const bridge = useMaxBridge();
  const autoLoginRef = useRef(false);
  const target = returnPath(location.state);
  // `auto`: внутри MAX — вход по подписи, в браузере — демо-вход (один адрес работает везде).
  const authMode = effectiveAuthMode(bridge);

  const goToTarget = () => navigate(target, { replace: true });

  const retryMax = () => {
    let launchParams: string | null = null;
    try {
      launchParams = bridge.getLaunchParams();
    } catch {
      launchParams = null;
    }
    loginMax(launchParams)
      .then(goToTarget)
      .catch(() => {});
  };

  // max: после выхода (anonymous без ошибки) автовход сам не запустится — запускаем один раз.
  // Флаг защищает от двойного POST (StrictMode, повторные рендеры); ошибка его сбрасывает,
  // чтобы «Повторить» и следующий выход снова работали.
  const shouldAutoLogin = authMode === 'max' && status === 'anonymous' && !error;
  useEffect(() => {
    if (error) autoLoginRef.current = false;
    if (!shouldAutoLogin || autoLoginRef.current) return;
    autoLoginRef.current = true;
    retryMax();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoLogin, error]);

  if (status === 'authenticated') return <Navigate to={target} replace />;

  return (
    <AppLayout
      header={
        <PageHeader
          title={t('login.title')}
          subtitle={authMode === 'dev' ? t('login.subtitle') : undefined}
        />
      }
    >
      <AppLayout.Content>
        <Screen>
          {/* Демонстрационный режим — над всеми кнопками; пока идёт вход через MAX, не мешает. */}
          {(authMode !== 'max' || error) && <StartDemoButton />}
          {authMode === 'max' ? (
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
            <DevLoginForm onLoggedIn={goToTarget} />
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
